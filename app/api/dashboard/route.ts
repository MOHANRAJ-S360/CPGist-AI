import {NextResponse} from "next/server";

const base=()=>({u:process.env.NEXT_PUBLIC_SUPABASE_URL,k:process.env.SUPABASE_SERVICE_ROLE_KEY});
async function get(path:string){
  const {u,k}=base();
  if(!u||!k)throw new Error("Supabase server environment is not configured.");
  const res=await fetch(u+"/rest/v1/"+path,{headers:{apikey:k,Authorization:"Bearer "+k},cache:"no-store"});
  if(!res.ok)throw new Error(await res.text());
  return res.json();
}
const num=(v:any)=>Number(v||0);

export async function GET(){
  try{
    let rows:any[]=[];let brands:any[]=[];let retailerRows:any[]=[];
    try{
      [rows,brands,retailerRows]=await Promise.all([
        get("syndicate_sales_weekly?select=brand_id,category,week_ending,dollar_sales,units,acv_distribution,promo_observations,observations&order=week_ending.asc&limit=20000"),
        get("syndicate_brands?select=id,name,category,parent_company&order=name&limit=300"),
        get("syndicate_retailer_weekly?select=retailer_id,week_ending,dollar_sales,units&order=week_ending.asc&limit=30000")
      ]);
    }catch{
      rows=await get("sales_facts?select=period,sales_value,units,distribution,promo_flag,brand_id&order=period.asc&limit=10000");
      brands=await get("brands?select=id,name&limit=300");
    }

    const byWeek=new Map<string,{sales:number,units:number,dist:number,promo:number,obs:number}>();
    for(const r of rows){
      const period=String(r.week_ending||r.period);
      const x=byWeek.get(period)||{sales:0,units:0,dist:0,promo:0,obs:0};
      x.sales+=num(r.dollar_sales??r.sales_value);
      x.units+=num(r.units);
      x.dist+=num(r.acv_distribution??r.distribution);
      x.promo+=num(r.promo_observations??(r.promo_flag?1:0));
      x.obs+=num(r.observations)||1;
      byWeek.set(period,x);
    }
    const periods=[...byWeek.keys()].sort();
    const weekly=periods.map(p=>({period:p,label:new Date(p).toLocaleDateString("en-US",{month:"short",day:"numeric"}),sales:byWeek.get(p)!.sales,units:byWeek.get(p)!.units}));
    const latestPeriod=periods.at(-1),priorPeriod=periods.at(-2);
    const latest=latestPeriod?byWeek.get(latestPeriod):undefined;
    const prior=priorPeriod?byWeek.get(priorPeriod):undefined;
    const growth=latest&&prior&&prior.sales?((latest.sales-prior.sales)/prior.sales):null;

    const brandTotals=new Map<any,number>(),brandLatest=new Map<any,number>(),brandPrior=new Map<any,number>();
    for(const r of rows){
      if(r.brand_id==null)continue;
      const id=r.brand_id,s=num(r.dollar_sales??r.sales_value);
      brandTotals.set(id,(brandTotals.get(id)||0)+s);
      const p=String(r.week_ending||r.period);
      if(p===latestPeriod)brandLatest.set(id,(brandLatest.get(id)||0)+s);
      if(p===priorPeriod)brandPrior.set(id,(brandPrior.get(id)||0)+s);
    }
    const total=rows.reduce((a,r)=>a+num(r.dollar_sales??r.sales_value),0);
    const topBrands=[...brandTotals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([id,sales])=>{
      const l=brandLatest.get(id)||0,p=brandPrior.get(id)||0;
      return {id,name:brands.find(b=>String(b.id)===String(id))?.name||"Brand "+id,sales,share:total?sales/total*100:0,growth:p?((l-p)/p*100):0};
    });
    const brandTrendId=topBrands[0]?.id;
    const brandTrend=periods.slice(-26).map(p=>{
      let sales=0;
      for(const r of rows)if(String(r.week_ending||r.period)===p&&String(r.brand_id)===String(brandTrendId))sales+=num(r.dollar_sales??r.sales_value);
      return {period:p,label:new Date(p).toLocaleDateString("en-US",{month:"short",day:"numeric"}),sales};
    });

    const categoriesMap=new Map<string,{sales:number,latest:number,prior:number}>();
    for(const r of rows){
      const c=String(r.category||"Unclassified"),s=num(r.dollar_sales??r.sales_value),p=String(r.week_ending||r.period);
      const x=categoriesMap.get(c)||{sales:0,latest:0,prior:0};x.sales+=s;
      if(p===latestPeriod)x.latest+=s;if(p===priorPeriod)x.prior+=s;categoriesMap.set(c,x);
    }
    const categories=[...categoriesMap.entries()].map(([name,x])=>({name,sales:x.sales,growth:x.prior?((x.latest-x.prior)/x.prior*100):0})).sort((a,b)=>b.sales-a.sales);

    const retailerTotals=new Map<any,{sales:number,latest:number,prior:number}>();
    for(const r of retailerRows){
      const id=r.retailer_id,s=num(r.dollar_sales),p=String(r.week_ending);
      const x=retailerTotals.get(id)||{sales:0,latest:0,prior:0};x.sales+=s;if(p===latestPeriod)x.latest+=s;if(p===priorPeriod)x.prior+=s;retailerTotals.set(id,x);
    }
    let retailers:any[]=[];
    if(retailerTotals.size){
      const retailerDims=await get("syndicate_retailers?select=id,name,channel,region,total_stores&order=name&limit=300");
      retailers=[...retailerTotals.entries()].map(([id,x])=>{const d=retailerDims.find((z:any)=>String(z.id)===String(id));return {id,name:d?.name||"Retailer "+id,sales:x.sales,growth:x.prior?((x.latest-x.prior)/x.prior*100):0,channel:d?.channel,region:d?.region,stores:d?.total_stores}}).sort((a,b)=>b.sales-a.sales);
    }

    const vals=weekly.map(x=>x.sales),avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
    const alerts=weekly.slice(-8).filter(x=>avg&&Math.abs(x.sales-avg)/avg>.15).map(x=>({type:"WEEKLY EXCEPTION",title:x.sales>avg?"Sales above baseline":"Sales below baseline",text:`Observed sales were ${((x.sales/avg-1)*100).toFixed(1)}% ${x.sales>avg?"above":"below"} the period average.`,period:x.period,tone:x.sales>avg?"positive":"negative"}));

    return NextResponse.json({
      source:rows.length?"syndicate":"sales_facts",rowCount:rows.length,totalSales:total,totalUnits:rows.reduce((a,r)=>a+num(r.units),0),
      avgDistribution:rows.length?rows.reduce((a,r)=>a+num(r.acv_distribution??r.distribution),0)/rows.length:null,
      promoRate:rows.length?rows.reduce((a,r)=>a+num(r.promo_observations??(r.promo_flag?1:0)),0)/Math.max(1,rows.reduce((a,r)=>a+num(r.observations)||1,0))*100:null,
      growth,periods,weekly,maxWeekly:Math.max(...vals,1),topBrands,brandTrend,categories,retailers,alerts
    });
  }catch(e:any){return NextResponse.json({error:e?.message||"Dashboard data request failed."},{status:500})}
}
