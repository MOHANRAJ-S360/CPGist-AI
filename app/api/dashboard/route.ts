import {NextResponse} from "next/server";
const base=()=>({u:process.env.NEXT_PUBLIC_SUPABASE_URL,k:process.env.SUPABASE_SERVICE_ROLE_KEY});
async function get(path:string){const {u,k}=base();if(!u||!k)throw new Error("Supabase server environment is not configured.");const r=await fetch(u+"/rest/v1/"+path,{headers:{apikey:k,Authorization:"Bearer "+k},cache:"no-store"});if(!r.ok)throw new Error(await r.text());return r.json();}
export async function GET(){try{
 let rows:any[]=[];let brands:any[]=[];let source="sales_facts";
 try{rows=await get("syndicate_sales_weekly?select=brand_id,category,week_ending,dollar_sales,units,acv_distribution&order=week_ending.asc&limit=20000");brands=await get("syndicate_brands?select=id,name&order=name&limit=200");if(rows.length)source="syndicate";}
 catch{rows=await get("sales_facts?select=period,sales_value,units,distribution,promo_flag,brand_id&order=period.asc&limit=10000");brands=await get("brands?select=id,name&limit=200");}
 const byWeek=new Map<string,{sales:number,units:number,dist:number,n:number}>();for(const r of rows){const period=String(r.week_ending||r.period);const x=byWeek.get(period)||{sales:0,units:0,dist:0,n:0};x.sales+=Number(r.dollar_sales??r.sales_value??0);x.units+=Number(r.units||0);x.dist+=Number(r.acv_distribution??r.distribution??0);x.n++;byWeek.set(period,x)}
 const periods=[...byWeek.keys()].sort();const weekly=periods.map(p=>({period:p,label:new Date(p).toLocaleDateString("en-US",{month:"short",day:"numeric"}),sales:byWeek.get(p)!.sales,units:byWeek.get(p)!.units}));const latest=weekly.at(-1),prior=weekly.at(-2);
 const byBrand=new Map<any,number>();for(const r of rows)if(r.brand_id!=null)byBrand.set(r.brand_id,(byBrand.get(r.brand_id)||0)+Number(r.dollar_sales??r.sales_value??0));const total=rows.reduce((a,r)=>a+Number(r.dollar_sales??r.sales_value??0),0);
 const topBrands=[...byBrand.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([id,sales])=>({id,name:brands.find(b=>String(b.id)===String(id))?.name||"Brand "+id,sales,share:total?sales/total*100:0}));
 return NextResponse.json({source,rowCount:rows.length,totalSales:total,totalUnits:rows.reduce((a,r)=>a+Number(r.units||0),0),avgDistribution:rows.length?rows.reduce((a,r)=>a+Number(r.acv_distribution??r.distribution??0),0)/rows.length:null,promoRate:null,growth:latest&&prior&&prior.sales?((latest.sales-prior.sales)/prior.sales):null,periods,weekly,maxWeekly:Math.max(...weekly.map(x=>x.sales),1),topBrands});
}catch(e:any){return NextResponse.json({error:e.message},{status:500})}}
