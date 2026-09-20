import {NextRequest,NextResponse} from "next/server";
const base=()=>({u:process.env.NEXT_PUBLIC_SUPABASE_URL,k:process.env.SUPABASE_SERVICE_ROLE_KEY});
async function get(path:string){const {u,k}=base();if(!u||!k)throw new Error("Supabase server environment is not configured.");const r=await fetch(u+"/rest/v1/"+path,{headers:{apikey:k,Authorization:"Bearer "+k},cache:"no-store"});if(!r.ok)throw new Error(await r.text());return r.json();}
const n=(v:any)=>Number(v??0)||0;const pct=(a:number,b:number)=>b?((a-b)/b)*100:0;const enc=(v:any)=>encodeURIComponent(String(v??""));
async function brandDetail(id:string,brand:any,compact:boolean){
async function brandDetail(id:string,brand:any,compact:boolean){
 if(compact){
  const rows:any[]=await get("cpgist_brand_weekly?brand_id=eq."+enc(id)+"&select=brand_id,category,week_ending,sales,units,distribution,avg_price,promo_rate&order=week_ending.asc&limit=100000");
  const periods=[...new Set(rows.map(r=>String(r.week_ending)))].sort();
  const latest=periods.slice(-13),prior=periods.slice(-26,-13),ls=new Set(latest),ps=new Set(prior);
  const agg=(rs:any[])=>{const sales=rs.reduce((a,r)=>a+n(r.sales),0),units=rs.reduce((a,r)=>a+n(r.units),0);return{sales,units,distribution:rs.length?rs.reduce((a,r)=>a+n(r.distribution),0)/rs.length:null,price:units?sales/units:null,promoRate:rs.length?rs.reduce((a,r)=>a+n(r.promo_rate),0)/rs.length:null};};
  const a=agg(rows.filter(r=>ls.has(String(r.week_ending)))),b=agg(rows.filter(r=>ps.has(String(r.week_ending))));
  const categoryName=String(brand.category||"");
  let categorySales=0;
  if(categoryName){
   try{
    const cr:any[]=await get("cpgist_category_weekly?category=ilike."+enc(categoryName)+"&select=category,week_ending,sales&order=week_ending.asc&limit=5000");
    categorySales=cr.filter(r=>ls.has(String(r.week_ending))).reduce((s,r)=>s+n(r.sales),0);
   }catch{}
  }
  const weekly=periods.map(w=>{const rr=rows.filter(r=>String(r.week_ending)===w);return{period:w,sales:rr.reduce((x,r)=>x+n(r.sales),0),units:rr.reduce((x,r)=>x+n(r.units),0)}});
  let products:any[]=[], retailers:any[]=[];
  try{
   const p:any[]=await get("cpgist_products?brand_id=eq."+enc(id)+"&select=id,brand_id,name,sku,category,subcategory,size,pack_count&order=name&limit=5000");
   let pw:any[]=[];
   try{pw=await get("cpgist_product_weekly?brand_id=eq."+enc(id)+"&select=product_id,brand_id,retailer_id,week_ending,sales,units,price,distribution,promo_rate&order=week_ending.asc&limit=100000");}catch{}
   const pm=new Map<string,any>(p.map((x:any)=>[String(x.id),x]));
   const prodMap=new Map<string,any>();
   for(const r of pw){
    if(!ls.has(String(r.week_ending))&&!ps.has(String(r.week_ending)))continue;
    const x=prodMap.get(String(r.product_id))||{id:r.product_id,name:pm.get(String(r.product_id))?.name||("Product "+r.product_id),sku:pm.get(String(r.product_id))?.sku||null,category:pm.get(String(r.product_id))?.category||null,subcategory:pm.get(String(r.product_id))?.subcategory||null,size:pm.get(String(r.product_id))?.size||null,sales:0,priorSales:0,units:0};
    if(ls.has(String(r.week_ending))){x.sales+=n(r.sales);x.units+=n(r.units)}else{x.priorSales+=n(r.sales)}
    prodMap.set(String(r.product_id),x);
   }
   products=[...prodMap.values()].map(x=>({...x,growth:x.priorSales?(x.sales/x.priorSales-1)*100:null})).sort((a,b)=>b.sales-a.sales);
   if(!products.length)products=p.map(x=>({...x,sales:0,priorSales:0,units:0,growth:null}));
  }catch{}
  try{
   const rr:any[]=await get("cpgist_brand_retailer_weekly?brand_id=eq."+enc(id)+"&select=retailer_id,week_ending,sales,units,distribution,price,promo_rate&order=week_ending.asc&limit=100000");
   const rdim:any[]=await get("cpgist_retailers?select=id,name,channel,region,retailer_group,total_stores&order=name&limit=2000");
   const map=new Map<any,{sales:number;units:number}>();for(const r of rr){if(!ls.has(String(r.week_ending)))continue;const x=map.get(r.retailer_id)||{sales:0,units:0};x.sales+=n(r.sales);x.units+=n(r.units);map.set(r.retailer_id,x)}
   retailers=[...map.entries()].sort((x,y)=>y[1].sales-x[1].sales).slice(0,50).map(([rid,x])=>{const z=rdim.find((v:any)=>String(v.id)===String(rid));return{id:rid,name:z?.name||("Retailer "+rid),channel:z?.channel||"",region:z?.region||"",retailer_group:z?.retailer_group||"",total_stores:z?.total_stores??null,sales:x.sales,units:x.units}})}catch{}
  return {entity:"brand",brand,periods,latestWindow:latest,priorWindow:prior,metrics:{sales:a.sales,priorSales:b.sales,growth:pct(a.sales,b.sales),units:a.units,distribution:a.distribution,price:a.price,promoRate:a.promoRate,categorySales,share:categorySales?a.sales/categorySales*100:null},weekly,products,retailers,source:"cpgist_compact"};
 }
 const rows:any[]=await get("syndicate_sales_weekly?brand_id=eq."+enc(id)+"&select=brand_id,category,week_ending,dollar_sales,units,acv_distribution,promo_observations,observations&order=week_ending.asc&limit=100000");
 const periods=[...new Set(rows.map(r=>String(r.week_ending)))].sort(),latest=periods.slice(-13),prior=periods.slice(-26,-13),ls=new Set(latest),ps=new Set(prior);
 const agg=(rs:any[])=>({sales:rs.reduce((a,r)=>a+n(r.dollar_sales),0),units:rs.reduce((a,r)=>a+n(r.units),0),distribution:rs.length?rs.reduce((a,r)=>a+n(r.acv_distribution),0)/rs.length:null,promoRate:rs.reduce((a,r)=>a+n(r.promo_observations),0)/Math.max(1,rs.reduce((a,r)=>a+n(r.observations),0))*100});
 const a=agg(rows.filter(r=>ls.has(String(r.week_ending)))),b=agg(rows.filter(r=>ps.has(String(r.week_ending))));
 const weekly=periods.map(w=>{const rr=rows.filter(r=>String(r.week_ending)===w);return{period:w,sales:rr.reduce((x,r)=>x+n(r.dollar_sales),0),units:rr.reduce((x,r)=>x+n(r.units),0)}});
 let products:any[]=[];let retailers:any[]=[];
 try{const pm:any[]=await get("syndicate_products?brand_id=eq."+enc(id)+"&select=id,name,category,subcategory,size&limit=2000");products=pm;}
 catch{}
 return {entity:"brand",brand,periods,latestWindow:latest,priorWindow:prior,metrics:{sales:a.sales,priorSales:b.sales,growth:pct(a.sales,b.sales),units:a.units,distribution:a.distribution,promoRate:a.promoRate},weekly,products,retailers,source:"syndicate"};
}
export async function GET(req:NextRequest){
 try{
  const p=req.nextUrl.searchParams,entity=p.get("entity")||"brand",q=(p.get("q")||"").trim().toLowerCase(),id=p.get("id");
  let compact=false;
  try{const x=await get("cpgist_brands?select=id&limit=1");compact=Array.isArray(x)&&x.length>0}catch{}
  if(!compact)return NextResponse.json({error:"CPGist Free Dataset is not imported yet. Open Data Import and load CPGist_Supabase_Free_Dataset.zip before using the client explorer.",code:"COMPACT_DATASET_REQUIRED"},{status:503});
  if(entity==="brand"){
   const brands:any[]=await get((compact?"cpgist_brands":"syndicate_brands")+"?select=id,name,category,parent_company,home_regions"+(compact?",portfolio":"")+"&order=name&limit=2000");
   if(!id)return NextResponse.json({entity,source:compact?"cpgist_compact":"syndicate",results:brands.filter(b=>!q||String(b.name).toLowerCase().includes(q)||String(b.parent_company||"").toLowerCase().includes(q)||String(b.category||"").toLowerCase().includes(q)||String(b.home_regions||"").toLowerCase().includes(q))});
   const brand=brands.find(b=>String(b.id)===String(id));if(!brand)return NextResponse.json({error:"Brand not found."},{status:404});
   return NextResponse.json(await brandDetail(String(id),brand,compact));
  }
  if(entity==="retailer"){
   const rows:any[]=await get((compact?"cpgist_retailers":"syndicate_retailers")+"?select=id,name,channel,region,total_stores"+(compact?",retailer_group":"")+"&order=name&limit=2000");
   return NextResponse.json({entity,source:compact?"cpgist_compact":"syndicate",results:rows.filter(x=>!q||String(x.name).toLowerCase().includes(q)||String(x.channel||"").toLowerCase().includes(q)||String(x.region||"").toLowerCase().includes(q)||String(x.retailer_group||"").toLowerCase().includes(q))});
  }
  if(entity==="category"){
   if(compact){const rows:any[]=await get("cpgist_categories?select=id,name,parent_category,subcategory_count&order=name&limit=2000");return NextResponse.json({entity,source:"cpgist_compact",results:rows.filter(x=>!q||String(x.name).toLowerCase().includes(q)||String(x.parent_category||"").toLowerCase().includes(q))});}
   const rows:any[]=await get("syndicate_category_weekly?select=category&order=category&limit=2000");const names=[...new Set(rows.map(x=>String(x.category||"Unclassified")))].map((name,i)=>({id:i+1,name}));return NextResponse.json({entity,source:"syndicate",results:names.filter(x=>!q||x.name.toLowerCase().includes(q))});
  }
  if(entity==="region"){
   if(compact){const rows:any[]=await get("cpgist_regions?select=id,name,country,region_group&order=name&limit=2000");return NextResponse.json({entity,source:"cpgist_compact",results:rows.filter(x=>!q||String(x.name).toLowerCase().includes(q)||String(x.country||"").toLowerCase().includes(q)||String(x.region_group||"").toLowerCase().includes(q))});}
   const rows:any[]=await get("syndicate_retailers?select=region&order=region&limit=2000");const names=[...new Set(rows.map(x=>String(x.region||"")).filter(Boolean))].map((name,i)=>({id:i+1,name}));return NextResponse.json({entity,source:"syndicate",results:names.filter(x=>!q||x.name.toLowerCase().includes(q))});
  }
  if(entity==="product"){
   const rows:any[]=await get((compact?"cpgist_products":"syndicate_products")+"?select=id,brand_id,name,category,subcategory,size"+(compact?",sku":"")+"&order=name&limit=5000");return NextResponse.json({entity,source:compact?"cpgist_compact":"syndicate",results:rows.filter(x=>!q||String(x.name).toLowerCase().includes(q)||String(x.category||"").toLowerCase().includes(q)||String(x.subcategory||"").toLowerCase().includes(q))});
  }
  return NextResponse.json({error:"Unsupported entity."},{status:400});
 }catch(e:any){return NextResponse.json({error:e?.message||"Data explorer failed."},{status:500})}
}