import { NextResponse } from "next/server";

type Row = Record<string,string>;
const aliases: Record<string,string[]> = {
 brand:["brand","brand_name"], product:["product","product_name"], sku:["sku","product_sku"],
 category:["category","category_name"], retailer:["retailer","retailer_name"], region:["region","market","geography"],
 period:["date","period","week","month"], sales_value:["sales","sales_value","net_sales","revenue"],
 units:["units","unit_sales"], price:["price","avg_price","average_price"],
 distribution:["distribution","weighted_distribution"], inventory:["inventory","stock"], promo_flag:["promo","promotion","promo_flag"]
};
function normalizeHeader(v:string){return v.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");}
function parseCsv(text:string):Row[]{
 const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(l=>l.trim().length); if(!lines.length)return [];
 const parse=(line:string)=>{const out:string[]=[];let cur="",quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){out.push(cur.trim());cur="";}else cur+=c;}out.push(cur.trim());return out;};
 const headers=parse(lines[0]).map(normalizeHeader);
 return lines.slice(1).map(line=>{const vals=parse(line);return Object.fromEntries(headers.map((h,i)=>[h,vals[i]??""]));});
}
function detect(headers:string[]){const n=headers.map(normalizeHeader);return Object.entries(aliases).flatMap(([canonical,names])=>{const hit=n.find(h=>names.includes(h));return hit?[{canonical,source:hit}]:[];});}
export async function POST(request:Request){
 const form=await request.formData();const file=form.get("file");
 if(!(file instanceof File))return NextResponse.json({error:"Upload a CSV file."},{status:400});
 if(file.name.toLowerCase().split(".").pop()!=="csv")return NextResponse.json({error:"CSV ingestion is enabled first; XLSX parser will be added next."},{status:415});
 const rows=parseCsv(await file.text());const headers=rows.length?Object.keys(rows[0]):[];const mapping=detect(headers);
 const required=["period","sales_value","units"];const mapped=new Set(mapping.map(x=>x.canonical));const missingRequired=required.filter(x=>!mapped.has(x));
 const numeric=["sales_value","units","price","distribution","inventory"];let invalidNumbers=0,invalidDates=0;
 for(const row of rows){for(const key of numeric){const src=mapping.find(x=>x.canonical===key)?.source;if(src&&row[src]!==""&&!Number.isFinite(Number(row[src])))invalidNumbers++;}const src=mapping.find(x=>x.canonical==="period")?.source;if(src&&row[src]&&Number.isNaN(Date.parse(row[src])))invalidDates++;}
 return NextResponse.json({fileName:file.name,rowCount:rows.length,headers,mapping,missingRequired,quality:{invalidNumbers,invalidDates,acceptedEstimate:missingRequired.length?0:Math.max(0,rows.length-invalidNumbers-invalidDates)}});
}