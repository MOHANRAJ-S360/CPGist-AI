import {NextRequest,NextResponse} from "next/server";

const base=()=>({u:process.env.NEXT_PUBLIC_SUPABASE_URL,k:process.env.SUPABASE_SERVICE_ROLE_KEY});
async function get(path:string){
 const {u,k}=base();
 if(!u||!k)throw new Error("Supabase server environment is not configured.");
 const r=await fetch(u+"/rest/v1/"+path,{headers:{apikey:k,Authorization:"Bearer "+k},cache:"no-store"});
 if(!r.ok)throw new Error(await r.text());
 return r.json();
}
const n=(v:any)=>Number(v??0)||0;
const pct=(a:number,b:number)=>b?((a-b)/b)*100:0;
const field=(v:any)=>encodeURIComponent(String(v??""));

export async function GET(req:NextRequest){
 try{
  const p=req.nextUrl.searchParams;
  const entity=p.get("entity")||"brand";
  const q=(p.get("q")||"").trim();
  const id=p.get("id");
  if(entity==="brand"){
   const brands:any[]=await get("syndicate_brands?select=id,name,category,parent_company,home_regions&order=name&limit=500");
   if(!id){
    const rows=brands.filter(b=>!q||String(b.name).toLowerCase().includes(q.toLowerCase())||String(b.parent_company||"").toLowerCase().includes(q.toLowerCase())||String(b.category||"").toLowerCase().includes(q.toLowerCase())).slice(0,30);
    return NextResponse.json({entity,results:rows});
   }
   const brand=brands.find(b=>String(b.id)===String(id));
   if(!brand)return NextResponse.json({error:"Brand not found."},{status:404});
   const rows:any[]=await get("syndicate_sales_weekly?brand_id=eq."+field(id)+"&select=brand_id,category,week_ending,dollar_sales,units,acv_distribution,promo_observations,avg_discount_depth_pct,observations&order=week_ending.asc&limit=20000");
   const periods=[...new Set(rows.map(r=>String(r.week_ending)))].sort();
   const latest=periods.slice(-13),prior=periods.slice(-26,-13),ls=new Set(latest),ps=new Set(prior);
   const agg=(rs:any[])=>({sales:rs.reduce((a,r)=>a+n(r.dollar_sales),0),units:rs.reduce((a,r)=>a+n(r.units),0),distribution:rs.length?rs.reduce((a,r)=>a+n(r.acv_distribution),0)/rs.length:null,promoRate:rs.reduce((a,r)=>a+n(r.promo_observations),0)/Math.max(1,rs.reduce((a,r)=>a+n(r.observations),0))*100});
   const lr=rows.filter(r=>ls.has(String(r.week_ending))),pr=rows.filter(r=>ps.has(String(r.week_ending)));
   const a=agg(lr),b=agg(pr);
   const weekly=periods.map(w=>{const rr=rows.filter(r=>String(r.week_ending)===w);return {period:w,sales:rr.reduce((x,r)=>x+n(r.dollar_sales),0),units:rr.reduce((x,r)=>x+n(r.units),0)}});
   let productRows:any[]=[];
   try{
    const facts:any[]=await get("sales_facts?brand_id=eq."+field(id)+"&select=product_id,retailer_id,period,sales_value,units,price,distribution,promo_flag&order=period.asc&limit=50000");
    const pm:any[]=await get("syndicate_products?brand_id=eq."+field(id)+"&select=id,name,category,subcategory,size&limit=1000");
    const rm:any[]=await get("syndicate_retailers?select=id,name,channel,region,total_stores&limit=500");
    const latestDate=latest.at(-1);
    const productMap=new Map<string,{sales:number;units:number}>();
    const retailerMap=new Map<string,{sales:number;units:number}>();
    for(const r of facts){
      if(String(r.period)>String(latestDate||""))continue;
      const pv=productMap.get(String(r.product_id))||{sales:0,units:0};pv.sales+=n(r.sales_value);pv.units+=n(r.units);productMap.set(String(r.product_id),pv);
      const rv=retailerMap.get(String(r.retailer_id))||{sales:0,units:0};rv.sales+=n(r.sales_value);rv.units+=n(r.units);retailerMap.set(String(r.retailer_id),rv);
    }
    productRows=[...productMap.entries()].sort((x,y)=>y[1].sales-x[1].sales).slice(0,12).map(([pid,x])=>{const z=pm.find((v:any)=>String(v.id)===pid);return{id:pid,name:z?.name||("Product "+pid),category:z?.category||brand.category,subcategory:z?.subcategory||"",sales:x.sales,units:x.units}});
    const retailers=[...retailerMap.entries()].sort((x,y)=>y[1].sales-x[1].sales).slice(0,12).map(([rid,x])=>{const z=rm.find((v:any)=>String(v.id)===rid);return{id:rid,name:z?.name||("Retailer "+rid),channel:z?.channel||"",region:z?.region||"",sales:x.sales,units:x.units}});
    return NextResponse.json({entity,brand,periods,latestWindow:latest,priorWindow:prior,metrics:{sales:a.sales,priorSales:b.sales,growth:pct(a.sales,b.sales),units:a.units,distribution:a.distribution,promoRate:a.promoRate},weekly,products:productRows,retailers});
   }catch{
    return NextResponse.json({entity,brand,periods,latestWindow:latest,priorWindow:prior,metrics:{sales:a.sales,priorSales:b.sales,growth:pct(a.sales,b.sales),units:a.units,distribution:a.distribution,promoRate:a.promoRate},weekly,products:productRows,retailers:[]});
   }
  }
  if(entity==="product"){
   const rows:any[]=await get("syndicate_products?select=id,brand_id,name,category,subcategory,size&order=name&limit=1000");
   return NextResponse.json({entity,results:rows.filter(x=>!q||String(x.name).toLowerCase().includes(q.toLowerCase())||String(x.category||"").toLowerCase().includes(q.toLowerCase())).slice(0,40)});
  }
  if(entity==="retailer"){
   const rows:any[]=await get("syndicate_retailers?select=id,name,channel,region,total_stores&order=name&limit=500");
   return NextResponse.json({entity,results:rows.filter(x=>!q||String(x.name).toLowerCase().includes(q.toLowerCase())||String(x.channel||"").toLowerCase().includes(q.toLowerCase())||String(x.region||"").toLowerCase().includes(q.toLowerCase())).slice(0,40)});
  }
  if(entity==="category"){
   const rows:any[]=await get("syndicate_category_weekly?select=category&order=category&limit=2000");
   const cats=[...new Set(rows.map(x=>String(x.category||"Unclassified")))].map(name=>({name}));
   return NextResponse.json({entity,results:cats.filter(x=>!q||x.name.toLowerCase().includes(q.toLowerCase())).slice(0,40)});
  }
  return NextResponse.json({error:"Unsupported entity."},{status:400});
 }catch(e:any){return NextResponse.json({error:e?.message||"Data explorer failed."},{status:500})}
}