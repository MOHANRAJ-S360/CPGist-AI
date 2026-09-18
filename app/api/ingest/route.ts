import {NextResponse} from "next/server";
import * as XLSX from "xlsx";

type Row=Record<string,string>;
const aliases:Record<string,string[]>={brand:["brand","brand_name"],product:["product","product_name"],sku:["sku","product_sku"],category:["category","category_name"],retailer:["retailer","retailer_name"],region:["region","market","geography"],period:["date","period","week","month"],sales_value:["sales","sales_value","net_sales","revenue"],units:["units","unit_sales"],price:["price","avg_price","average_price"],distribution:["distribution","weighted_distribution"],inventory:["inventory","stock"],promo_flag:["promo","promotion","promo_flag"],promo_depth:["promo_depth","promotion_depth"]};
const norm=(v:string)=>v.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
function csv(text:string):Row[]{const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return[];const parse=(line:string)=>{let q=false,c="",o:string[]=[];for(let i=0;i<line.length;i++){const x=line[i];if(x==='"'){if(q&&line[i+1]==='"'){c+='"';i++;}else q=!q;}else if(x===','&&!q){o.push(c.trim());c="";}else c+=x;}o.push(c.trim());return o};const h=parse(lines[0]).map(norm);return lines.slice(1).map(l=>{const v=parse(l);return Object.fromEntries(h.map((x,i)=>[x,v[i]??""]));});}
async function rowsFrom(file:File){const ext=file.name.toLowerCase().split(".").pop();if(ext==="csv")return csv(await file.text());if(ext==="xlsx"||ext==="xls"){const wb=XLSX.read(Buffer.from(await file.arrayBuffer()),{type:"buffer",cellDates:true});const sheet=wb.Sheets[wb.SheetNames[0]];return (XLSX.utils.sheet_to_json(sheet,{defval:"",raw:false}) as Record<string,unknown>[]).map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[norm(k),String(v??"")])));}throw new Error("Only CSV and XLSX files are supported.");}
function mapping(headers:string[]){const n=headers.map(norm);return Object.entries(aliases).flatMap(([canonical,names])=>{const source=n.find(h=>names.includes(h));return source?[{canonical,source}]:[]});}
function num(v:string){if(v.trim()==="")return null;const n=Number(v.replace(/[$,%\s,]/g,""));return Number.isFinite(n)?n:null;}
function bool(v:string){return ["1","true","yes","y","promo","promoted"].includes(v.trim().toLowerCase());}
function date(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);}
async function supa(path:string,method:"GET"|"POST"|"PATCH",body?:unknown,extra:Record<string,string>={}){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("Supabase server environment is not configured.");const res=await fetch(url+"/rest/v1/"+path,{method,headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json","Prefer":"return=representation",...extra},body:body===undefined?undefined:JSON.stringify(body),cache:"no-store"});if(!res.ok)throw new Error("Supabase request failed: "+await res.text());return res.status===204?[]:await res.json();}
async function entity(table:string,organization_id:string,name:string){if(!name)return null;const existing=await supa(table+"?organization_id=eq."+encodeURIComponent(organization_id)+"&name=eq."+encodeURIComponent(name)+"&select=id");if(existing[0])return existing[0].id;const made=await supa(table,"POST",{organization_id,name});return made[0]?.id??null;}
export async function POST(req:Request){
 const form=await req.formData(),file=form.get("file");if(!(file instanceof File))return NextResponse.json({error:"Upload CSV or XLSX."},{status:400});
 const org=String(form.get("organizationId")||"");if(!org)return NextResponse.json({error:"organizationId is required for a production ingestion."},{status:400});
 try{
  const rows=await rowsFrom(file);const headers=rows.length?Object.keys(rows[0]):[];const map=mapping(headers);const src=(k:string)=>map.find(x=>x.canonical===k)?.source;
  const missing=["period","sales_value","units"].filter(k=>!src(k));let rejected=0;const facts=[];
  for(const r of rows){const period=date(r[src("period")||""]);const sales=num(r[src("sales_value")||""]),units=num(r[src("units")||""]);if(!period||sales===null||units===null){rejected++;continue;}
   const brandId=await entity("brands",org,r[src("brand")||""]||"");const categoryId=await entity("categories",org,r[src("category")||""]||"");const retailerId=await entity("retailers",org,r[src("retailer")||""]||"");
   let productId=null;const product=r[src("product")||""]||"";const sku=r[src("sku")||""]||"";if(product){const existing=sku?await supa("products?organization_id=eq."+encodeURIComponent(org)+"&sku=eq."+encodeURIComponent(sku)+"&select=id"):[];productId=existing[0]?.id;if(!productId){const made=await supa("products","POST",{organization_id:org,brand_id:brandId,category_id:categoryId,name:product,sku:sku||null});productId=made[0]?.id;}}
   facts.push({organization_id:org,product_id:productId,brand_id:brandId,category_id:categoryId,retailer_id:retailerId,region:r[src("region")||""]||null,period,sales_value:sales,units,price:num(r[src("price")||""]),distribution:num(r[src("distribution")||""]),promo_flag:bool(r[src("promo_flag")||""]),promo_depth:num(r[src("promo_depth")||""]),inventory:num(r[src("inventory")||""])});
  }
  if(missing.length)return NextResponse.json({error:"Missing required columns: "+missing.join(", "),rowCount:rows.length,mapping:map,missingRequired:missing},{status:422});
  if(facts.length)await supa("sales_facts","POST",facts);
  const source=(await supa("data_sources","POST",{organization_id:org,name:file.name,source_type:file.name.toLowerCase().endsWith(".xlsx")?"xlsx":"csv",status:"ready",row_count:rows.length,last_ingested_at:new Date().toISOString()}))[0];
  await supa("ingestion_runs","POST",{data_source_id:source.id,status:"completed",rows_read:rows.length,rows_inserted:facts.length,rows_rejected:rejected,completed_at:new Date().toISOString()});
  return NextResponse.json({fileName:file.name,rowCount:rows.length,rowsInserted:facts.length,rowsRejected:rejected,mapping:map});
 }catch(e){return NextResponse.json({error:String(e)},{status:500});}
}