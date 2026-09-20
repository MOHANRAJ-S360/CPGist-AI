import {unzipSync,strFromU8} from "fflate";
import type {SupabaseClient} from "@supabase/supabase-js";

type Row=Record<string,string>;
type Progress=(message:string)=>void;

function parseCsv(bytes:Uint8Array):Row[]{
 const text=strFromU8(bytes);let row:string[]=[],cell="",quoted=false;const rows:string[][]=[];
 const flush=()=>{row.push(cell);cell=""};
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
  else if(c===","&&!quoted)flush();
  else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;flush();if(row.some(Boolean))rows.push(row);row=[]}
  else cell+=c;
 }
 if(cell||row.length){flush();if(row.some(Boolean))rows.push(row)}
 const headers=(rows.shift()||[]).map(x=>x.trim());
 return rows.map(values=>{const r:Row={};headers.forEach((h,i)=>r[h]=values[i]??"");return r});
}
function header(bytes:Uint8Array){const s=strFromU8(bytes.subarray(0,Math.min(bytes.length,200000)));const line=s.split(/\r?\n/)[0]||"";let row:string[]=[],cell="",quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"')quoted=!quoted;else if(c===","&&!quoted){row.push(cell.trim().toLowerCase());cell=""}else cell+=c}row.push(cell.trim().toLowerCase());return row.filter(Boolean)}
function findFile(zip:Record<string,Uint8Array>,test:(h:string[])=>boolean){for(const [name,bytes] of Object.entries(zip)){if(!name.toLowerCase().endsWith(".csv"))continue;try{if(test(header(bytes)))return name}catch{}}return null}
function has(h:string[],...names:string[]){return names.some(n=>h.includes(n))}
function col(h:string[],...names:string[]){return names.map(n=>h.indexOf(n)).find(i=>i>=0)??-1}
function val(values:string[],i:number){return i>=0?values[i]??"":""}
function num(v:string){const n=Number(String(v).replace(/[$,%]/g,""));return Number.isFinite(n)?n:0}

async function aggregateSales(bytes:Uint8Array,productMap:Map<number,{brand:number;category:string}>,progress:Progress){
 const decoder=new TextDecoder();let row:string[]=[],headers:string[]=[];let quoted=false,start=0,headerDone=false,salesRows=0;
 let brand=new Map<string,any>(),category=new Map<string,any>(),retailer=new Map<string,any>(),brandRetailer=new Map<string,any>();
 let idx={product:-1,brand:-1,retailer:-1,week:-1,sales:-1,units:-1,dist:-1,promo:-1,discount:-1};
 const consume=(values:string[])=>{
  if(!headerDone){headers=values.map(x=>x.trim().toLowerCase());idx={product:col(headers,"product_id","productid","sku_id"),brand:col(headers,"brand_id","brandid"),retailer:col(headers,"retailer_id","retailerid"),week:col(headers,"week_ending","week_end","week","period","date"),sales:col(headers,"dollar_sales","sales_value","net_sales","value_sales","sales"),units:col(headers,"units","unit_sales","volume"),dist:col(headers,"acv_distribution","weighted_distribution","distribution"),promo:col(headers,"on_promo","promo_flag","promoted_flag","promotion_flag"),discount:col(headers,"discount_depth_pct","discount_pct","avg_discount_pct")};headerDone=true;return}
  if(!values.length)return;salesRows++;
  const productId=num(val(values,idx.product));const p=productMap.get(productId);if(!p)return;
  const brandId=idx.brand>=0?num(val(values,idx.brand)):p.brand;const retailerId=num(val(values,idx.retailer));const week=val(values,idx.week);if(!week)return;
  const sales=num(val(values,idx.sales)),units=num(val(values,idx.units)),dist=num(val(values,idx.dist)),promo=/^(true|1|yes|y)$/i.test(val(values,idx.promo)),discount=num(val(values,idx.discount));
  const bk=brandId+"|"+week;const b=brand.get(bk)||{brand_id:brandId,category:p.category,week_ending:week,dollar_sales:0,units:0,dist:0,observations:0,promo_observations:0,discount_sum:0};b.dollar_sales+=sales;b.units+=units;b.dist+=dist;b.observations++;b.promo_observations+=promo?1:0;b.discount_sum+=discount;brand.set(bk,b);
  const ck=p.category+"|"+week;const c=category.get(ck)||{category:p.category,week_ending:week,dollar_sales:0,units:0,dist:0,n:0};c.dollar_sales+=sales;c.units+=units;c.dist+=dist;c.n++;category.set(ck,c);
  if(retailerId){const rk=retailerId+"|"+week;const r=retailer.get(rk)||{retailer_id:retailerId,week_ending:week,dollar_sales:0,units:0,dist:0,n:0};r.dollar_sales+=sales;r.units+=units;r.dist+=dist;r.n++;retailer.set(rk,r);
   const brk=brandId+"|"+retailerId+"|"+p.category;const br=brandRetailer.get(brk)||{brand_id:brandId,retailer_id:retailerId,category:p.category,sales:0,units:0,dist:0,discount_sum:0,observations:0};br.sales+=sales;br.units+=units;br.dist+=dist;br.discount_sum+=discount;br.observations++;brandRetailer.set(brk,br);
  }
 };
 for(let i=0;i<bytes.length;i++){const c=bytes[i];if(c===34){if(quoted&&bytes[i+1]===34)i++;else quoted=!quoted}else if(c===44&&!quoted){row.push(decoder.decode(bytes.subarray(start,i)));start=i+1}else if((c===10||c===13)&&!quoted){if(c===13&&bytes[i+1]===10)i++;row.push(decoder.decode(bytes.subarray(start,i)).replace(/^"|"$/g,"").replace(/""/g,'"'));start=i+1;consume(row);row=[];if(salesRows&&salesRows%100000===0){progress("Processed "+salesRows.toLocaleString()+" source observations…");await new Promise(r=>setTimeout(r,0))}}}
 if(start<bytes.length||row.length){row.push(decoder.decode(bytes.subarray(start)).replace(/^"|"$/g,"").replace(/""/g,'"'));consume(row)}
 const brandWeeks=[...brand.values()].map(x=>({brand_id:x.brand_id,category:x.category,week_ending:x.week_ending,dollar_sales:x.dollar_sales,units:x.units,acv_distribution:x.observations?x.dist/x.observations:0,promo_observations:x.promo_observations,avg_discount_depth_pct:x.observations?x.discount_sum/x.observations:0,observations:x.observations}));
 const categoryWeeks=[...category.values()].map(x=>({category:x.category,week_ending:x.week_ending,dollar_sales:x.dollar_sales,units:x.units,acv_distribution:x.n?x.dist/x.n:0}));
 const retailerWeeks=[...retailer.values()].map(x=>({retailer_id:x.retailer_id,week_ending:x.week_ending,dollar_sales:x.dollar_sales,units:x.units,acv_distribution:x.n?x.dist/x.n:0}));
 const brandRetailerRows=[...brandRetailer.values()].sort((a,b)=>b.sales-a.sales).slice(0,100000).map(x=>({brand_id:x.brand_id,retailer_id:x.retailer_id,category:x.category,sales:x.sales,units:x.units,distribution:x.observations?x.dist/x.observations:0,discount_depth_pct:x.observations?x.discount_sum/x.observations:0,observations:x.observations}));
 progress("Aggregation complete: "+salesRows.toLocaleString()+" source observations.");
 return {salesRows,brandWeeks,categoryWeeks,retailerWeeks,brandRetailer:brandRetailerRows};
}

async function upsertBatches(sb:SupabaseClient,table:string,rows:any[],conflict:string,progress:Progress){
 const size=500;for(let i=0;i<rows.length;i+=size){const batch=rows.slice(i,i+size);let last="";for(let attempt=0;attempt<5;attempt++){const {error}=await sb.from(table).upsert(batch,{onConflict:conflict});if(!error){last="";break}last=error.message;if(attempt<4)await new Promise(r=>setTimeout(r,500*2**attempt))}if(last)throw new Error(table+": "+last);if(i===0||i+size>=rows.length||i%(size*20)===0)progress("Loading "+table+": "+Math.min(i+size,rows.length).toLocaleString()+" / "+rows.length.toLocaleString()+"…")}
}

export async function importSyndicateZip(sb:SupabaseClient,file:File,progress:Progress){
 if(!file.name.toLowerCase().endsWith(".zip"))throw new Error("Please select a CPGist dataset ZIP file.");
 if(file.size>120*1024*1024)throw new Error("This browser importer supports ZIP files up to 120 MB. The uploaded Free Dataset is within this local-processing limit.");
 progress("Reading the ZIP locally. Raw CSV facts stay in your browser; only compact analytical aggregates are written to Supabase.");
 const zip=unzipSync(new Uint8Array(await file.arrayBuffer()));
 const names=Object.keys(zip);
 const salesName=zip["sales_facts.csv"]?"sales_facts.csv":zip["11_sales_facts.csv"]?"11_sales_facts.csv":findFile(zip,h=>has(h,"product_id")&&has(h,"retailer_id")&&has(h,"week_ending","week","period")&&has(h,"dollar_sales","sales_value","net_sales"));
 if(!salesName)throw new Error("Could not identify the sales fact CSV. Expected sales_facts.csv or 11_sales_facts.csv.");
 const brandName=zip["brands.csv"]?"brands.csv":findFile(zip,h=>has(h,"brand_id","id")&&has(h,"name")&&has(h,"category"));
 const productName=zip["products.csv"]?"products.csv":findFile(zip,h=>has(h,"brand_id")&&has(h,"name")&&has(h,"product_id","id"));
 const retailerName=zip["retailers.csv"]?"retailers.csv":findFile(zip,h=>has(h,"name")&&has(h,"retailer_id","id")&&has(h,"region"));
 if(!brandName||!productName||!retailerName)throw new Error("The ZIP must contain recognizable brand, product and retailer master CSVs.");
 progress("Detected source files: "+salesName+" · "+brandName+" · "+productName+" · "+retailerName+" ("+names.length+" CSV/ZIP entries).");

 const br=parseCsv(zip[brandName]),pr=parseCsv(zip[productName]),rr=parseCsv(zip[retailerName]);
 const brandHeader=header(zip[brandName]),productHeader=header(zip[productName]),retailerHeader=header(zip[retailerName]);
 const bid=col(brandHeader,"brand_id","id"),bn=col(brandHeader,"name","brand_name"),bc=col(brandHeader,"category"),bp=col(brandHeader,"parent_company","parent");
 const pid=col(productHeader,"product_id","id"),pbrand=col(productHeader,"brand_id"),pn=col(productHeader,"name","product_name"),pc=col(productHeader,"category"),ps=col(productHeader,"subcategory"),psz=col(productHeader,"size","pack_size");
 const rid=col(retailerHeader,"retailer_id","id"),rn=col(retailerHeader,"name","retailer_name"),rch=col(retailerHeader,"channel"),rreg=col(retailerHeader,"region"),rst=col(retailerHeader,"total_stores","stores");
 const brands=br.map(x=>({id:num(val(Object.values(x),bid>=0?bid:0)),name:x[brandHeader[bn]]||x["name"]||"",category:bc>=0?x[brandHeader[bc]]||null:null,parent_company:bp>=0?x[brandHeader[bp]]||null:null,home_regions:x["home_regions"]||x["region"]||null})).filter(x=>x.id&&x.name);
 const products=pr.map(x=>({id:num(x[productHeader[pid]]),brand_id:num(x[productHeader[pbrand]]),name:x[productHeader[pn]]||"",category:pc>=0?x[productHeader[pc]]||null:null,subcategory:ps>=0?x[productHeader[ps]]||null:null,size:psz>=0?x[productHeader[psz]]||null:null})).filter(x=>x.id&&x.brand_id);
 const retailers=rr.map(x=>({id:num(x[retailerHeader[rid]]),name:x[retailerHeader[rn]]||"",channel:rch>=0?x[retailerHeader[rch]]||null:null,region:rreg>=0?x[retailerHeader[rreg]]||null:null,total_stores:rst>=0?num(x[retailerHeader[rst]]):0})).filter(x=>x.id&&x.name);
 if(!brands.length||!products.length||!retailers.length)throw new Error("The detected master files contain no usable numeric IDs.");
 await upsertBatches(sb,"syndicate_brands",brands,"id",progress);await upsertBatches(sb,"syndicate_retailers",retailers,"id",progress);await upsertBatches(sb,"syndicate_products",products,"id",progress);
 const productMap=new Map<number,{brand:number;category:string}>();products.forEach(p=>productMap.set(p.id,{brand:p.brand_id,category:p.category||"Unclassified"}));
 progress("Aggregating sales locally by brand-week, category-week and retailer-week…");
 const agg=await aggregateSales(zip[salesName],productMap,progress);
 await upsertBatches(sb,"syndicate_sales_weekly",agg.brandWeeks,"brand_id,week_ending",progress);
 await upsertBatches(sb,"syndicate_category_weekly",agg.categoryWeeks,"category,week_ending",progress);
 await upsertBatches(sb,"syndicate_retailer_weekly",agg.retailerWeeks,"retailer_id,week_ending",progress);
 await upsertBatches(sb,"syndicate_brand_retailer",agg.brandRetailer,"brand_id,retailer_id,category",progress);
 return {brands:brands.length,retailers:retailers.length,products:products.length,salesRows:agg.salesRows,brandWeeks:agg.brandWeeks.length,categoryWeeks:agg.categoryWeeks.length,retailerWeeks:agg.retailerWeeks.length,brandRetailer:agg.brandRetailer.length};
}
