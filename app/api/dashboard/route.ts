import {NextResponse} from "next/server";

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
const periodSet=(rows:any[])=>[...new Set(rows.map((r:any)=>String(r.week_ending||r.period)).filter(Boolean))].sort();
const windowRows=(rows:any[],periods:string[])=>{const s=new Set(periods);return rows.filter((r:any)=>s.has(String(r.week_ending||r.period)))};
const agg=(rows:any[],salesKey:string)=>{
  const sales=rows.reduce((a:number,r:any)=>a+n(r[salesKey]),0);
  return {sales,units:rows.reduce((a:number,r:any)=>a+n(r.units),0),distribution:rows.length?rows.reduce((a:number,r:any)=>a+n(r.acv_distribution??r.distribution),0)/rows.length:null};
};

export async function GET(){
 try{
  let compact=false;
  try{const x=await get("cpgist_brands?select=id&limit=1");compact=Array.isArray(x)&&x.length>0}catch{}

  if(compact){
    const [brands,rows]=await Promise.all([
      get("cpgist_brands?select=id,name,category,parent_company,home_regions&order=name&limit=2000"),
      get("cpgist_brand_weekly?select=brand_id,category,week_ending,sales,units,distribution,avg_price,promo_rate&order=week_ending.asc&limit=100000")
    ]);
    const periods=periodSet(rows),latestPeriods=periods.slice(-13),priorPeriods=periods.slice(-26,-13);
    const latest=agg(windowRows(rows,latestPeriods),"sales"),prior=agg(windowRows(rows,priorPeriods),"sales");
    const weekly=periods.map(p=>{const rr=rows.filter((r:any)=>String(r.week_ending)===p);return{period:p,label:new Date(p).toLocaleDateString("en-US",{month:"short",day:"numeric"}),sales:rr.reduce((a:number,r:any)=>a+n(r.sales),0),units:rr.reduce((a:number,r:any)=>a+n(r.units),0)}});
    const brandMap=new Map<string,any>();
    for(const r of rows){const id=String(r.brand_id);const x=brandMap.get(id)||{id,name:"",salesLatest:0,salesPrior:0};x.salesLatest+=latestPeriods.includes(String(r.week_ending))?n(r.sales):0;x.salesPrior+=priorPeriods.includes(String(r.week_ending))?n(r.sales):0;brandMap.set(id,x);}
    const brandsById=new Map<string,any>(brands.map((b:any)=>[String(b.id),b]));
    const total=latest.sales;
    const topBrands=[...brandMap.values()].map((x:any)=>{const b=brandsById.get(x.id)||{};return{id:x.id,name:b.name||("Brand "+x.id),category:b.category||"",parent_company:b.parent_company||"",home_regions:b.home_regions||"",sales:x.salesLatest,priorSales:x.salesPrior,share:total?x.salesLatest/total*100:0,growth:pct(x.salesLatest,x.salesPrior)}}).sort((a:any,b:any)=>b.sales-a.sales);
    const categoryMap=new Map<string,any>();
    for(const r of rows){if(!latestPeriods.includes(String(r.week_ending)))continue;const key=String(r.category||"Unclassified");const x=categoryMap.get(key)||{name:key,sales:0,priorSales:0};x.sales+=n(r.sales);categoryMap.set(key,x);}
    for(const r of rows){if(!priorPeriods.includes(String(r.week_ending)))continue;const key=String(r.category||"Unclassified");const x=categoryMap.get(key)||{name:key,sales:0,priorSales:0};x.priorSales+=n(r.sales);categoryMap.set(key,x);}
    const categories=[...categoryMap.values()].map((x:any)=>({...x,growth:pct(x.sales,x.priorSales)})).sort((a:any,b:any)=>b.sales-a.sales);
    let retailers:any[]=[];
    try{
      const rr=await get("cpgist_brand_retailer_weekly?select=retailer_id,week_ending,sales,units,distribution&order=week_ending.asc&limit=100000");
      const rm=await get("cpgist_retailers?select=id,name,channel,region,retailer_group,total_stores&order=name&limit=2000");
      const map=new Map<string,number>();for(const r of rr)if(latestPeriods.includes(String(r.week_ending)))map.set(String(r.retailer_id),(map.get(String(r.retailer_id))||0)+n(r.sales));
      retailers=[...map.entries()].map(([id,sales])=>{const b=rm.find((x:any)=>String(x.id)===id)||{};return{id,name:b.name||("Retailer "+id),sales,channel:b.channel||"",region:b.region||"",retailer_group:b.retailer_group||"",total_stores:b.total_stores??null}}).sort((a,b)=>b.sales-a.sales);
    }catch{}
    return NextResponse.json({source:"cpgist_compact",rowCount:rows.length,totalSales:latest.sales,totalUnits:latest.units,avgDistribution:latest.distribution,growth:pct(latest.sales,prior.sales),periods,periodEnd:periods.at(-1)||null,weekly,topBrands,categories,retailers,brandCount:brands.length,categoryCount:categories.length,retailerCount:retailers.length});
  }

  // The old Syndicate dataset is retained only for legacy import compatibility; it is
  // never a silent fallback for the client-facing workspace.
  return NextResponse.json({error:"CPGist Free Dataset is not imported yet. Open Data Import and load CPGist_Supabase_Free_Dataset.zip before using the client workspace.",code:"COMPACT_DATASET_REQUIRED"},{status:503});
 }catch(e:any){return NextResponse.json({error:e?.message||"Dashboard data failed."},{status:500})}
}