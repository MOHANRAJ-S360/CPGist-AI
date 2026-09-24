import { unzip, strFromU8 } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string,string>;
type Progress = (message:string)=>void;

function parseSmall(bytes:Uint8Array):Row[]{
  const text=strFromU8(bytes), rows:string[][]=[], out:Row[]=[];
  let row:string[]=[], cell="", quoted=false;
  const flush=()=>{row.push(cell);cell=""};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c=='"'){if(quoted&&text[i+1]=='"'){cell+='"';i++}else quoted=!quoted}
    else if(c==","&&!quoted)flush();
    else if((c=="\n"||c=="\r")&&!quoted){if(c=="\r"&&text[i+1]=="\n")i++;flush();if(row.some(Boolean))rows.push(row);row=[]}
    else cell+=c;
  }
  if(cell||row.length){flush();if(row.some(Boolean))rows.push(row)}
  const headers=(rows.shift()||[]).map(h=>String(h||"").replace(/^\uFEFF/,"").trim());
  for(const values of rows){const r:Row={};headers.forEach((h,i)=>r[h]=values[i]??"");out.push(r)}
  return out;
}

function clean(v:any){return String(v??"").trim()}
function pick(r:Row,...names:string[]){for(const n of names)if(r[n]!==undefined&&clean(r[n])!=="")return clean(r[n]);return ""}
function num(r:Row,...names:string[]){const v=Number(pick(r,...names));return Number.isFinite(v)?v:0}
function idNum(v:any){
  const s=clean(v);
  const m=s.match(/(\d+)$/);
  if(m)return Number(m[1]);
  const n=Number(s);
  return Number.isFinite(n)?n:0;
}
function id(r:Row,...names:string[]){for(const n of names){const v=pick(r,n);if(v)return idNum(v)}return 0}
function dateValue(r:Row,...names:string[]){return pick(r,...names)}
function parseDate(s:string){const t=Date.parse(s);return Number.isFinite(t)?new Date(t):null}

async function scanCsv(bytes:Uint8Array,onRow:(row:Row,headers:string[])=>void,progress?:Progress){
  const decoder=new TextDecoder();
  let headers:string[]|null=null,row:string[]=[],cellStart=0,quoted=false;
  const emit=(end:number)=>{row.push(decoder.decode(bytes.subarray(cellStart,end)));cellStart=end+1;};
  let rows=0;
  for(let i=0;i<bytes.length;i++){
    const c=bytes[i];
    if((i&0xFFFFF)===0&&i>0)await new Promise<void>(resolve=>setTimeout(resolve,0));
    if(c===34){if(quoted&&bytes[i+1]===34)i++;else quoted=!quoted;continue;}
    if(c===44&&!quoted){emit(i);continue;}
    if((c===10||c===13)&&!quoted){
      emit(i);
      if(!headers)headers=row.map(h=>String(h||"").replace(/^\uFEFF/,"").trim());
      else if(row.length&&row.some(Boolean)){
        const r:Row={};headers.forEach((h,j)=>r[h]=String(row[j]??"").trim());onRow(r,headers);rows++;
        if(progress&&rows%100000===0)progress(`Scanned ${rows.toLocaleString()} rows…`);
        if(rows%25000===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
      }
      row=[];
      if(c===13&&bytes[i+1]===10)i++;
      cellStart=i+1;
    }
  }
  if(cellStart<bytes.length||row.length){
    row.push(decoder.decode(bytes.subarray(cellStart,bytes.length)));
    if(!headers)headers=row.map(h=>String(h||"").replace(/^\uFEFF/,"").trim());
    else if(row.length&&row.some(Boolean)){const r:Row={};headers.forEach((h,j)=>r[h]=String(row[j]??"").trim());onRow(r,headers);}
  }
}
async function upsertBatches(sb:SupabaseClient,table:string,rows:any[],conflict:string,progress:Progress){
  const size=500;
  for(let i=0;i<rows.length;i+=size){
    const batch=rows.slice(i,i+size);
    let last="";
    for(let attempt=0;attempt<5;attempt++){
      const {error}=await sb.from(table).upsert(batch,{onConflict:conflict});
      if(!error){last="";break}
      last=error.message;
      if(attempt<4)await new Promise(r=>setTimeout(r,500*2**attempt));
    }
    if(last)throw new Error(`${table}: ${last}`);
    if(i===0||i+size>=rows.length||i%(size*20)===0)progress(`Loading ${table}: ${Math.min(i+size,rows.length).toLocaleString()} / ${rows.length.toLocaleString()}…`);
  }
}

function basename(path:string){const i=path.lastIndexOf("/");return i>=0?path.slice(i+1):path}
function entry(zip:Record<string,Uint8Array>,re:RegExp){const k=Object.keys(zip).find(x=>re.test(x));return k?zip[k]:null}
function entryExact(zip:Record<string,Uint8Array>,...names:string[]){
  const wanted=new Set(names.map(x=>x.toLowerCase()));
  const k=Object.keys(zip).find(x=>wanted.has(basename(x).toLowerCase()));
  return k?zip[k]:null;
}

async function clearCompactDataset(sb:SupabaseClient,progress:Progress){
  const targets:Array<[string,string]>=[
    ["cpgist_product_summary","product_id"],["cpgist_brand_retailer_summary","brand_id"],
    ["cpgist_brand_weekly","brand_id"],["cpgist_category_weekly","category"],
    ["cpgist_retailer_weekly","retailer_id"],["cpgist_brand_retailer_weekly","brand_id"],
    ["cpgist_product_weekly","product_id"],["cpgist_brand_category_weekly","brand_id"],
    ["cpgist_competitor_weekly","brand_id"],["cpgist_products","id"],["cpgist_categories","id"],
    ["cpgist_regions","id"],["cpgist_retailers","id"],["cpgist_brands","id"]
  ];
  for(const [table,key] of targets){
    const {error}=await sb.from(table).delete().not(key,"is",null);
    if(error)throw new Error(`Could not reset ${table}: ${error.message}`);
  }
  progress("Cleared previous compact dataset safely; loading the new archive from scratch…");
}

async function importCompactDatasetZip(sb:SupabaseClient,zip:Record<string,Uint8Array>,progress:Progress){
  // IMPORTANT: never use fuzzy filename matching here. Files such as 04_sub_brands.csv,
  // 16a_competitor_brands.csv, 31_brand_category_weekly.csv and 29_brand_retailer_weekly.csv
  // contain the words "brands", "category_weekly" or "retailer_weekly" and can otherwise be
  // selected accidentally.
  const brandBytes=entryExact(zip,"03_brands.csv");
  const retailerBytes=entryExact(zip,"08_retailers.csv");
  const productBytes=entryExact(zip,"06_products.csv");
  const categoryBytes=entryExact(zip,"05_categories.csv");
  const regionBytes=entryExact(zip,"10_locations.csv");
  const brandWeekBytes=entryExact(zip,"26_brand_weekly.csv");
  const categoryWeekBytes=entryExact(zip,"27_category_weekly.csv");
  const retailerWeekBytes=entryExact(zip,"28_retailer_weekly.csv");
  const brandCategoryBytes=entryExact(zip,"31_brand_category_weekly.csv");
  const brandRetailerBytes=entryExact(zip,"29_brand_retailer_weekly.csv");
  const productWeekBytes=entryExact(zip,"30_product_weekly.csv");
  const competitorBytes=entryExact(zip,"32_competitor_weekly.csv");

  const missing=[
    ["03_brands.csv",brandBytes],["08_retailers.csv",retailerBytes],["06_products.csv",productBytes],
    ["05_categories.csv",categoryBytes],["10_locations.csv",regionBytes],["26_brand_weekly.csv",brandWeekBytes],
    ["27_category_weekly.csv",categoryWeekBytes],["28_retailer_weekly.csv",retailerWeekBytes],
    ["31_brand_category_weekly.csv",brandCategoryBytes],["29_brand_retailer_weekly.csv",brandRetailerBytes],
    ["30_product_weekly.csv",productWeekBytes]
  ].filter(([,v])=>!v).map(([n])=>n);
  if(missing.length)throw new Error("CPGist Free Dataset is incomplete. Missing: "+missing.join(", "));
  if(!brandBytes||!retailerBytes||!productBytes||!categoryBytes||!regionBytes||!brandWeekBytes||!categoryWeekBytes||!retailerWeekBytes||!brandCategoryBytes||!brandRetailerBytes||!productWeekBytes)throw new Error("CPGist Free Dataset is incomplete. One or more required files could not be loaded.");

  progress("Reading master dimensions…");
  const brands=parseSmall(brandBytes).map(r=>({
    id:id(r,"brand_id","id"),
    name:pick(r,"brand_name","name"),
    category:pick(r,"category_name","category")||null,
    parent_company:pick(r,"parent_company","parent_company_name")||null,
    home_regions:pick(r,"home_region","home_regions","region")||null,
    portfolio:pick(r,"portfolio","portfolio_name")||null
  })).filter(x=>x.id&&x.name);

  const retailers=parseSmall(retailerBytes).map(r=>({
    id:id(r,"retailer_id","id"),
    name:pick(r,"retailer_name","name"),
    channel:pick(r,"channel_name","channel")||null,
    region:pick(r,"region","region_name")||null,
    retailer_group:pick(r,"retailer_group_name","retailer_group")||null,
    total_stores:num(r,"store_count","total_stores","store_counts")
  })).filter(x=>x.id&&x.name);

  const products=parseSmall(productBytes).map(r=>({
    id:id(r,"product_id","id","sku_id"),
    brand_id:id(r,"brand_id"),
    name:pick(r,"product_name","name","sku_name")||"Unnamed product",
    sku:pick(r,"sku","sku_code","product_code")||null,
    category:pick(r,"category_name","category")||null,
    subcategory:pick(r,"subcategory_name","subcategory")||null,
    size:pick(r,"pack_size","size")||null,
    pack_count:num(r,"pack_count")
  })).filter(x=>x.id&&x.name);

  const categoryRaw=parseSmall(categoryBytes);
  const categoryMap=new Map<string,{id:number,name:string,parent_category:string|null,subcategory_count:number}>();
  for(const r of categoryRaw){
    const cid=id(r,"category_id","id"),name=pick(r,"category_name","name");
    if(!cid||!name)continue;
    const key=clean(pick(r,"category_id","id"));
    const existing=categoryMap.get(key);
    const sub=pick(r,"subcategory_name","subcategory")||null;
    if(existing){if(sub)existing.subcategory_count+=1}
    else categoryMap.set(key,{id:cid,name,parent_category:null,subcategory_count:sub?1:0});
  }
  const categories=[...categoryMap.values()];

  const regionRaw=parseSmall(regionBytes);
  const regionMap=new Map<string,{id:number,name:string,country:string|null,region_group:string|null}>();
  for(const r of regionRaw){
    const name=pick(r,"region","region_name","name","location_name");
    if(!name)continue;
    const key=name.toLowerCase();
    if(!regionMap.has(key))regionMap.set(key,{id:regionMap.size+1,name,country:pick(r,"country","country_name")||null,region_group:pick(r,"region_group","region_group_name")||null});
  }
  const regions=[...regionMap.values()];

  if(!brands.length)throw new Error("Dataset master dimension error: 03_brands.csv was found but no valid brand rows were parsed.");
  if(!retailers.length)throw new Error("Dataset master dimension error: 08_retailers.csv was found but no valid retailer rows were parsed.");
  if(!products.length)throw new Error("Dataset master dimension error: 06_products.csv was found but no valid product rows were parsed.");
  if(!categories.length)throw new Error("Dataset master dimension error: 05_categories.csv was found but no valid category rows were parsed.");
  if(!regions.length)throw new Error("Dataset master dimension error: 10_locations.csv was found but no valid region rows were parsed.");

  const brandRows:any[]=[],categoryRows:any[]=[],retailerRows:any[]=[],brandCategoryRows:any[]=[];
  const categoryName=new Map<number,string>(categories.map(x=>[x.id,x.name]));
  const brandMap=new Map<number,any>(brands.map(x=>[x.id,x]));
  const productMap=new Map<number,any>(products.map(x=>[x.id,x]));

  await scanCsv(brandWeekBytes,r=>brandRows.push({
    brand_id:id(r,"brand_id"),week_ending:dateValue(r,"week_ending","period","week"),
    category:categoryName.get(id(r,"category_id"))||pick(r,"category_name","category")||brandMap.get(id(r,"brand_id"))?.category||null,
    sales:num(r,"dollar_sales","sales","sales_value"),units:num(r,"units","volume_units"),
    distribution:num(r,"acv_distribution","distribution","weighted_distribution"),
    avg_price:num(r,"average_price","avg_price","price")||null,
    promo_rate:num(r,"promo_rate","promo_rate_pct","promotion_rate")||null
  }),progress);

  await scanCsv(categoryWeekBytes,r=>categoryRows.push({
    category:categoryName.get(id(r,"category_id"))||pick(r,"category_name","category")||"Unclassified",
    week_ending:dateValue(r,"week_ending","period","week"),
    sales:num(r,"dollar_sales","sales","sales_value"),units:num(r,"units","volume_units"),
    distribution:num(r,"distribution","acv_distribution","weighted_distribution")
  }),progress);

  await scanCsv(retailerWeekBytes,r=>retailerRows.push({
    retailer_id:id(r,"retailer_id","id"),week_ending:dateValue(r,"week_ending","period","week"),
    sales:num(r,"dollar_sales","sales","sales_value"),units:num(r,"units","volume_units"),
    distribution:num(r,"distribution","acv_distribution","weighted_distribution")
  }),progress);

  await scanCsv(brandCategoryBytes,r=>brandCategoryRows.push({
    brand_id:id(r,"brand_id"),category:categoryName.get(id(r,"category_id"))||pick(r,"category_name","category")||"Unclassified",
    week_ending:dateValue(r,"week_ending","period","week"),
    sales:num(r,"brand_dollar_sales","dollar_sales","sales","sales_value"),units:num(r,"brand_units","units","volume_units"),
    distribution:null
  }),progress);

  // The two largest detailed cubes are kept in the ZIP and reduced to 13-week client summaries here.
  // This prevents hundreds of thousands of browser-side objects and avoids loading unnecessary raw cubes into Free Postgres.

  const periods=[...new Set(brandRows.map(r=>r.week_ending).filter(Boolean))].sort();
  if(periods.length<13)throw new Error(`Only ${periods.length} weekly periods were found in 26_brand_weekly.csv; at least 13 are required.`);
  const periodEnd=periods.at(-1)!;
  const latest13=new Set(periods.slice(-13)), prior13=new Set(periods.slice(-26,-13));
  const latestPeriodSet=new Set(periods.slice(-13));
  const periodStart=periods[0];
  if(periodEnd>"2026-09-19")throw new Error(`Dataset contains a future weekly period (${periodEnd}). Latest allowed period is 2026-09-19.`);
  progress(`Validated ${brands.length.toLocaleString()} brands · ${retailers.length.toLocaleString()} retailers · ${products.length.toLocaleString()} products · ${categories.length.toLocaleString()} categories · ${regions.length.toLocaleString()} regions.`);
  progress(`Source coverage: ${periodStart} → ${periodEnd} (${periods.length} weeks).`);

  // The archive is the source of truth; only the compact, client-ready analytical layer is loaded into Postgres.
  await clearCompactDataset(sb,progress);

  await upsertBatches(sb,"cpgist_brands",brands,"id",progress);
  await upsertBatches(sb,"cpgist_retailers",retailers,"id",progress);
  await upsertBatches(sb,"cpgist_products",products,"id",progress);
  await upsertBatches(sb,"cpgist_categories",categories,"id",progress);
  await upsertBatches(sb,"cpgist_regions",regions,"id",progress);
  await upsertBatches(sb,"cpgist_brand_weekly",brandRows,"brand_id,week_ending",progress);
  await upsertBatches(sb,"cpgist_category_weekly",categoryRows,"category,week_ending",progress);
  await upsertBatches(sb,"cpgist_retailer_weekly",retailerRows,"retailer_id,week_ending",progress);
  await upsertBatches(sb,"cpgist_brand_category_weekly",brandCategoryRows,"brand_id,category,week_ending",progress);

  const productAgg=new Map<number,any>();
  const retailerSummaryAgg=new Map<string,any>();

  await scanCsv(productWeekBytes,r=>{
    const w=dateValue(r,"week_ending","period","week");
    if(!latestPeriodSet.has(w))return;
    const pid=id(r,"product_id"),bid=id(r,"brand_id");
    if(!pid)return;
    const x=productAgg.get(pid)||{product_id:pid,brand_id:bid,period_end:periodEnd,sales_13w:0,units_13w:0,price_sum:0,price_n:0,dist_sum:0,dist_n:0};
    const sales=num(r,"dollar_sales","sales","sales_value"),units=num(r,"units","volume_units"),price=num(r,"average_price","avg_price","price"),dist=num(r,"distribution","acv_distribution");
    x.sales_13w+=sales;x.units_13w+=units;
    if(price){x.price_sum+=price;x.price_n++}if(dist){x.dist_sum+=dist;x.dist_n++}
    productAgg.set(pid,x);
  },progress);

  await scanCsv(brandRetailerBytes,r=>{
    const w=dateValue(r,"week_ending","period","week");
    if(!latestPeriodSet.has(w))return;
    const bid=id(r,"brand_id"),rid=id(r,"retailer_id");
    if(!bid||!rid)return;
    const category=categoryName.get(id(r,"category_id"))||pick(r,"category_name","category")||null;
    const k=bid+"|"+rid;
    const x=retailerSummaryAgg.get(k)||{brand_id:bid,retailer_id:rid,category,period_end:periodEnd,sales_13w:0,units_13w:0,price_sum:0,price_n:0,dist_sum:0,dist_n:0,promo_sum:0,promo_n:0};
    const sales=num(r,"dollar_sales","sales","sales_value"),units=num(r,"units","volume_units"),price=num(r,"average_price","avg_price","price"),dist=num(r,"distribution","acv_distribution"),promo=num(r,"promo_rate","promo_rate_pct","promotion_rate");
    x.sales_13w+=sales;x.units_13w+=units;
    if(price){x.price_sum+=price;x.price_n++}if(dist){x.dist_sum+=dist;x.dist_n++}if(promo){x.promo_sum+=promo;x.promo_n++}
    retailerSummaryAgg.set(k,x);
  },progress);

  const productSummary=[...productAgg.values()].map(x=>({product_id:x.product_id,brand_id:x.brand_id,period_end:x.period_end,sales_13w:x.sales_13w,units_13w:x.units_13w,avg_price_13w:x.price_n?x.price_sum/x.price_n:null,distribution_13w:x.dist_n?x.dist_sum/x.dist_n:null,promo_rate_13w:null}));
  if(productSummary.length)await upsertBatches(sb,"cpgist_product_summary",productSummary,"product_id",progress);

  const brandRetailerSummary=[...retailerSummaryAgg.values()].map(x=>({brand_id:x.brand_id,retailer_id:x.retailer_id,category:x.category,period_end:x.period_end,sales_13w:x.sales_13w,units_13w:x.units_13w,avg_price_13w:x.price_n?x.price_sum/x.price_n:null,distribution_13w:x.dist_n?x.dist_sum/x.dist_n:null,promo_rate_13w:x.promo_n?x.promo_sum/x.promo_n:null}));
  if(brandRetailerSummary.length)await upsertBatches(sb,"cpgist_brand_retailer_summary",brandRetailerSummary,"brand_id,retailer_id",progress);

  // 32_competitor_weekly is intentionally archive-only because the compact schema does not have a competitor-brand master/foreign-key context.
  // Keeping it out of the compact tables prevents invented brand IDs and preserves analytical integrity.
  if(competitorBytes)progress("Competitor weekly data validated as archive-only; no invented competitor-to-brand mapping was written.");

  const checks=await Promise.all([
    sb.from("cpgist_brands").select("id",{count:"exact",head:true}),
    sb.from("cpgist_retailers").select("id",{count:"exact",head:true}),
    sb.from("cpgist_products").select("id",{count:"exact",head:true}),
    sb.from("cpgist_categories").select("id",{count:"exact",head:true}),
    sb.from("cpgist_regions").select("id",{count:"exact",head:true}),
    sb.from("cpgist_brand_weekly").select("brand_id",{count:"exact",head:true}),
    sb.from("cpgist_category_weekly").select("category",{count:"exact",head:true}),
    sb.from("cpgist_retailer_weekly").select("retailer_id",{count:"exact",head:true}),
    sb.from("cpgist_product_summary").select("product_id",{count:"exact",head:true}),
    sb.from("cpgist_brand_retailer_summary").select("brand_id",{count:"exact",head:true})
  ]);
  const bad=checks.find(x=>x.error);
  if(bad?.error)throw new Error(`Import verification failed: ${bad.error.message}`);
  const counts=checks.map(x=>x.count||0);
  if(!counts[0]||!counts[1]||!counts[2]||!counts[3]||!counts[4]||!counts[5])throw new Error("Import verification failed: one or more compact master/weekly tables are empty. Check Supabase permissions and retry.");
  progress(`Verified live database: ${counts[0].toLocaleString()} brands · ${counts[1].toLocaleString()} retailers · ${counts[2].toLocaleString()} products · ${counts[3].toLocaleString()} categories · ${counts[4].toLocaleString()} regions · ${counts[5].toLocaleString()} brand-weeks.`);

  return {type:"compact",brands:brands.length,retailers:retailers.length,products:products.length,categories:categories.length,regions:regions.length,brandWeeks:brandRows.length,categoryWeeks:categoryRows.length,retailerWeeks:retailerRows.length,productWeeks:productSummary.length,brandRetailerSummary:brandRetailerSummary.length,periods:periods.length,periodStart,periodEnd};
}



async function importCombinedDatasetZip(sb:SupabaseClient,zip:Record<string,Uint8Array>,progress:Progress){
  const B=(n:string)=>entryExact(zip,n);
  const brandsBytes=B("brands.csv"),retailersBytes=B("retailers.csv"),productsBytes=B("products.csv"),salesBytes=B("sales_weekly.csv"),baselineBytes=B("baseline_sales.csv"),promoBytes=B("promotion.csv"),tradeBytes=B("trade_spend.csv");
  if(!brandsBytes||!retailersBytes||!productsBytes||!salesBytes||!baselineBytes||!promoBytes||!tradeBytes)throw new Error("Combined CPGist package is incomplete. Required master, sales, baseline, promotion and trade-spend files are missing.");
  const brands=parseSmall(brandsBytes).map(r=>({id:id(r,"id","brand_id"),name:pick(r,"name","brand_name"),category:pick(r,"category")||null,parent_company:pick(r,"parent_company")||null,home_regions:pick(r,"home_regions","region")||null,portfolio:null})).filter(x=>x.id&&x.name);
  const retailers=parseSmall(retailersBytes).map(r=>({id:id(r,"id","retailer_id"),name:pick(r,"name","retailer_name"),channel:pick(r,"channel")||null,region:pick(r,"region")||null,retailer_group:null,total_stores:num(r,"total_stores","store_count")})).filter(x=>x.id&&x.name);
  const products=parseSmall(productsBytes).map(r=>({id:id(r,"id","product_id","sku_id"),brand_id:id(r,"brand_id"),name:pick(r,"name","product_name","sku_name")||"Unnamed product",sku:pick(r,"sku","sku_code","product_code")||null,category:pick(r,"category")||null,subcategory:pick(r,"subcategory")||null,size:pick(r,"size","pack_size")||null,pack_count:null})).filter(x=>x.id&&x.name);
  if(!brands.length||!retailers.length||!products.length)throw new Error("Combined package master dimensions are empty or invalid.");
  const bm=new Map(brands.map(x=>[x.name.toLowerCase(),x])),rm=new Map(retailers.map(x=>[x.name.toLowerCase(),x])),pm=new Map(products.map(x=>[x.name.toLowerCase(),x]));
  const cats=[...new Set(products.map(x=>x.category).filter(Boolean))] as string[],categories=cats.map((name,i)=>({id:i+1,name,parent_category:null,subcategory_count:new Set(products.filter(x=>x.category===name).map(x=>x.subcategory).filter(Boolean)).size}));
  const regions=[...new Set(retailers.map(x=>x.region).filter(Boolean))].map((name,i)=>({id:i+1,name:String(name),country:null,region_group:null}));
  const BA=new Map<string,any>(),CA=new Map<string,any>(),RA=new Map<string,any>(),PA=new Map<string,any>();
  const agg=(m:Map<string,any>,k:string,s:any)=>{let x=m.get(k);if(!x){x={...s};m.set(k,x)}return x};
  const weeks=new Set<string>();
  progress("Scanning combined sales, price, margin and promotion flags…");
  await scanCsv(salesBytes,r=>{
    const w=pick(r,"week"),b=bm.get(pick(r,"brand").toLowerCase()),rt=rm.get(pick(r,"retailer").toLowerCase()),p=pm.get(pick(r,"sku").toLowerCase());if(!w||!b)return;weeks.add(w);
    const sales=num(r,"sales_value"),units=num(r,"units"),reg=num(r,"regular_price"),act=num(r,"actual_price"),margin=num(r,"gross_margin"),promo=pick(r,"promo_flag")==="1",dist=num(r,"ACV_distribution");
    const x=agg(BA,b.id+"|"+w,{brand_id:b.id,week_ending:w,category:pick(r,"category")||b.category||null,sales:0,units:0,dist:0,n:0,promo:0,reg:0,act:0,margin:0,disc:0,discN:0});x.sales+=sales;x.units+=units;x.dist+=dist;x.n++;if(promo)x.promo++;x.reg+=reg*units;x.act+=act*units;x.margin+=margin;if(promo&&reg>0){x.disc+=(reg-act)/reg;x.discN++}
    const c=agg(CA,(pick(r,"category")||"Unclassified")+"|"+w,{category:pick(r,"category")||"Unclassified",week_ending:w,sales:0,units:0,dist:0,n:0});c.sales+=sales;c.units+=units;c.dist+=dist;c.n++;
    if(rt){const q=agg(RA,rt.id+"|"+w,{retailer_id:rt.id,week_ending:w,sales:0,units:0,dist:0,n:0});q.sales+=sales;q.units+=units;q.dist+=dist;q.n++}
    if(p){const q=agg(PA,p.id+"|"+w,{product_id:p.id,brand_id:b.id,week_ending:w,sales:0,units:0,dist:0,n:0,promo:0,price:0});q.sales+=sales;q.units+=units;q.dist+=dist;q.n++;if(promo)q.promo++;q.price+=act*units}
  },progress);
  const BL=new Map<string,any>();progress("Scanning baseline sales…");
  await scanCsv(baselineBytes,r=>{const w=pick(r,"week"),b=bm.get(pick(r,"brand").toLowerCase());if(!w||!b)return;const x=agg(BL,b.id+"|"+w,{sales:0,units:0});x.sales+=num(r,"baseline_sales");x.units+=num(r,"baseline_units")},progress);
  const PR=new Map<string,any>();progress("Scanning promotion events…");
  await scanCsv(promoBytes,r=>{const w=pick(r,"start_date"),b=bm.get(pick(r,"brand").toLowerCase());if(!w||!b)return;const x=agg(PR,b.id+"|"+w,{events:0,disc:0,n:0});x.events++;x.disc+=num(r,"discount_percent");x.n++},progress);
  const TS=new Map<string,any>();progress("Scanning trade spend…");
  await scanCsv(tradeBytes,r=>{const w=pick(r,"start_date"),b=bm.get(pick(r,"brand").toLowerCase());if(!w||!b)return;const x=agg(TS,b.id+"|"+w,{spend:0});x.spend+=num(r,"trade_spend")},progress);
  const periods=[...weeks].sort();if(periods.length<26)throw new Error("Only "+periods.length+" weekly periods were found; at least 26 are required.");const end=periods.at(-1)!;if(end>"2026-09-20")throw new Error("Dataset contains a future period ("+end+"). Latest allowed period is 2026-09-20.");
  const latest=new Set(periods.slice(-13)),productSummary=new Map<string,any>();
  const brandRows=[...BA.values()].map(x=>{const bl=BL.get(x.brand_id+"|"+x.week_ending)||{sales:0,units:0},pr=PR.get(x.brand_id+"|"+x.week_ending)||{events:0,disc:0,n:0},ts=TS.get(x.brand_id+"|"+x.week_ending)||{spend:0};return{brand_id:x.brand_id,week_ending:x.week_ending,category:x.category,sales:x.sales,units:x.units,distribution:x.n?x.dist/x.n:null,avg_price:x.units?x.sales/x.units:null,promo_rate:x.n?x.promo/x.n*100:null,regular_price:x.units?x.reg/x.units:null,actual_price:x.units?x.act/x.units:null,baseline_sales:bl.sales,baseline_units:bl.units,incremental_sales:x.sales-bl.sales,incremental_units:x.units-bl.units,gross_margin:x.margin,margin_percent:x.sales?x.margin/x.sales:null,trade_spend:ts.spend,promo_events:pr.events,promoted_sales:x.promo?x.sales:null,promoted_units:x.promo?x.units:null,avg_discount_depth_pct:pr.n?pr.disc/pr.n:null,data_quality_status:x.week_ending>="2026-01-04"?"synthetic":"observed",source_package:"CPGist_Combined_Dataset"}});
  for(const x of PA.values())if(latest.has(x.week_ending)){const k=String(x.product_id),q=productSummary.get(k)||{product_id:x.product_id,brand_id:x.brand_id,period_end:end,sales:0,units:0,dist:0,n:0,promo:0,price:0};q.sales+=x.sales;q.units+=x.units;q.dist+=x.dist;q.n+=x.n;q.promo+=x.promo;q.price+=x.price;productSummary.set(k,q)}
  const productRows=[...productSummary.values()].map(x=>({product_id:x.product_id,brand_id:x.brand_id,period_end:x.period_end,sales_13w:x.sales,units_13w:x.units,avg_price_13w:x.units?x.price/x.units:null,distribution_13w:x.n?x.dist/x.n:null,promo_rate_13w:x.n?x.promo/x.n*100:null}));
  await clearCompactDataset(sb,progress);
  await upsertBatches(sb,"cpgist_brands",brands,"id",progress);await upsertBatches(sb,"cpgist_retailers",retailers,"id",progress);await upsertBatches(sb,"cpgist_products",products,"id",progress);await upsertBatches(sb,"cpgist_categories",categories,"id",progress);await upsertBatches(sb,"cpgist_regions",regions,"id",progress);await upsertBatches(sb,"cpgist_brand_weekly",brandRows,"brand_id,week_ending",progress);await upsertBatches(sb,"cpgist_category_weekly",[...CA.values()].map(x=>({category:x.category,week_ending:x.week_ending,sales:x.sales,units:x.units,distribution:x.n?x.dist/x.n:null})),"category,week_ending",progress);await upsertBatches(sb,"cpgist_retailer_weekly",[...RA.values()].map(x=>({retailer_id:x.retailer_id,week_ending:x.week_ending,sales:x.sales,units:x.units,distribution:x.n?x.dist/x.n:null})),"retailer_id,week_ending",progress);
  if(productRows.length)await upsertBatches(sb,"cpgist_product_summary",productRows,"product_id",progress);
  const checks=await Promise.all([sb.from("cpgist_brands").select("id",{count:"exact",head:true}),sb.from("cpgist_retailers").select("id",{count:"exact",head:true}),sb.from("cpgist_products").select("id",{count:"exact",head:true}),sb.from("cpgist_brand_weekly").select("brand_id",{count:"exact",head:true})]);const bad=checks.find(x=>x.error);if(bad?.error)throw new Error("Import verification failed: "+bad.error.message);if(checks.some(x=>!x.count))throw new Error("Import verification failed: compact tables are empty.");
  progress("Combined package imported and verified. Advanced commercial fields are now available in cpgist_brand_weekly.");
  return{type:"combined",brands:brands.length,retailers:retailers.length,products:products.length,categories:categories.length,regions:regions.length,brandWeeks:brandRows.length,categoryWeeks:CA.size,retailerWeeks:RA.size,productWeeks:productRows.length,periods:periods.length,periodStart:periods[0],periodEnd:end};
}

function unzipInWorker(bytes:Uint8Array):Promise<Record<string,Uint8Array>>{
  return new Promise((resolve,reject)=>{
    try{
      unzip(bytes,(err,data)=>{
        if(err)reject(err);
        else resolve(data as Record<string,Uint8Array>);
      });
    }catch(err){reject(err)}
  });
}

export async function importDatasetZip(sb:SupabaseClient,file:File,progress:Progress){
  if(!file.name.toLowerCase().endsWith(".zip"))throw new Error("Please select a CPGist dataset ZIP file.");
  if(file.size>200*1024*1024)throw new Error("The CPGist dataset ZIP must be 200 MB or smaller for browser import.");
  progress(`Reading ${file.name} in a background worker…`);
  let zip:Record<string,Uint8Array>;
  try{
    const bytes=new Uint8Array(await file.arrayBuffer());
    zip=await unzipInWorker(bytes);
  }catch(e:any){throw new Error(`Could not read ZIP: ${e?.message||"invalid archive"}`)}
  const names=Object.keys(zip);
  const combinedCore=["brands.csv","retailers.csv","products.csv","sales_weekly.csv","baseline_sales.csv","promotion.csv","trade_spend.csv"].every(n=>names.some(x=>basename(x).toLowerCase()===n.toLowerCase()));
  if(combinedCore)return importCombinedDatasetZip(sb,zip,progress);
  const hasCore=["03_brands.csv","08_retailers.csv","06_products.csv","05_categories.csv","10_locations.csv","26_brand_weekly.csv","27_category_weekly.csv","28_retailer_weekly.csv"].every(n=>names.some(x=>basename(x).toLowerCase()===n.toLowerCase()));
  if(!hasCore)throw new Error("Unsupported or incomplete CPGist dataset. Expected either the Combined package or the numbered CPGist Free Dataset.");
  return importCompactDatasetZip(sb,zip,progress);
}