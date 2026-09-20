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
  const headers=rows.shift()||[];
  for(const values of rows){const r:Row={};headers.forEach((h,i)=>r[h]=values[i]??"");out.push(r)}
  return out;
}

function clean(v:any){return String(v??"").trim()}
function pick(r:Row,...names:string[]){for(const n of names)if(r[n]!==undefined&&clean(r[n])!=="")return clean(r[n]);return ""}
function num(r:Row,...names:string[]){const raw=pick(r,...names);if(!raw)return 0;const direct=Number(raw);if(Number.isFinite(direct))return direct;const m=raw.match(/(\d+(?:\.\d+)?)$/);return m?Number(m[1]):0}
function dateValue(r:Row,...names:string[]){return pick(r,...names)}
function parseDate(s:string){const t=Date.parse(s);return Number.isFinite(t)?new Date(t):null}

async function scanCsv(bytes:Uint8Array,onRow:(row:Row,headers:string[])=>void,progress?:Progress){
  const decoder=new TextDecoder();
  let headers:string[]|null=null,row:string[]=[],cellStart=0,quoted=false;
  const emit=(end:number)=>{
    let s=decoder.decode(bytes.subarray(cellStart,end));
    if(s.length>=2&&s[0]=='"'&&s[s.length-1]=='"')s=s.slice(1,-1).replace(/""/g,'"');
    row.push(s);cellStart=end+1;
  };
  let rows=0;
  for(let i=0;i<bytes.length;i++){
    const c=bytes[i];
    if(c===34){if(quoted&&bytes[i+1]===34)i++;else quoted=!quoted}
    else if(c===44&&!quoted){emit(i)}
    else if((c===10||c===13)&&!quoted){
      if(c===13&&bytes[i+1]===10)i++;
      emit(i);
      if(!headers)headers=row;
      else if(row.length&&row.some(Boolean)){const r:Row={};headers.forEach((h,j)=>r[h]=row[j]??"");onRow(r,headers);rows++;if(progress&&rows%100000===0)progress(`Scanned ${rows.toLocaleString()} rows…`)}
      row=[];cellStart=i+1;
    }
  }
  if(cellStart<bytes.length||row.length){emit(bytes.length);if(!headers)headers=row;else if(row.length&&row.some(Boolean)){const r:Row={};headers.forEach((h,j)=>r[h]=row[j]??"");onRow(r,headers)}}
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

function entry(zip:Record<string,Uint8Array>,re:RegExp){const k=Object.keys(zip).find(x=>re.test(x));return k?zip[k]:null}
function requiredEntry(zip:Record<string,Uint8Array>,name:string){const b=entry(zip,new RegExp(`(^|/)${name.replace(".","\\.")}$`,"i"));if(!b)throw new Error(`ZIP is missing ${name}.`);return b}

const REQUIRED_LATEST_WEEK = "2026-09-19";

async function importCompactDatasetZip(sb:SupabaseClient,zip:Record<string,Uint8Array>,progress:Progress){
  const brandBytes=entry(zip,/(^|[/_])brands\.csv$/i);
  const retailerBytes=entry(zip,/(^|[/_])retailers\.csv$/i);
  const productBytes=entry(zip,/(^|[/_])products\.csv$/i);
  const categoryBytes=entry(zip,/(^|[/_])categories\.csv$/i);
  const regionBytes=entry(zip,/(^|[/_])(regions|locations)\.csv$/i);
  const brandWeekBytes=entry(zip,/brand_weekly\.csv$/i);
  const categoryWeekBytes=entry(zip,/category_weekly\.csv$/i);
  const retailerWeekBytes=entry(zip,/retailer_weekly\.csv$/i);
  const brandCategoryBytes=entry(zip,/brand_category_weekly\.csv$/i);
  const competitorBytes=entry(zip,/competitor_weekly\.csv$/i);
  const brandRetailerBytes=entry(zip,/brand_retailer_weekly\.csv$/i);
  const productWeekBytes=entry(zip,/product_weekly\.csv$/i);
  if(!brandBytes||!retailerBytes||!productBytes||!brandWeekBytes||!categoryWeekBytes||!retailerWeekBytes)
    throw new Error("Unsupported CPGist Free Dataset: brands, retailers, products and the core weekly aggregate CSVs are required.");

  progress("Reading master dimensions…");
  const brands=parseSmall(brandBytes).map(r=>({id:num(r,"id","brand_id"),name:pick(r,"name","brand_name"),category:pick(r,"category","category_name")||null,parent_company:pick(r,"parent_company","parent_company_name")||null,home_regions:pick(r,"home_regions","home_region","region")||null,portfolio:pick(r,"portfolio","portfolio_name")||null})).filter(x=>x.id&&x.name);
  const retailers=parseSmall(retailerBytes).map(r=>({id:num(r,"id","retailer_id"),name:pick(r,"name","retailer_name"),channel:pick(r,"channel","channel_name","channel_id")||null,region:pick(r,"region","region_name")||null,retailer_group:pick(r,"retailer_group","retailer_group_name","group_name","retailer_group_id")||null,total_stores:num(r,"total_stores","store_count")})).filter(x=>x.id&&x.name);
  const products=parseSmall(productBytes).map(r=>({id:num(r,"id","product_id","sku_id"),brand_id:num(r,"brand_id"),name:pick(r,"name","product_name","sku_name")||"Unnamed product",sku:pick(r,"sku","sku_code","product_code")||null,category:pick(r,"category","category_name")||null,subcategory:pick(r,"subcategory","subcategory_name")||null,size:pick(r,"size","pack_size")||null,pack_count:num(r,"pack_count")})).filter(x=>x.id&&x.name);
  const categories=categoryBytes?parseSmall(categoryBytes).map(r=>({id:num(r,"id","category_id"),name:pick(r,"name","category_name"),parent_category:pick(r,"parent_category","parent_category_name")||null,subcategory_count:num(r,"subcategory_count")})).filter(x=>x.id&&x.name):[];
  if(categoryBytes){const cr=parseSmall(categoryBytes);const counts=new Map<number,number>();for(const r of cr){const id=num(r,"id","category_id");if(id)counts.set(id,(counts.get(id)||0)+1)}for(const x of categories)x.subcategory_count=counts.get(x.id)||x.subcategory_count||0;}
  const regions=regionBytes?parseSmall(regionBytes).map(r=>({id:num(r,"id","region_id","location_id"),name:pick(r,"name","region_name","location_name")||[pick(r,"city"),pick(r,"market")].filter(Boolean).join(" — "),country:pick(r,"country","country_name")||null,region_group:pick(r,"region_group","region_group_name","region")||null})).filter(x=>x.id&&x.name):[];
  if(!brands.length||!retailers.length||!products.length)throw new Error("Dataset master dimensions are empty.");
  progress(`Validated ${brands.length.toLocaleString()} brands · ${retailers.length.toLocaleString()} retailers · ${products.length.toLocaleString()} products.`);

  await upsertBatches(sb,"cpgist_brands",brands,"id",progress);
  await upsertBatches(sb,"cpgist_retailers",retailers,"id",progress);
  await upsertBatches(sb,"cpgist_products",products,"id",progress);
  if(categories.length)await upsertBatches(sb,"cpgist_categories",categories,"id",progress);
  if(regions.length)await upsertBatches(sb,"cpgist_regions",regions,"id",progress);

  const brandRows:any[]=[],categoryRows:any[]=[],retailerRows:any[]=[],brandCategoryRows:any[]=[],competitorRows:any[]=[];
  await scanCsv(brandWeekBytes,r=>brandRows.push({brand_id:num(r,"brand_id"),week_ending:dateValue(r,"week_ending","period","week"),category:pick(r,"category","category_name")||null,sales:num(r,"sales","dollar_sales","sales_value"),units:num(r,"units","volume_units"),distribution:num(r,"distribution","acv_distribution","weighted_distribution"),avg_price:num(r,"avg_price","price","average_price")||null,promo_rate:num(r,"promo_rate","promo_rate_pct","promotion_rate")||null}),progress);
  await scanCsv(categoryWeekBytes,r=>categoryRows.push({category:pick(r,"category","category_name"),week_ending:dateValue(r,"week_ending","period","week"),sales:num(r,"sales","dollar_sales","sales_value"),units:num(r,"units","volume_units"),distribution:num(r,"distribution","acv_distribution","weighted_distribution")}),progress);
  await scanCsv(retailerWeekBytes,r=>retailerRows.push({retailer_id:num(r,"retailer_id","id"),week_ending:dateValue(r,"week_ending","period","week"),sales:num(r,"sales","dollar_sales","sales_value"),units:num(r,"units","volume_units"),distribution:num(r,"distribution","acv_distribution","weighted_distribution")}),progress);
  if(brandCategoryBytes)await scanCsv(brandCategoryBytes,r=>brandCategoryRows.push({brand_id:num(r,"brand_id"),category:pick(r,"category","category_name"),week_ending:dateValue(r,"week_ending","period","week"),sales:num(r,"sales","dollar_sales","sales_value","brand_dollar_sales"),units:num(r,"units","volume_units","brand_units"),distribution:num(r,"distribution","acv_distribution","weighted_distribution")}),progress);
  if(competitorBytes)await scanCsv(competitorBytes,r=>competitorRows.push({brand_id:num(r,"brand_id"),competitor_id:num(r,"competitor_id","competitor_brand_id"),week_ending:dateValue(r,"week_ending","period","week"),category:pick(r,"category","category_name")||null,sales:num(r,"sales","dollar_sales","sales_value"),units:num(r,"units","volume_units"),price:num(r,"price","avg_price","average_price")||null,share:num(r,"share","market_share","share_pct")||null}),progress);

  const periods=[...new Set(brandRows.map(r=>r.week_ending).filter(Boolean))].sort();
  if(periods.length<13)throw new Error(`Only ${periods.length} weekly periods were found; at least 13 are required.`);
  const periodEnd=periods.at(-1)!;
  if(periodEnd !== REQUIRED_LATEST_WEEK){
    throw new Error(`Dataset freshness check failed. Expected the latest completed weekly period to be ${REQUIRED_LATEST_WEEK}, but the package ends at ${periodEnd}. Please use the current CPGist_Supabase_Free_Dataset.zip.`);
  }
  const cutoff=periods[Math.max(0,periods.length-13)];
  const latest13=new Set(periods.slice(-13));
  progress(`Source coverage: ${periods[0]} → ${periodEnd} (${periods.length} weeks). Using ${cutoff} → ${periodEnd} for client summaries.`);

  await upsertBatches(sb,"cpgist_brand_weekly",brandRows,"brand_id,week_ending",progress);
  await upsertBatches(sb,"cpgist_category_weekly",categoryRows,"category,week_ending",progress);
  await upsertBatches(sb,"cpgist_retailer_weekly",retailerRows,"retailer_id,week_ending",progress);
  if(brandCategoryRows.length)await upsertBatches(sb,"cpgist_brand_category_weekly",brandCategoryRows,"brand_id,category,week_ending",progress);
  if(competitorRows.length)await upsertBatches(sb,"cpgist_competitor_weekly",competitorRows,"brand_id,competitor_id,week_ending",progress);

  // Keep product and account detail useful without trying to put the raw product×retailer×week cube into a 500 MB database.
  // The ZIP remains the source archive; Postgres receives client-ready 13-week summaries.
  const productMap=new Map<number,{brand_id:number}>(products.map(p=>[p.id,{brand_id:p.brand_id}]));
  const productAgg=new Map<number,any>();
  const retailerAgg=new Map<string,any>();
  if(productWeekBytes){
    await scanCsv(productWeekBytes,r=>{
      const w=dateValue(r,"week_ending","period","week"),pid=num(r,"product_id","id","sku_id"),rid=num(r,"retailer_id","id");
      if(!pid||!latest13.has(w))return;
      const p=productMap.get(pid);if(!p)return;
      const x=productAgg.get(pid)||{product_id:pid,brand_id:p.brand_id,period_end:periodEnd,sales_13w:0,units_13w:0,price_sum:0,price_n:0,dist_sum:0,dist_n:0,promo_sum:0,promo_n:0};
      const sales=num(r,"sales","dollar_sales","sales_value"),units=num(r,"units","volume_units"),price=num(r,"price","avg_price","average_price"),dist=num(r,"distribution","acv_distribution","weighted_distribution"),promo=num(r,"promo_rate","promo_rate_pct","promotion_rate");
      x.sales_13w+=sales;x.units_13w+=units;if(price){x.price_sum+=price;x.price_n++}if(dist){x.dist_sum+=dist;x.dist_n++}if(promo){x.promo_sum+=promo;x.promo_n++};productAgg.set(pid,x);
      if(rid){
        const k=p.brand_id+"|"+rid,xr=retailerAgg.get(k)||{brand_id:p.brand_id,retailer_id:rid,category:pick(r,"category","category_name")||products.find(z=>z.id===pid)?.category||null,period_end:periodEnd,sales_13w:0,units_13w:0,price_sum:0,price_n:0,dist_sum:0,dist_n:0,promo_sum:0,promo_n:0};
        xr.sales_13w+=sales;xr.units_13w+=units;if(price){xr.price_sum+=price;xr.price_n++}if(dist){xr.dist_sum+=dist;xr.dist_n++}if(promo){xr.promo_sum+=promo;xr.promo_n++};retailerAgg.set(k,xr);
      }
    },progress);
  }

  const productSummary=[...productAgg.values()].map(x=>({product_id:x.product_id,brand_id:x.brand_id,period_end:x.period_end,sales_13w:x.sales_13w,units_13w:x.units_13w,avg_price_13w:x.price_n?x.price_sum/x.price_n:null,distribution_13w:x.dist_n?x.dist_sum/x.dist_n:null,promo_rate_13w:x.promo_n?x.promo_sum/x.promo_n:null}));
  const brandRetailerSummary=[...retailerAgg.values()].map(x=>({brand_id:x.brand_id,retailer_id:x.retailer_id,category:x.category,period_end:x.period_end,sales_13w:x.sales_13w,units_13w:x.units_13w,avg_price_13w:x.price_n?x.price_sum/x.price_n:null,distribution_13w:x.dist_n?x.dist_sum/x.dist_n:null,promo_rate_13w:x.promo_n?x.promo_sum/x.promo_n:null}));
  if(productSummary.length)await upsertBatches(sb,"cpgist_product_summary",productSummary,"product_id",progress);
  if(brandRetailerSummary.length)await upsertBatches(sb,"cpgist_brand_retailer_summary",brandRetailerSummary,"brand_id,retailer_id",progress);

  // Do not import the raw product_weekly or brand_retailer_weekly cubes. They are intentionally too large for the Free Postgres quota.
  // Verify the actual persisted dataset before declaring success.
  const checks=await Promise.all([
    sb.from("cpgist_brands").select("id",{count:"exact",head:true}),
    sb.from("cpgist_products").select("id",{count:"exact",head:true}),
    sb.from("cpgist_brand_weekly").select("brand_id",{count:"exact",head:true})
  ]);
  const bad=checks.find(x=>x.error);
  if(bad?.error)throw new Error(`Import verification failed: ${bad.error.message}`);
  const [bCount,pCount,bwCount]=checks.map(x=>x.count||0);
  if(!bCount||!pCount||!bwCount)throw new Error("Import verification failed: the compact tables are still empty. Check Supabase RLS/write access and retry.");
  progress(`Verified live database: ${bCount.toLocaleString()} brands · ${pCount.toLocaleString()} products · ${bwCount.toLocaleString()} brand-week rows.`);

  return {type:"compact",csvFiles:csvCount,brands:brands.length,retailers:retailers.length,products:products.length,categories:categories.length,regions:regions.length,brandWeeks:brandRows.length,categoryWeeks:categoryRows.length,retailerWeeks:retailerRows.length,productWeeks:productSummary.length,brandRetailerSummary:brandRetailerSummary.length,periods:periods.length,periodStart:periods[0],periodEnd};
}

export async function importDatasetZip(sb:SupabaseClient,file:File,progress:Progress){
  if(!file.name.toLowerCase().endsWith(".zip"))throw new Error("Please select a CPGist dataset ZIP file.");
  if(file.size>100*1024*1024)throw new Error("The CPGist Free Dataset ZIP must be 100 MB or smaller for browser import.");
  progress(`Reading ${file.name}…`);
  let zip:Record<string,Uint8Array>;
  try{zip=unzipSync(new Uint8Array(await file.arrayBuffer()))}catch(e:any){throw new Error(`Could not read ZIP: ${e?.message||"invalid archive"}`)}
  const names=Object.keys(zip);
  const csvCount=names.filter(n=>/\\.csv$/i.test(n)).length;
  if(names.some(n=>/brand_weekly\.csv$/i.test(n))&&names.some(n=>/category_weekly\.csv$/i.test(n)))
    return importCompactDatasetZip(sb,zip,progress);
  throw new Error("This is not the CPGist Free Dataset package. Expected brand_weekly.csv and category_weekly.csv were not found.");
}
