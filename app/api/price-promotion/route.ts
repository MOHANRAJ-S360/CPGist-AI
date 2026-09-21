import { NextResponse } from "next/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";

async function get(path:string,token:string){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) throw new Error("Supabase environment is not configured.");
  if(!token) throw new Error("Your session has expired. Please sign in again.");
  const r=await fetch(url+"/rest/v1/"+path,{headers:{apikey:key,Authorization:"Bearer "+token},cache:"no-store"});
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

const n=(v:any)=>{const x=Number(v);return Number.isFinite(x)?x:0;};
const pct=(now:number,old:number)=>old?(now/old-1)*100:null;
const aggregate=(rows:any[])=>{
  const sales=rows.reduce((s,r)=>s+n(r.sales),0);
  const units=rows.reduce((s,r)=>s+n(r.units),0);
  const price=units?sales/units:null;
  const promoRows=rows.filter(r=>r.promo_rate!=null);
  const promo=promoRows.length?promoRows.reduce((s,r)=>s+n(r.promo_rate),0)/promoRows.length:null;
  return {sales,units,realizedPrice:price,promoRate:promo};
};

export async function GET(req:Request){
  try{
    const auth=req.headers.get("authorization")||"";
    const token=auth.startsWith("Bearer ")?auth.slice(7):"";
    const url=new URL(req.url);
    const brandId=String(url.searchParams.get("brand_id")||"").trim();
    if(!brandId) return NextResponse.json({error:"Select a brand before opening Price & Promotion Analytics."},{status:400});

    const brandRows=await get(
      "cpgist_brand_weekly?select=brand_id,category,week_ending,sales,units,avg_price,promo_rate&brand_id=eq."+encodeURIComponent(brandId)+"&order=week_ending.asc&limit=5000",
      token
    );
    if(!brandRows.length) return NextResponse.json({error:"No weekly brand data is available for the selected brand."},{status:404});

    const brand=await get("cpgist_brands?select=id,name,category,parent_company&id=eq."+encodeURIComponent(brandId)+"&limit=1",token);
    const periods=[...new Set(brandRows.map((r:any)=>String(r.week_ending)).filter(Boolean))].sort();
    const recentPeriods=periods.slice(-13);
    const priorPeriods=periods.slice(-26,-13);
    const recentSet=new Set(recentPeriods), priorSet=new Set(priorPeriods);
    const recentRows=brandRows.filter((r:any)=>recentSet.has(String(r.week_ending)));
    const priorRows=brandRows.filter((r:any)=>priorSet.has(String(r.week_ending)));
    const latest=aggregate(recentRows), prior=aggregate(priorRows);

    const weekly=periods.map(period=>{
      const rows=brandRows.filter((r:any)=>String(r.week_ending)===period);
      const x=aggregate(rows);
      return {period,sales:x.sales,units:x.units,realizedPrice:x.realizedPrice,promoRate:x.promoRate};
    });

    const promoValues=weekly.map(x=>x.promoRate).filter((x):x is number=>x!=null&&Number.isFinite(x));
    const sortedPromo=[...promoValues].sort((a,b)=>a-b);
    const thresholdPromoRate=sortedPromo.length?sortedPromo[Math.floor((sortedPromo.length-1)/2)]:null;
    const highPromo=thresholdPromoRate==null?[]:weekly.filter(x=>x.promoRate!=null&&x.promoRate>thresholdPromoRate);
    const lowPromo=thresholdPromoRate==null?[]:weekly.filter(x=>x.promoRate!=null&&x.promoRate<=thresholdPromoRate);
    const avg=(xs:any[],key:string)=>xs.length?xs.reduce((s,x)=>s+n(x[key]),0)/xs.length:null;

    const productRows=await get(
      "cpgist_product_summary?select=product_id,brand_id,period_end,sales_13w,units_13w,avg_price_13w,distribution_13w,promo_rate_13w&brand_id=eq."+encodeURIComponent(brandId)+"&order=sales_13w.desc&limit=100",
      token
    );
    const productIds=productRows.map((x:any)=>x.product_id).join(",");
    const products=productIds?await get("cpgist_products?select=id,name,sku,subcategory,size&id=in.("+encodeURIComponent(productIds)+")",token):[];
    const productMap=Object.fromEntries(products.map((x:any)=>[String(x.id),x]));
    const productTotal=productRows.reduce((s:number,x:any)=>s+n(x.sales_13w),0);

    const retailerRows=await get(
      "cpgist_brand_retailer_summary?select=retailer_id,period_end,sales_13w,units_13w,avg_price_13w,distribution_13w,promo_rate_13w&brand_id=eq."+encodeURIComponent(brandId)+"&order=sales_13w.desc&limit=100",
      token
    );
    const retailerIds=retailerRows.map((x:any)=>x.retailer_id).join(",");
    const retailers=retailerIds?await get("cpgist_retailers?select=id,name,channel,region,total_stores&id=in.("+encodeURIComponent(retailerIds)+")",token):[];
    const retailerMap=Object.fromEntries(retailers.map((x:any)=>[String(x.id),x]));
    const retailerTotal=retailerRows.reduce((s:number,x:any)=>s+n(x.sales_13w),0);

    const warnings=[
      recentPeriods.length!==13||priorPeriods.length!==13?"13-week comparison is incomplete for the selected brand.":"",
      "Promotion rate is an observed activity measure. The current dataset does not provide discount depth, baseline sales, incremental lift, trade spend or promotion ROI.",
      "High-promotion versus low-promotion weeks are descriptive comparisons, not causal promotion-effectiveness estimates.",
      "Realized price is calculated as sales divided by units; it is not list price or measured discount depth."
    ].filter(Boolean);

    return NextResponse.json({
      brand:brand[0]||{id:brandId,name:"Selected brand"},
      coverage:{latestStart:recentPeriods[0]||null,latestEnd:recentPeriods.at(-1)||null,priorStart:priorPeriods[0]||null,priorEnd:priorPeriods.at(-1)||null,recent13Count:recentPeriods.length,prior13Count:priorPeriods.length},
      latest13:latest,prior13:prior,
      changes:{
        salesGrowthPct:pct(latest.sales,prior.sales),
        unitGrowthPct:pct(latest.units,prior.units),
        priceGrowthPct:latest.realizedPrice!=null&&prior.realizedPrice!=null?pct(latest.realizedPrice,prior.realizedPrice):null,
        promoRateChangePts:latest.promoRate!=null&&prior.promoRate!=null?latest.promoRate-prior.promoRate:null
      },
      promotionIntensity:{
        thresholdPromoRate,
        highPromoWeeks:highPromo.length,lowPromoWeeks:lowPromo.length,
        highPromoAvgSales:avg(highPromo,"sales"),lowPromoAvgSales:avg(lowPromo,"sales"),
        highPromoAvgUnits:avg(highPromo,"units"),lowPromoAvgUnits:avg(lowPromo,"units"),
        highPromoAvgPrice:avg(highPromo,"realizedPrice"),lowPromoAvgPrice:avg(lowPromo,"realizedPrice")
      },
      weekly:weekly.slice(-26),
      products:productRows.slice(0,20).map((x:any)=>({...x,...(productMap[String(x.product_id)]||{}),salesShare:productTotal?n(x.sales_13w)/productTotal:0})),
      retailers:retailerRows.slice(0,20).map((x:any)=>({...x,...(retailerMap[String(x.retailer_id)]||{}),salesShare:retailerTotal?n(x.sales_13w)/retailerTotal:0})),
      warnings,
      evidence:{source:"cpgist_brand_weekly + cpgist_product_summary + cpgist_brand_retailer_summary",grain:"weekly brand + 13-week product/retailer summaries",rowCount:brandRows.length,periodCount:periods.length,filters:{brandId},generatedAt:new Date().toISOString()}
    });
  }catch(e:any){
    return NextResponse.json({error:e?.message||"Price & Promotion Analytics failed."},{status:500});
  }
}
