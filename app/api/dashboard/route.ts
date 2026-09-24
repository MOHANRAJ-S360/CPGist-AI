// Production redeploy marker: 2026-09-20
import {NextResponse} from "next/server";

const base=()=>({u:process.env.NEXT_PUBLIC_SUPABASE_URL,k:process.env.SUPABASE_SERVICE_ROLE_KEY});
async function get(path:string){
 const {u,k}=base();if(!u||!k)throw new Error("Supabase server environment is not configured.");
 const r=await fetch(u+"/rest/v1/"+path,{headers:{apikey:k,Authorization:"Bearer "+k},cache:"no-store"});
 if(!r.ok)throw new Error(await r.text());return r.json();
}

// Supabase/PostgREST returns at most 1,000 rows per request by default.
// The compact dataset contains tens of thousands of weekly observations, so
// dashboard queries must paginate instead of assuming ?limit=100000 bypasses
// the API row cap.
async function getPaged(path:string,pageSize=1000,maxPages=100){
 const out:any[]=[];
 for(let page=0;page<maxPages;page++){
  const offset=page*pageSize;
  const joiner=path.includes("?")?"&":"?";
  const rows:any[]=await get(path+joiner+"limit="+pageSize+"&offset="+offset);
  out.push(...rows);
  if(rows.length<pageSize)break;
 }
 return out;
}

const n=(v:any)=>Number(v??0)||0;
const growth=(latest:number,prior:number)=>prior?((latest-prior)/prior):0;

function isoWeeksBefore(iso:string,weeks:number){
 const d=new Date(iso+"T00:00:00Z");
 d.setUTCDate(d.getUTCDate()-weeks*7);
 return d.toISOString().slice(0,10);
}

export async function GET(){
 try{
  const compact:any[]=await get("cpgist_brands?select=id&limit=1");
  if(!compact.length){
   return NextResponse.json({
    error:"The CPGist Free Dataset is not imported yet. Open Data Import and upload CPGist_Supabase_Free_Dataset.zip. The dashboard will not fall back to the legacy Syndicate dataset.",
    code:"COMPACT_DATASET_REQUIRED"
   },{status:503});
  }

  // Find the actual latest completed source week first. This keeps the
  // dashboard aligned to the uploaded dataset rather than a hard-coded year.
  const latestRow:any[]=await get("cpgist_brand_weekly?select=week_ending&order=week_ending.desc&limit=1");
  const latestWeek=String(latestRow?.[0]?.week_ending||"");
  if(!latestWeek)throw new Error("CPGist Free Dataset has no weekly observations.");
  const cutoff=isoWeeksBefore(latestWeek,25);

  // Pull only the latest 26 source periods, but paginate each table because
  // Supabase Free's REST API caps each response at 1,000 rows.
  const [brandRows,categoryRows,retailerRows,brands,retailers]=await Promise.all([
   getPaged("cpgist_brand_weekly?select=brand_id,category,week_ending,sales,units,distribution,avg_price,promo_rate,is_actual&week_ending=gte."+cutoff+"&order=week_ending.asc,brand_id.asc"),
   getPaged("cpgist_category_weekly?select=category,week_ending,sales,units,distribution&week_ending=gte."+cutoff+"&order=week_ending.asc,category.asc"),
   getPaged("cpgist_retailer_weekly?select=retailer_id,week_ending,sales,units,distribution&week_ending=gte."+cutoff+"&order=week_ending.asc,retailer_id.asc"),
   get("cpgist_brands?select=id,name,category,parent_company,home_regions,portfolio&order=name&limit=5000"),
   get("cpgist_retailers?select=id,name,channel,region,retailer_group,total_stores&order=name&limit=5000")
  ]);

  const periods:string[]=[...new Set<string>((brandRows as any[]).map((r:any)=>String(r.week_ending)).filter(Boolean))].sort();
  if(periods.length<13){
   throw new Error("CPGist Free Dataset returned fewer than 13 weekly periods for the dashboard window. The uploaded dataset should contain at least 13 completed weeks.");
  }

  const latestPeriods=periods.slice(-13);
  const priorPeriods=periods.slice(-26,-13);
  const latestSet=new Set<string>(latestPeriods),priorSet=new Set<string>(priorPeriods);
  const periodStart=periods[0],periodEnd=periods.at(-1);
  const actualPeriods=periods.filter(p=>brandRows.filter((r:any)=>String(r.week_ending)===p).every((r:any)=>r.is_actual===true));
  const syntheticPeriods=periods.filter(p=>brandRows.filter((r:any)=>String(r.week_ending)===p).some((r:any)=>r.is_actual===false));
  const provenance={actualWeeks:actualPeriods.length,syntheticWeeks:syntheticPeriods.length,totalWeeks:periods.length,status:syntheticPeriods.length?"mixed":"actual",label:syntheticPeriods.length?syntheticPeriods.length+" of "+periods.length+" weeks in this view are projected, not observed":null,sourceOfTruth:"is_actual"};

  const agg=(rows:any[],periodSet:Set<string>)=>{
   const scoped=rows.filter((r:any)=>periodSet.has(String(r.week_ending)));
   const sales=scoped.reduce((a:number,r:any)=>a+n(r.sales),0);
   const units=scoped.reduce((a:number,r:any)=>a+n(r.units),0);
   const distRows=scoped.filter((r:any)=>r.distribution!=null);
   return {sales,units,avgDistribution:distRows.length?distRows.reduce((a:number,r:any)=>a+n(r.distribution),0)/distRows.length:null};
  };

  const latest=agg(brandRows,latestSet),prior=agg(brandRows,priorSet);

  const weekly=periods.map(p=>{
   const rs=brandRows.filter((r:any)=>String(r.week_ending)===p);
   return {
    period:p,
    label:new Date(p+"T00:00:00Z").toLocaleDateString("en-US",{month:"short",day:"numeric"}),
    sales:rs.reduce((a:number,r:any)=>a+n(r.sales),0),
    units:rs.reduce((a:number,r:any)=>a+n(r.units),0),
    is_actual:rs.every((r:any)=>r.is_actual===true)?true:(rs.some((r:any)=>r.is_actual===false)?false:null)
   };
  });

  const brandAgg=new Map<number,any>();
  for(const r of brandRows){
   const id=n(r.brand_id);if(!id)continue;
   const x=brandAgg.get(id)||{sales:0,units:0,dist:0,distN:0,category:r.category,priorSales:0};
   if(latestSet.has(String(r.week_ending))){
    x.sales+=n(r.sales);x.units+=n(r.units);
    if(r.distribution!=null){x.dist+=n(r.distribution);x.distN++}
   }else if(priorSet.has(String(r.week_ending))){
    x.priorSales+=n(r.sales);
   }
   brandAgg.set(id,x);
  }

  const categoryAgg=new Map<string,any>();
  for(const r of categoryRows){
   const key=String(r.category||"Unclassified");
   const x=categoryAgg.get(key)||{sales:0,priorSales:0,dist:0,n:0};
   if(latestSet.has(String(r.week_ending))){
    x.sales+=n(r.sales);if(r.distribution!=null){x.dist+=n(r.distribution);x.n++}
   }else if(priorSet.has(String(r.week_ending)))x.priorSales+=n(r.sales);
   categoryAgg.set(key,x);
  }

  const retailerAgg=new Map<number,any>();
  for(const r of retailerRows){
   const id=n(r.retailer_id);if(!id)continue;
   const x=retailerAgg.get(id)||{sales:0,priorSales:0};
   if(latestSet.has(String(r.week_ending)))x.sales+=n(r.sales);
   else if(priorSet.has(String(r.week_ending)))x.priorSales+=n(r.sales);
   retailerAgg.set(id,x);
  }

  const totalLatest=latest.sales;
  const topBrands=(brands as any[]).map((b:any)=>{
   const x=brandAgg.get(n(b.id))||{sales:0,units:0,category:b.category,priorSales:0};
   return {
    ...b,
    sales:x.sales,
    units:x.units,
    share:totalLatest?x.sales/totalLatest*100:0,
    growth:growth(x.sales,x.priorSales),
    distribution:x.distN?x.dist/x.distN:null
   };
  }).sort((a:any,b:any)=>b.sales-a.sales);

  const categories=[...categoryAgg.entries()]
   .map(([name,x]:[string,any])=>({name,sales:x.sales,growth:growth(x.sales,x.priorSales),distribution:x.n?x.dist/x.n:null}))
   .sort((a:any,b:any)=>b.sales-a.sales);

  const retailerById=new Map((retailers as any[]).map((r:any)=>[n(r.id),r]));
  const retailerOut=[...retailerAgg.entries()]
   .map(([id,x]:[number,any])=>({...retailerById.get(id),id,sales:x.sales,growth:growth(x.sales,x.priorSales)}))
   .filter((x:any)=>x.name)
   .sort((a:any,b:any)=>b.sales-a.sales);

  const alerts:any[]=[];
  for(const b of (topBrands as any[]).filter((x:any)=>Number(x.sales)>0&&Number(x.growth)<-0.05).sort((a:any,b:any)=>Number(a.growth)-Number(b.growth)).slice(0,3)){
   alerts.push({type:"BRAND MOMENTUM",tone:"negative",title:String(b.name)+" sales declined "+Math.abs(Number(b.growth)*100).toFixed(1)+"%",text:"Latest 13W sales are below the prior 13W period. Review distribution, retailer mix, price and product drivers.",period:latestWeek});
  }
  for(const c of (categories as any[]).filter((x:any)=>Number(x.sales)>0&&Number(x.growth)<-0.05).sort((a:any,b:any)=>Number(a.growth)-Number(b.growth)).slice(0,2)){
   alerts.push({type:"CATEGORY MOMENTUM",tone:"negative",title:String(c.name)+" category is down "+Math.abs(Number(c.growth)*100).toFixed(1)+"%",text:"Observed category sales declined versus the prior 13 weeks. Separate category movement from brand-specific movement.",period:latestWeek});
  }
  if(!alerts.length)alerts.push({type:"DATA MONITOR",tone:"positive",title:"No threshold-based performance alerts",text:"The latest 13W source data does not currently trigger the configured momentum thresholds.",period:latestWeek});
  return NextResponse.json({
   source:"cpgist_compact",
   compactDataset:true,
   datasetName:"CPGist Free Dataset",
   latestCompletedWeek:latestWeek,
   periodStart:latestPeriods[0],
   periodEnd:latestPeriods.at(-1),
   periods,
   latestWindow:latestPeriods,
   priorWindow:priorPeriods,
   totalSales:latest.sales,
   totalUnits:latest.units,
   avgDistribution:latest.avgDistribution,
   promoRate:null,
   growth:growth(latest.sales,prior.sales),
   provenance,
   alerts,
   weekly,
   topBrands,
   categories,
   retailers:retailerOut
  });
 }catch(e:any){
  return NextResponse.json({error:e?.message||"Dashboard data failed."},{status:500});
 }
}
