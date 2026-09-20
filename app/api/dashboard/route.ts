import {NextResponse} from "next/server";

const base=()=>({u:process.env.NEXT_PUBLIC_SUPABASE_URL,k:process.env.SUPABASE_SERVICE_ROLE_KEY});
async function get(path:string){
 const {u,k}=base();if(!u||!k)throw new Error("Supabase server environment is not configured.");
 const r=await fetch(u+"/rest/v1/"+path,{headers:{apikey:k,Authorization:"Bearer "+k},cache:"no-store"});
 if(!r.ok)throw new Error(await r.text());return r.json();
}
const n=(v:any)=>Number(v??0)||0;
const growth=(latest:number,prior:number)=>prior?((latest-prior)/prior):0;

export async function GET(){
 try{
  const compact:any[]=await get("cpgist_brands?select=id&limit=1");
  if(!compact.length){
   return NextResponse.json({
    error:"The CPGist Free Dataset is not imported yet. Open Data Import and upload CPGist_Supabase_Free_Dataset.zip. The dashboard will not fall back to the legacy Syndicate dataset.",
    code:"COMPACT_DATASET_REQUIRED"
   },{status:503});
  }

  const [brandRows,categoryRows,retailerRows,brands,retailers]=await Promise.all([
   get("cpgist_brand_weekly?select=brand_id,category,week_ending,sales,units,distribution,avg_price,promo_rate&order=week_ending.asc&limit=100000"),
   get("cpgist_category_weekly?select=category,week_ending,sales,units,distribution&order=week_ending.asc&limit=10000"),
   get("cpgist_retailer_weekly?select=retailer_id,week_ending,sales,units,distribution&order=week_ending.asc&limit=100000"),
   get("cpgist_brands?select=id,name,category,parent_company,home_regions,portfolio&order=name&limit=5000"),
   get("cpgist_retailers?select=id,name,channel,region,retailer_group,total_stores&order=name&limit=5000")
  ]);

  const periods=[...new Set(brandRows.map((r:any)=>String(r.week_ending)).filter(Boolean))].sort();
  if(periods.length<13)throw new Error("CPGist Free Dataset has fewer than 13 weekly periods.");
  const latestPeriods=periods.slice(-13),priorPeriods=periods.slice(-26,-13),latestSet=new Set(latestPeriods),priorSet=new Set(priorPeriods);
  const periodStart=periods[0],periodEnd=periods.at(-1);

  const agg=(rows:any[],periodSet:Set<string>)=>{
   const sales=rows.filter((r:any)=>periodSet.has(String(r.week_ending))).reduce((a,r)=>a+n(r.sales),0);
   const units=rows.filter((r:any)=>periodSet.has(String(r.week_ending))).reduce((a,r)=>a+n(r.units),0);
   const distRows=rows.filter((r:any)=>periodSet.has(String(r.week_ending))&&r.distribution!=null);
   return {sales,units,avgDistribution:distRows.length?distRows.reduce((a,r)=>a+n(r.distribution),0)/distRows.length:null};
  };
  const latest=agg(brandRows,latestSet),prior=agg(brandRows,priorSet);

  const weekly=periods.map(p=>{
   const rs=brandRows.filter(r=>String(r.week_ending)===p);
   return {period:p,label:new Date(p+"T00:00:00Z").toLocaleDateString("en-US",{month:"short",day:"numeric"}),sales:rs.reduce((a,r)=>a+n(r.sales),0),units:rs.reduce((a,r)=>a+n(r.units),0)};
  });

  const brandAgg=new Map<number,any>();
  for(const r of (brandRows as any[])){
   const id=n(r.brand_id);if(!id)continue;
   const x=brandAgg.get(id)||{sales:0,units:0,dist:0,distN:0,category:r.category};
   if(latestSet.has(String(r.week_ending))){x.sales+=n(r.sales);x.units+=n(r.units);if(r.distribution!=null){x.dist+=n(r.distribution);x.distN++}}
   brandAgg.set(id,x);
  }
  const categoryAgg=new Map<string,any>();
  for(const r of (categoryRows as any[])){
   const key=String(r.category||"Unclassified");
   const x=categoryAgg.get(key)||{sales:0,priorSales:0,dist:0,n:0};
   if(latestSet.has(String(r.week_ending))){x.sales+=n(r.sales);if(r.distribution!=null){x.dist+=n(r.distribution);x.n++}}
   else if(priorSet.has(String(r.week_ending)))x.priorSales+=n(r.sales);
   categoryAgg.set(key,x);
  }
  const retailerAgg=new Map<number,any>();
  for(const r of (retailerRows as any[])){
   const id=n(r.retailer_id);if(!id)continue;
   const x=retailerAgg.get(id)||{sales:0,priorSales:0};
   if(latestSet.has(String(r.week_ending)))x.sales+=n(r.sales);
   else if(priorSet.has(String(r.week_ending)))x.priorSales+=n(r.sales);
   retailerAgg.set(id,x);
  }
  const totalLatest=latest.sales;
  const topBrands=(brands as any[]).map((b:any)=>{
   const x=brandAgg.get(n(b.id))||{sales:0,units:0,category:b.category};
   return {...b,sales:x.sales,units:x.units,share:totalLatest?x.sales/totalLatest*100:0,growth:growth(x.sales,priorSet.size?brandRows.filter((r:any)=>n(r.brand_id)===n(b.id)&&priorSet.has(String(r.week_ending))).reduce((a,r)=>a+n(r.sales),0):0),distribution:x.distN?x.dist/x.distN:null};
  }).sort((a:any,b:any)=>b.sales-a.sales);
  const categories=[...categoryAgg.entries()].map(([name,x])=>({name,sales:x.sales,growth:growth(x.sales,x.priorSales),distribution:x.n?x.dist/x.n:null})).sort((a,b)=>b.sales-a.sales);
  const retailerById=new Map((retailers as any[]).map((r:any)=>[n(r.id),r]));
  const retailerOut=[...retailerAgg.entries()].map(([id,x])=>({...retailerById.get(id),id,sales:x.sales,growth:growth(x.sales,x.priorSales)})).filter((x:any)=>x.name).sort((a:any,b:any)=>b.sales-a.sales);

  return NextResponse.json({
   source:"cpgist_compact",compactDataset:true,datasetName:"CPGist Free Dataset",
   periodStart,periodEnd,periods,latestWindow:latestPeriods,priorWindow:priorPeriods,
   totalSales:latest.sales,totalUnits:latest.units,avgDistribution:latest.avgDistribution,
   promoRate:null,growth:growth(latest.sales,prior.sales),weekly,topBrands,categories,retailers:retailerOut
  });
 }catch(e:any){return NextResponse.json({error:e?.message||"Dashboard data failed."},{status:500})}
}
