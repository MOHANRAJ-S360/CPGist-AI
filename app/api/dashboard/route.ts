import {NextResponse} from "next/server";

export const dynamic="force-dynamic";

const config=()=>({url:process.env.NEXT_PUBLIC_SUPABASE_URL,publishable:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,service:process.env.SUPABASE_SERVICE_ROLE_KEY});

async function rest(path:string){
 const c=config();
 if(!c.url||!c.service)throw new Error("Supabase server environment is not configured.");
 const response=await fetch(c.url+"/rest/v1/"+path,{headers:{apikey:c.service,Authorization:"Bearer "+c.service},cache:"no-store"});
 if(!response.ok)throw new Error(await response.text());
 return response.json();
}

async function verify(req:Request){
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 const c=config();
 if(!token||!c.url||!c.publishable)throw new Error("Authentication required.");
 const response=await fetch(c.url+"/auth/v1/user",{headers:{apikey:c.publishable,Authorization:"Bearer "+token},cache:"no-store"});
 if(!response.ok)throw new Error("Your session is no longer valid. Please sign in again.");
}

function value(row:any){return Number(row.dollar_sales??row.sales_value??0)}
function period(row:any){return String(row.week_ending??row.period)}
function sumRows(rows:any[]){let total=0;for(const row of rows)total+=value(row);return total}
function growth(latest:number,prior:number){return prior?((latest-prior)/prior)*100:0}

export async function GET(req:Request){
 try{
  await verify(req);
  let rows:any[]=[],brands:any[]=[],retailers:any[]=[];
  let source="sales_facts";
  try{
   rows=await rest("syndicate_sales_weekly?select=brand_id,category,week_ending,dollar_sales,units,acv_distribution,promo_observations,observations&order=week_ending.asc&limit=20000");
   brands=await rest("syndicate_brands?select=id,name&order=name&limit=500");
   retailers=await rest("syndicate_retailers?select=id,name&order=name&limit=500");
   if(rows.length)source="syndicate";
  }catch{
   rows=await rest("sales_facts?select=period,sales_value,units,distribution,promo_flag,brand_id&order=period.asc&limit=10000");
   brands=await rest("brands?select=id,name&limit=500");
  }

  const periodSet=new Set<string>();
  for(const row of rows)periodSet.add(period(row));
  const periods=Array.from(periodSet).sort();
  const latestPeriods=periods.slice(Math.max(0,periods.length-13));
  const priorPeriods=periods.slice(Math.max(0,periods.length-26),Math.max(0,periods.length-13));
  const latestSet=new Set(latestPeriods),priorSet=new Set(priorPeriods);

  const byWeek:Record<string,any>={};
  for(const row of rows){
   const p=period(row);
   if(!byWeek[p])byWeek[p]={sales:0,units:0};
   byWeek[p].sales+=value(row);
   byWeek[p].units+=Number(row.units||0);
  }
  const weekly=periods.map(p=>({period:p,label:new Date(p).toLocaleDateString("en-US",{month:"short",day:"numeric"}),sales:byWeek[p].sales,units:byWeek[p].units}));

  const latestRows=rows.filter(row=>latestSet.has(period(row)));
  const priorRows=rows.filter(row=>priorSet.has(period(row)));
  const totalSales=sumRows(latestRows);
  let totalUnits=0,totalDistribution=0,totalPromo=0,totalObs=0;
  for(const row of latestRows){
   totalUnits+=Number(row.units||0);
   totalDistribution+=Number(row.acv_distribution??row.distribution??0);
   totalPromo+=Number(row.promo_observations??(row.promo_flag?1:0));
   totalObs+=Number(row.observations??1);
  }

  const brandNames:Record<string,string>={};
  for(const brand of brands)brandNames[String(brand.id)]=brand.name;
  const brandMap:Record<string,any>={};
  for(const row of latestRows){const id=String(row.brand_id??"unknown");if(!brandMap[id])brandMap[id]={sales:0,prior:0,name:brandNames[id]||("Brand "+id)};brandMap[id].sales+=value(row)}
  for(const row of priorRows){const id=String(row.brand_id??"unknown");if(!brandMap[id])brandMap[id]={sales:0,prior:0,name:brandNames[id]||("Brand "+id)};brandMap[id].prior+=value(row)}
  const topBrands=Object.entries(brandMap).sort((a:any,b:any)=>b[1].sales-a[1].sales).slice(0,12).map(([id,x]:any)=>({id,name:x.name,sales:x.sales,share:totalSales?x.sales/totalSales*100:0,growth:growth(x.sales,x.prior)}));

  const categoryMap:Record<string,any>={};
  for(const row of latestRows){const name=String(row.category||"Unclassified");if(!categoryMap[name])categoryMap[name]={sales:0,prior:0};categoryMap[name].sales+=value(row)}
  for(const row of priorRows){const name=String(row.category||"Unclassified");if(!categoryMap[name])categoryMap[name]={sales:0,prior:0};categoryMap[name].prior+=value(row)}
  const categories=Object.entries(categoryMap).sort((a:any,b:any)=>b[1].sales-a[1].sales).slice(0,12).map(([name,x]:any)=>({name,sales:x.sales,growth:growth(x.sales,x.prior)}));

  const leaderId=topBrands.length?String(topBrands[0].id):"";
  const brandTrend=[];
  for(let i=Math.max(0,periods.length-26);i<periods.length;i++){
   const p=periods[i];let sales=0;
   for(const row of rows)if(String(row.brand_id)===leaderId&&period(row)===p)sales+=value(row);
   brandTrend.push({label:new Date(p).toLocaleDateString("en-US",{month:"short",day:"numeric"}),sales});
  }

  const retailerPerformance:any[]=[];
  try{
   const retailerRows=await rest("syndicate_retailer_weekly?select=retailer_id,week_ending,dollar_sales&order=week_ending.asc&limit=25000");
   const names:Record<string,string>={};for(const retailer of retailers)names[String(retailer.id)]=retailer.name;
   const map:Record<string,any>={};
   for(const row of retailerRows){const id=String(row.retailer_id);if(!map[id])map[id]={sales:0,prior:0,name:names[id]||("Retailer "+id)};if(latestSet.has(String(row.week_ending)))map[id].sales+=Number(row.dollar_sales||0);if(priorSet.has(String(row.week_ending)))map[id].prior+=Number(row.dollar_sales||0)}
   for(const entry of Object.entries(map).sort((a:any,b:any)=>b[1].sales-a[1].sales).slice(0,15))retailerPerformance.push({id:entry[0],name:(entry[1] as any).name,sales:(entry[1] as any).sales,growth:growth((entry[1] as any).sales,(entry[1] as any).prior)});
  }catch{}

  const latestWeek=weekly.length?weekly[weekly.length-1]:null;
  const previousWeek=weekly.length>1?weekly[weekly.length-2]:null;
  const alerts=[
   {type:"MARKET",title:latestWeek&&previousWeek&&latestWeek.sales<previousWeek.sales?"Latest weekly sales softened":"Latest weekly sales increased",text:"Latest completed week is "+(latestWeek?.period||"—")+" versus "+(previousWeek?.period||"—")+".",tone:latestWeek&&previousWeek&&latestWeek.sales<previousWeek.sales?"negative":"positive",period:latestWeek?.period||"—"},
   {type:"SHARE",title:(topBrands[0]?.name||"Leading brand")+" leads observed value",text:(topBrands[0]?.share?.toFixed(1)||"—")+"% share in the latest 13-week window.",tone:"positive",period:(latestPeriods[0]||"—")+" → "+(latestPeriods[latestPeriods.length-1]||"—")},
   {type:"DATA",title:"Coverage is source-anchored",text:rows.length.toLocaleString()+" weekly source observations are available for the current workspace.",tone:"positive",period:(periods[0]||"—")+" → "+(periods[periods.length-1]||"—")}
  ];

  return NextResponse.json({
   source,rowCount:rows.length,periods,periodCount:periods.length,periodStart:periods[0]||null,periodEnd:periods[periods.length-1]||null,
   latestWindow:latestPeriods.length+" weeks",totalSales,totalUnits,
   avgDistribution:latestRows.length?totalDistribution/latestRows.length:null,
   promoRate:totalObs?totalPromo/totalObs*100:null,
   growth:latestWeek&&previousWeek&&previousWeek.sales?((latestWeek.sales-previousWeek.sales)/previousWeek.sales):0,
   weekly,maxWeekly:Math.max(...weekly.map(x=>x.sales),1),topBrands,brandTrend,categories,retailers:retailerPerformance,alerts
  });
 }catch(error:any){return NextResponse.json({error:error?.message||"Dashboard data failed."},{status:401})}
}
