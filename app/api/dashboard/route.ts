import {NextResponse} from "next/server";

const base=()=>({u:process.env.NEXT_PUBLIC_SUPABASE_URL,k:process.env.SUPABASE_SERVICE_ROLE_KEY});
async function get(path:string){
 const {u,k}=base();
 if(!u||!k)throw new Error("Supabase server environment is not configured.");
 const r=await fetch(u+"/rest/v1/"+path,{headers:{apikey:k,Authorization:"Bearer "+k},cache:"no-store"});
 if(!r.ok)throw new Error(await r.text());
 return r.json();
}
const sum=(rows:any[],key:string)=>rows.reduce((a,r)=>a+Number(r[key]??0),0);
const growth=(latest:number,prior:number)=>prior?((latest-prior)/prior)*100:0;

export async function GET(){
 try{
  let rows:any[]=[];let brands:any[]=[];let source="sales_facts";
  try{
   rows=await get("syndicate_sales_weekly?select=brand_id,category,week_ending,dollar_sales,units,acv_distribution,promo_observations,observations&order=week_ending.asc&limit=20000");
   brands=await get("syndicate_brands?select=id,name,category,parent_company&order=name&limit=500");
   if(rows.length)source="syndicate";
  }catch{
   rows=await get("sales_facts?select=period,sales_value,units,distribution,promo_flag,brand_id&order=period.asc&limit=20000");
   brands=await get("brands?select=id,name,category,parent_company&limit=500");
  }
  const periods=[...new Set(rows.map(r=>String(r.week_ending||r.period)))].sort();
  const latestPeriods=periods.slice(-13),priorPeriods=periods.slice(-26,-13);
  const latestSet=new Set(latestPeriods),priorSet=new Set(priorPeriods);
  const latestRows=rows.filter(r=>latestSet.has(String(r.week_ending||r.period)));
  const priorRows=rows.filter(r=>priorSet.has(String(r.week_ending||r.period)));
  const byWeek=new Map<string,{sales:number,units:number}>();
  for(const r of rows){const p=String(r.week_ending||r.period);const x=byWeek.get(p)||{sales:0,units:0};x.sales+=Number(r.dollar_sales??r.sales_value??0);x.units+=Number(r.units||0);byWeek.set(p,x)}
  const weekly=periods.map(p=>({period:p,label:new Date(p).toLocaleDateString("en-US",{month:"short",day:"numeric"}),sales:byWeek.get(p)?.sales||0,units:byWeek.get(p)?.units||0}));
  const latestSales=sum(latestRows,"dollar_sales")||sum(latestRows,"sales_value");
  const priorSales=sum(priorRows,"dollar_sales")||sum(priorRows,"sales_value");
  const latestUnits=sum(latestRows,"units"), avgDistribution=latestRows.length?latestRows.reduce((a,r)=>a+Number(r.acv_distribution??r.distribution??0),0)/latestRows.length:null;
  const promoObs=latestRows.reduce((a,r)=>a+Number(r.promo_observations||0),0),obs=latestRows.reduce((a,r)=>a+Number(r.observations||0),0);
  const total=latestSales;
  const brandMap=new Map<any,{latest:number;prior:number}>();
  for(const r of rows){const id=r.brand_id;if(id==null)continue;const x=brandMap.get(id)||{latest:0,prior:0};const v=Number(r.dollar_sales??r.sales_value??0);const p=String(r.week_ending||r.period);if(latestSet.has(p))x.latest+=v;else if(priorSet.has(p))x.prior+=v;brandMap.set(id,x)}
  const topBrands=[...brandMap.entries()].sort((a,b)=>b[1].latest-a[1].latest).slice(0,10).map(([id,x])=>({id,name:brands.find(b=>String(b.id)===String(id))?.name||"Brand "+id,sales:x.latest,share:total?x.latest/total*100:0,growth:growth(x.latest,x.prior)}));
  const catMap=new Map<string,{latest:number;prior:number}>();
  for(const r of rows){const c=String(r.category||"Unclassified");const x=catMap.get(c)||{latest:0,prior:0};const v=Number(r.dollar_sales??r.sales_value??0);const p=String(r.week_ending||r.period);if(latestSet.has(p))x.latest+=v;else if(priorSet.has(p))x.prior+=v;catMap.set(c,x)}
  const categories=[...catMap.entries()].sort((a,b)=>b[1].latest-a[1].latest).map(([name,x])=>({name,sales:x.latest,growth:growth(x.latest,x.prior)}));
  let retailers:any[]=[];
  try{
   const rr=await get("syndicate_retailer_weekly?select=retailer_id,week_ending,dollar_sales,units&order=week_ending.asc&limit=30000");
   const rm=new Map<any,{latest:number;prior:number}>();
   for(const r of rr){const id=r.retailer_id;const x=rm.get(id)||{latest:0,prior:0};const v=Number(r.dollar_sales||0);if(latestSet.has(String(r.week_ending)))x.latest+=v;else if(priorSet.has(String(r.week_ending)))x.prior+=v;rm.set(id,x)}
   const rs=await get("syndicate_retailers?select=id,name,channel,region,total_stores&order=name&limit=300");
   retailers=[...rm.entries()].sort((a,b)=>b[1].latest-a[1].latest).slice(0,12).map(([id,x])=>{const r=rs.find((z:any)=>String(z.id)===String(id));return{id,name:r?.name||"Retailer "+id,sales:x.latest,growth:growth(x.latest,x.prior)}});
  }catch{}
  return NextResponse.json({
   source,rowCount:rows.length,periods,periodCount:periods.length,periodStart:latestPeriods[0]||periods[0]||null,periodEnd:latestPeriods.at(-1)||periods.at(-1)||null,
   totalSales:latestSales,totalUnits:latestUnits,avgDistribution,promoRate:obs?promoObs/obs*100:null,
   growth:growth(latestSales,priorSales),weekly,maxWeekly:Math.max(...weekly.map(x=>x.sales),1),topBrands,categories,retailers,
   latestWindow:latestPeriods,priorWindow:priorPeriods
  });
 }catch(e:any){return NextResponse.json({error:e.message},{status:500})}
}