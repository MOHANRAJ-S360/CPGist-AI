import {NextResponse} from "next/server";

const base=()=>({u:process.env.NEXT_PUBLIC_SUPABASE_URL,k:process.env.SUPABASE_SERVICE_ROLE_KEY,p:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY});
async function get(path:string,headers?:Record<string,string>){
 const {u,k}=base();if(!u||!k)throw new Error("Supabase server environment is not configured.");
 const r=await fetch(u+"/rest/v1/"+path,{headers:{apikey:k,Authorization:"Bearer "+k,...headers},cache:"no-store"});
 if(!r.ok)throw new Error(await r.text());return r.json();
}
async function requireUser(req:Request){
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 const {u,p}=base();if(!token||!u||!p)throw new Error("Authentication required.");
 const r=await fetch(u+"/auth/v1/user",{headers:{apikey:p,Authorization:"Bearer "+token},cache:"no-store"});
 if(!r.ok)throw new Error("Your session is no longer valid. Please sign in again.");
 return r.json();
}
const growth=(latest:number,prior:number)=>prior?((latest-prior)/prior)*100:0;
const sum=(rows:any[],field:string)=>rows.reduce((a,r)=>a+Number(r[field]??0),0);

export async function GET(req:Request){
 try{
  await requireUser(req);
  let rows:any[]=[],brands:any[]=[],retailers:any[]=[],categories:any[]=[],source="sales_facts";
  try{
   [rows,brands,retailers,categories]=await Promise.all([
    get("syndicate_sales_weekly?select=brand_id,category,week_ending,dollar_sales,units,acv_distribution,promo_observations,observations&order=week_ending.asc&limit=20000"),
    get("syndicate_brands?select=id,name&order=name&limit=500"),
    get("syndicate_retailers?select=id,name&order=name&limit=500"),
    get("syndicate_category_weekly?select=category,week_ending,dollar_sales,units,acv_distribution,promo_observations,observations&order=week_ending.asc&limit=3000")
   ]);
   if(rows.length)source="syndicate";
  }catch{
   rows=await get("sales_facts?select=period,sales_value,units,distribution,promo_flag,brand_id&order=period.asc&limit=10000");
   brands=await get("brands?select=id,name&limit=500");categories=[];retailers=[];
  }

  const periods=[...new Set(rows.map(r=>String(r.week_ending||r.period)))].sort();
  const latestPeriods=periods.slice(-13),priorPeriods=periods.slice(-26,-13);
  const byWeek=new Map<string,{sales:number,units:number,dist:number,promo:number,obs:number}>();
  for(const r of rows){
   const period=String(r.week_ending||r.period),x=byWeek.get(period)||{sales:0,units:0,dist:0,promo:0,obs:0};
   x.sales+=Number(r.dollar_sales??r.sales_value??0);x.units+=Number(r.units||0);x.dist+=Number(r.acv_distribution??r.distribution??0);x.promo+=Number(r.promo_observations??(r.promo_flag?1:0));x.obs+=Number(r.observations??1);byWeek.set(period,x);
  }
  const weekly=periods.map(p=>({period:p,label:new Date(p).toLocaleDateString("en-US",{month:"short",day:"numeric"}),sales:byWeek.get(p)?.sales||0,units:byWeek.get(p)?.units||0}));
  const latest=weekly.at(-1),prior=weekly.at(-2);
  const latestRows=rows.filter(r=>latestPeriods.includes(String(r.week_ending||r.period)));
  const priorRows=rows.filter(r=>priorPeriods.includes(String(r.week_ending||r.period)));
  const totalSales=sum(latestRows,"dollar_sales")||sum(latestRows,"sales_value");
  const totalUnits=sum(latestRows,"units");
  const totalObs=sum(latestRows,"observations")||latestRows.length;
  const avgDistribution=latestRows.length?latestRows.reduce((a,r)=>a+Number(r.acv_distribution??r.distribution??0),0)/latestRows.length:null;
  const promoRate=totalObs?latestRows.reduce((a,r)=>a+Number(r.promo_observations??(r.promo_flag?1:0)),0)/totalObs*100:null;

  const brandMap=new Map<string,{sales:number;prior:number;name:string}>();
  const brandLookup=new Map(brands.map((b:any)=>[String(b.id),b.name]));
  for(const r of latestRows){const id=String(r.brand_id),x=brandMap.get(id)||{sales:0,prior:0,name:brandLookup.get(id)||"Brand "+id};x.sales+=Number(r.dollar_sales??r.sales_value??0);brandMap.set(id,x)}
  for(const r of priorRows){const id=String(r.brand_id),x=brandMap.get(id)||{sales:0,prior:0,name:brandLookup.get(id)||"Brand "+id};x.prior+=Number(r.dollar_sales??r.sales_value??0);brandMap.set(id,x)}
  const topBrands=[...brandMap.entries()].sort((a,b)=>b[1].sales-a[1].sales).slice(0,12).map(([id,x])=>({id,name:x.name,sales:x.sales,share:totalSales?x.sales/totalSales*100:0,growth:growth(x.sales,x.prior)}));
  const leaderId=topBrands[0]?.id;
  const brandTrend=weekly.filter(x=>periods.indexOf(x.period)>=Math.max(0,periods.length-26)).map(x=>{const matching=rows.filter(r=>String(r.brand_id)===String(leaderId)&&String(r.week_ending||r.period)===x.period);return {label:x.label,sales:sum(matching,"dollar_sales")||sum(matching,"sales_value")}});

  const categoryMap=new Map<string,{sales:number;prior:number}>();
  for(const r of latestRows){const name=String(r.category||"Unclassified"),x=categoryMap.get(name)||{sales:0,prior:0};x.sales+=Number(r.dollar_sales??r.sales_value??0);categoryMap.set(name,x)}
  for(const r of priorRows){const name=String(r.category||"Unclassified"),x=categoryMap.get(name)||{sales:0,prior:0};x.prior+=Number(r.dollar_sales??r.sales_value??0);categoryMap.set(name,x)}
  const categoryPerformance=[...categoryMap.entries()].sort((a,b)=>b[1].sales-a[1].sales).slice(0,12).map(([name,x])=>({name,sales:x.sales,growth:growth(x.sales,x.prior)}));

  let retailerPerformance:any[]=[];
  try{
   const rr=await get("syndicate_retailer_weekly?select=retailer_id,week_ending,dollar_sales,units,acv_distribution,observations&order=week_ending.asc&limit=25000");
   const rmap=new Map<string,{sales:number;prior:number;name:string}>(),lookup=new Map(retailers.map((r:any)=>[String(r.id),r.name]));
   for(const r of rr){const id=String(r.retailer_id),x=rmap.get(id)||{sales:0,prior:0,name:lookup.get(id)||"Retailer "+id};const p=String(r.week_ending);if(latestPeriods.includes(p))x.sales+=Number(r.dollar_sales||0);else if(priorPeriods.includes(p))x.prior+=Number(r.dollar_sales||0);rmap.set(id,x)}
   retailerPerformance=[...rmap.entries()].sort((a,b)=>b[1].sales-a[1].sales).slice(0,15).map(([id,x])=>({id,name:x.name,sales:x.sales,growth:growth(x.sales,x.prior)}));
  }catch{}

  const alerts=[
   {type:"MARKET",title:latest&&prior&&latest.sales<prior.sales?"Latest weekly sales softened":"Latest weekly sales increased",text:"Latest completed week is "+(latest?.period||"—")+" versus "+(prior?.period||"—")+".",tone:latest&&prior&&latest.sales<prior.sales?"negative":"positive",period:latest?.period||"—"},
   {type:"SHARE",title:(topBrands[0]?.name||"Leading brand")+" leads observed value",text:(topBrands[0]?.share?.toFixed(1)||"—")+"% share in the latest 13-week window.",tone:"positive",period:latestPeriods[0]+" → "+latestPeriods.at(-1)},
   {type:"DATA",title:"Coverage is source-anchored",text:rows.length.toLocaleString()+" weekly source observations are available for the current workspace.",tone:"positive",period:periods[0]+" → "+periods.at(-1)}
  ];

  return NextResponse.json({
   source,rowCount:rows.length,periods,periodCount:periods.length,periodStart:periods[0],periodEnd:periods.at(-1),
   latestWindow:latestPeriods.length+" weeks",totalSales,totalUnits,avgDistribution,promoRate,
   growth:latest&&prior&&prior.sales?((latest.sales-prior.sales)/prior.sales):0,
   weekly,maxWeekly:Math.max(...weekly.map(x=>x.sales),1),topBrands,brandTrend,categories:categoryPerformance,retailers:retailerPerformance,alerts
  });
 }catch(e:any){return NextResponse.json({error:e.message||"Dashboard data failed."},{status:401})}
}
