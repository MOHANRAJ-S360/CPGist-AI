import {NextResponse} from "next/server";

const base=()=>({u:process.env.NEXT_PUBLIC_SUPABASE_URL,k:process.env.SUPABASE_SERVICE_ROLE_KEY});
async function get(path:string){
 const {u,k}=base(); if(!u||!k)throw new Error("Supabase server environment is not configured.");
 const r=await fetch(u+"/rest/v1/"+path,{headers:{apikey:k,Authorization:"Bearer "+k},cache:"no-store"});
 if(!r.ok)throw new Error(await r.text()); return r.json();
}
const n=(v:any)=>Number(v??0)||0;
const growth=(a:number,b:number)=>b?((a-b)/b)*100:0;

export async function GET(){
 try{
  let source="syndicate",rows:any[]=[],brands:any[]=[],retailers:any[]=[],compact=false;
  try{
   const cr=await get("cpgist_brand_weekly?select=brand_id,category,week_ending,sales,units,distribution,avg_price,promo_rate&order=week_ending.asc&limit=100000");
   if(cr.length){
    rows=cr.map((r:any)=>({brand_id:r.brand_id,category:r.category,week_ending:r.week_ending,dollar_sales:r.sales,units:r.units,acv_distribution:r.distribution,promo_rate:r.promo_rate}));
    brands=await get("cpgist_brands?select=id,name,category,parent_company,home_regions&order=name&limit=2000");
    compact=true; source="cpgist_compact";
   }
  }catch{}
  if(!rows.length){
   try{
    rows=await get("syndicate_sales_weekly?select=brand_id,category,week_ending,dollar_sales,units,acv_distribution,promo_observations,observations&order=week_ending.asc&limit=100000");
    brands=await get("syndicate_brands?select=id,name,category,parent_company,home_regions&order=name&limit=2000");
    source="syndicate";
   }catch{
    rows=await get("sales_facts?select=period,sales_value,units,distribution,promo_flag,brand_id&order=period.asc&limit=100000");
    brands=await get("brands?select=id,name&order=name&limit=2000"); source="legacy";
   }
  }

  const periods=[...new Set(rows.map(r=>String(r.week_ending||r.period)))].sort();
  const latestPeriods=periods.slice(-13),priorPeriods=periods.slice(-26,-13);
  const ls=new Set(latestPeriods),ps=new Set(priorPeriods);
  const latestRows=rows.filter(r=>ls.has(String(r.week_ending||r.period))),priorRows=rows.filter(r=>ps.has(String(r.week_ending||r.period)));
  const byWeek=new Map<string,{sales:number;units:number}>();
  for(const r of rows){const p=String(r.week_ending||r.period);const x=byWeek.get(p)||{sales:0,units:0};x.sales+=n(r.dollar_sales??r.sales_value??r.sales);x.units+=n(r.units);byWeek.set(p,x)}
  const weekly=periods.map(p=>({period:p,label:new Date(p).toLocaleDateString("en-US",{month:"short",day:"numeric"}),sales:byWeek.get(p)?.sales||0,units:byWeek.get(p)?.units||0}));
  const agg=(rs:any[])=>({sales:rs.reduce((a,r)=>a+n(r.dollar_sales??r.sales_value??r.sales),0),units:rs.reduce((a,r)=>a+n(r.units),0)});
  const la=agg(latestRows),pa=agg(priorRows);
  const avgDistribution=latestRows.length?latestRows.reduce((a,r)=>a+n(r.acv_distribution??r.distribution??r.distribution),0)/latestRows.length:null;
  const promoRate=compact? (latestRows.length?latestRows.reduce((a,r)=>a+n(r.promo_rate),0)/latestRows.length:null) : (()=>{const po=latestRows.reduce((a,r)=>a+n(r.promo_observations),0),o=latestRows.reduce((a,r)=>a+n(r.observations),0);return o?po/o*100:null})();
  const brandMap=new Map<any,{latest:number;prior:number}>();
  for(const r of rows){const id=r.brand_id;if(id==null)continue;const x=brandMap.get(id)||{latest:0,prior:0};const v=n(r.dollar_sales??r.sales_value??r.sales);const p=String(r.week_ending||r.period);if(ls.has(p))x.latest+=v;else if(ps.has(p))x.prior+=v;brandMap.set(id,x)}
  const total=la.sales;
  const topBrands=[...brandMap.entries()].sort((a,b)=>b[1].latest-a[1].latest).map(([id,x])=>({id,name:brands.find((b:any)=>String(b.id)===String(id))?.name||"Brand "+id,sales:x.latest,share:total?x.latest/total*100:0,growth:growth(x.latest,x.prior),category:brands.find((b:any)=>String(b.id)===String(id))?.category||null,parent_company:brands.find((b:any)=>String(b.id)===String(id))?.parent_company||null}));
  const catMap=new Map<string,{latest:number;prior:number}>();
  for(const r of rows){const c=String(r.category||"Unclassified");const x=catMap.get(c)||{latest:0,prior:0};const v=n(r.dollar_sales??r.sales_value??r.sales);const p=String(r.week_ending||r.period);if(ls.has(p))x.latest+=v;else if(ps.has(p))x.prior+=v;catMap.set(c,x)}
  const categories=[...catMap.entries()].sort((a,b)=>b[1].latest-a[1].latest).map(([name,x])=>({name,sales:x.latest,growth:growth(x.latest,x.prior)}));
  try{
   if(compact){
    const rr=await get("cpgist_retailer_weekly?select=retailer_id,week_ending,sales,units&order=week_ending.asc&limit=100000");
    retailers=await get("cpgist_retailers?select=id,name,channel,region,retailer_group,total_stores&order=name&limit=2000");
    const rm=new Map<any,{latest:number;prior:number}>();
    for(const r of rr){const x=rm.get(r.retailer_id)||{latest:0,prior:0};if(ls.has(String(r.week_ending)))x.latest+=n(r.sales);else if(ps.has(String(r.week_ending)))x.prior+=n(r.sales);rm.set(r.retailer_id,x)}
    retailers=[...rm.entries()].sort((a,b)=>b[1].latest-a[1].latest).map(([id,x])=>{const r=retailers.find((z:any)=>String(z.id)===String(id));return{id,name:r?.name||"Retailer "+id,channel:r?.channel||null,region:r?.region||null,retailer_group:r?.retailer_group||null,sales:x.latest,growth:growth(x.latest,x.prior)}});
   }else{
    const rr=await get("syndicate_retailer_weekly?select=retailer_id,week_ending,dollar_sales,units&order=week_ending.asc&limit=100000");
    const rm=new Map<any,{latest:number;prior:number}>();
    for(const r of rr){const x=rm.get(r.retailer_id)||{latest:0,prior:0};if(ls.has(String(r.week_ending)))x.latest+=n(r.dollar_sales);else if(ps.has(String(r.week_ending)))x.prior+=n(r.dollar_sales);rm.set(r.retailer_id,x)}
    const rd=await get("syndicate_retailers?select=id,name,channel,region,total_stores&order=name&limit=2000");
    retailers=[...rm.entries()].sort((a,b)=>b[1].latest-a[1].latest).map(([id,x])=>{const r=rd.find((z:any)=>String(z.id)===String(id));return{id,name:r?.name||"Retailer "+id,channel:r?.channel||null,region:r?.region||null,total_stores:r?.total_stores||0,sales:x.latest,growth:growth(x.latest,x.prior)}});
   }
  }catch{}
  let regions:any[]=[];
  try{regions=compact?await get("cpgist_regions?select=id,name,country,region_group&order=name&limit=2000"):await get("syndicate_retailers?select=region&order=region&limit=2000").then((x:any[])=>[...new Set(x.map(r=>r.region).filter(Boolean))].map((name,i)=>({id:i+1,name})))}catch{}
  return NextResponse.json({source,compactDataset:compact,rowCount:rows.length,periods,periodCount:periods.length,periodStart:latestPeriods[0]||periods[0]||null,periodEnd:latestPeriods.at(-1)||periods.at(-1)||null,totalSales:la.sales,totalUnits:la.units,avgDistribution,promoRate,growth:growth(la.sales,pa.sales),weekly,topBrands,categories,retailers,regions,latestWindow:latestPeriods,priorWindow:priorPeriods});
 }catch(e:any){return NextResponse.json({error:e?.message||"Dashboard data failed."},{status:500})}
}
