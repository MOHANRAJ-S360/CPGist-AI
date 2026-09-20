import { unzipSync, strFromU8 } from "fflate";
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
    if(c===34){if(quoted&&bytes[i+1]===34)i++;else quoted=!quoted;continue;}
    if(c===44&&!quoted){emit(i);continue;}
    if((c===10||c===13)&&!quoted){
      emit(i);
      if(!headers)headers=row.map(h=>String(h||"").replace(/^\uFEFF/,"").trim());
      else if(row.length&&row.some(Boolean)){
        const r:Row={};headers.forEach((h,j)=>r[h]=String(row[j]??"").trim());onRow(r,headers);rows++;
        if(progress&&rows%100000===0)progress(`Scanned ${rows.toLocaleString()} rows…`);
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


export async function importDatasetZip(sb:SupabaseClient,file:File,progress:Progress){
  if(!file.name.toLowerCase().endsWith(".zip"))throw new Error("Please select a CPGist dataset ZIP file.");
  if(file.size>100*1024*1024)throw new Error("The CPGist Free Dataset ZIP must be 100 MB or smaller for browser import.");
  progress(`Reading ${file.name}…`);
  let zip:Record<string,Uint8Array>;
  try{zip=unzipSync(new Uint8Array(await file.arrayBuffer()))}catch(e:any){throw new Error(`Could not read ZIP: ${e?.message||"invalid archive"}`)}
  const names=Object.keys(zip);
  const hasCore=["03_brands.csv","08_retailers.csv","06_products.csv","05_categories.csv","10_locations.csv","26_brand_weekly.csv","27_category_weekly.csv","28_retailer_weekly.csv"].every(n=>names.some(x=>basename(x).toLowerCase()===n.toLowerCase()));
  if(!hasCore)throw new Error("Unsupported or incomplete CPGist Free Dataset. Expected the numbered master and weekly CSV files (03_brands.csv, 08_retailers.csv, 06_products.csv, 05_categories.csv, 10_locations.csv and 26–28 weekly aggregates).");
  return importCompactDatasetZip(sb,zip,progress);
}