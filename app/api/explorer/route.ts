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

function contains(value:any,q:string){return !q||String(value??"").toLowerCase().includes(q.toLowerCase());}

export async function GET(req:NextRequest){
 try{
  const p=req.nextUrl.searchParams;
  const entity=p.get("entity")||"brand";
  const q=(p.get("q")||"").trim();
  const id=p.get("id");

  if(entity==="brand"){
   const brands:any[]=await get("syndicate_brands?select=id,name,category,parent_company,home_regions&order=name&limit=1000");
   if(!id){
    const rows=brands.filter(b=>contains(b.name,q)||contains(b.parent_company,q)||contains(b.category,q)||contains(b.home_regions,q));
    return NextResponse.json({entity,count:rows.length,results:rows});
   }
   const brand=brands.find(b=>String(b.id)===String(id));
   if(!brand)return NextResponse.json({error:"Brand not found."},{status:404});
   const rows:any[]=await get("syndicate_sales_weekly?brand_id=eq."+field(id)+"&select=brand_id,category,week_ending,dollar_sales,units,acv_distribution,promo_observations,avg_discount_depth_pct,observations&order=week_ending.asc&limit=100000");
   const periods=[...new Set(rows.map(r=>String(r.week_ending)))].sort();
   const latest=periods.slice(-13),prior=periods.slice(-26,-13),ls=new Set(latest),ps=new Set(prior);
   const agg=(rs:any[])=>({
    sales:rs.reduce((a,r)=>a+n(r.dollar_sales),0),
    units:rs.reduce((a,r)=>a+n(r.units),0),
    distribution:rs.length?rs.reduce((a,r)=>a+n(r.acv_distribution),0)/rs.length:null,
    promoRate:rs.reduce((a,r)=>a+n(r.promo_observations),0)/Math.max(1,rs.reduce((a,r)=>a+n(r.observations),0))*100
   });
   const a=agg(rows.filter(r=>ls.has(String(r.week_ending))));
   const b=agg(rows.filter(r=>ps.has(String(r.week_ending))));
   const weekly=periods.map(w=>{
    const rr=rows.filter(r=>String(r.week_ending)===w);
    return {period:w,sales:rr.reduce((x,r)=>x+n(r.dollar_sales),0),units:rr.reduce((x,r)=>x+n(r.units),0)};
   });
   const products:any[]=await get("syndicate_products?brand_id=eq."+field(id)+"&select=id,name,category,subcategory,size&order=name&limit=5000").catch(()=>[]);
   const retailerFacts:any[]=await get("syndicate_brand_retailer?brand_id=eq."+field(id)+"&select=retailer_id,category,sales,units,distribution,discount_depth_pct,observations&order=sales.desc&limit=5000").catch(()=>[]);
   const retailerMaster:any[]=await get("syndicate_retailers?select=id,name,channel,region,total_stores&order=name&limit=1000").catch(()=>[]);
   const retailers=retailerFacts.map(x=>{const m=retailerMaster.find(r=>String(r.id)===String(x.retailer_id));return{...x,name:m?.name||("Retailer "+x.retailer_id),channel:m?.channel||"",region:m?.region||"",total_stores:m?.total_stores||0};}).sort((a,b)=>n(b.sales)-n(a.sales)).slice(0,25);
   return NextResponse.json({
    entity,brand,periods,latestWindow:latest,priorWindow:prior,
    metrics:{sales:a.sales,priorSales:b.sales,growth:pct(a.sales,b.sales),units:a.units,distribution:a.distribution,promoRate:a.promoRate},
    weekly,
    products:products.map(x=>({id:x.id,name:x.name,category:x.category,subcategory:x.subcategory,size:x.size})),
    retailers
   });
  }

  if(entity==="retailer"){
   const rows:any[]=await get("syndicate_retailers?select=id,name,channel,region,total_stores&order=name&limit=1000");
   if(id){
    const retailer=rows.find(x=>String(x.id)===String(id));
    if(!retailer)return NextResponse.json({error:"Retailer not found."},{status:404});
    const facts:any[]=await get("syndicate_retailer_weekly?retailer_id=eq."+field(id)+"&select=retailer_id,week_ending,dollar_sales,units,acv_distribution&order=week_ending.asc&limit=100000").catch(()=>[]);
    const periods=[...new Set(facts.map(r=>String(r.week_ending)))].sort();
    const latest=new Set(periods.slice(-13)),prior=new Set(periods.slice(-26,-13));
    const sum=(rs:any[])=>rs.reduce((a,r)=>a+n(r.dollar_sales),0);
    const sales=sum(facts.filter(r=>latest.has(String(r.week_ending))));
    const priorSales=sum(facts.filter(r=>prior.has(String(r.week_ending))));
    const weekly=periods.map(w=>({period:w,sales:sum(facts.filter(r=>String(r.week_ending)===w))}));
    return NextResponse.json({entity,retailer,periods,weekly,metrics:{sales,priorSales,growth:pct(sales,priorSales)}});
   }
   const filtered=rows.filter(x=>contains(x.name,q)||contains(x.channel,q)||contains(x.region,q));
   return NextResponse.json({entity,count:filtered.length,results:filtered});
  }

  if(entity==="category"){
   const facts:any[]=await get("syndicate_category_weekly?select=category,week_ending,dollar_sales,units,acv_distribution&order=week_ending.desc&limit=10000");
   const by=new Map<string,{sales:number;units:number;distribution:number;n:number;weeks:Set<string>}>();
   for(const r of facts){
    const key=String(r.category||"Unclassified");
    const x=by.get(key)||{sales:0,units:0,distribution:0,n:0,weeks:new Set<string>()};
    x.sales+=n(r.dollar_sales);x.units+=n(r.units);x.distribution+=n(r.acv_distribution);x.n++;x.weeks.add(String(r.week_ending));by.set(key,x);
   }
   const rows=[...by.entries()].map(([name,x])=>({name,sales:x.sales,units:x.units,avgDistribution:x.n?x.distribution/x.n:null,periods:x.weeks.size}));
   const filtered=rows.filter(x=>contains(x.name,q)).sort((a,b)=>b.sales-a.sales);
   return NextResponse.json({entity,count:filtered.length,results:filtered});
  }

  if(entity==="region"){
   const retailers:any[]=await get("syndicate_retailers?select=id,name,region,total_stores&order=region,name&limit=1000");
   const by=new Map<string,{retailers:number;stores:number;names:string[]}>();
   for(const r of retailers){
    const name=String(r.region||"Unassigned");
    const x=by.get(name)||{retailers:0,stores:0,names:[]};
    x.retailers++;x.stores+=n(r.total_stores);x.names.push(String(r.name||""));by.set(name,x);
   }
   const rows=[...by.entries()].map(([name,x])=>({name,retailers:x.retailers,stores:x.stores,retailerNames:x.names}));
   const filtered=rows.filter(x=>contains(x.name,q)).sort((a,b)=>a.name.localeCompare(b.name));
   return NextResponse.json({entity,count:filtered.length,results:filtered});
  }

  if(entity==="product"){
   const rows:any[]=await get("syndicate_products?select=id,brand_id,name,category,subcategory,size&order=name&limit=5000");
   const filtered=rows.filter(x=>contains(x.name,q)||contains(x.category,q)||contains(x.subcategory,q));
   return NextResponse.json({entity,count:filtered.length,results:filtered});
  }

  return NextResponse.json({error:"Unsupported entity."},{status:400});
 }catch(e:any){
  return NextResponse.json({error:e?.message||"Data explorer failed."},{status:500});
 }
}
