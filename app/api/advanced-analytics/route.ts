import {NextRequest,NextResponse} from "next/server";
import {getPromoLift,getSkuGrowth,getCategoryContext,getChannelBreakdown,getMarginPnl,getLaunchPerformance,getSyntheticPanel,getMacroOverlay,actualSyntheticProvenance} from "../../../lib/cpg-advanced";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const base=()=>({u:process.env.NEXT_PUBLIC_SUPABASE_URL,k:process.env.SUPABASE_SERVICE_ROLE_KEY});
async function get(path:string){
 const {u,k}=base(); if(!u||!k) throw new Error("Supabase server environment is not configured.");
 const r=await fetch(u+"/rest/v1/"+path,{headers:{apikey:k,Authorization:"Bearer "+k},cache:"no-store"});
 if(!r.ok) throw new Error(await r.text()); return r.json();
}
const enc=(v:any)=>encodeURIComponent(String(v??""));

export async function GET(req:NextRequest){
 try{
  const p=req.nextUrl.searchParams,brandId=p.get("brand_id")||"",category=p.get("category")||"",retailerId=p.get("retailer_id")||"",sku=p.get("sku")||"",startDate=p.get("start_date")||"",endDate=p.get("end_date")||"";
  if(!brandId)return NextResponse.json({error:"brand_id is required."},{status:400});

  const brandRows:any[]=await get("cpgist_brand_weekly?brand_id=eq."+enc(brandId)+"&select=brand_id,category,week_ending,sales,units,avg_price,promo_rate,baseline_sales,incremental_sales,incremental_units,gross_margin,margin_percent,trade_spend,promo_events,is_actual&order=week_ending.asc&limit=100000");
  const brand= (await get("cpgist_brands?select=id,name,category&id=eq."+enc(brandId)+"&limit=1"))[0]||{};
  const categoryName=category||brand.category||"";
  const productMaster:any[]=await get("cpgist_products?brand_id=eq."+enc(brandId)+"&select=id,brand_id,name,sku,category,subcategory,size,launch_date&order=name&limit=5000");
  const productWeekly:any[]=await get("cpgist_product_weekly?brand_id=eq."+enc(brandId)+"&select=product_id,brand_id,retailer_id,week_ending,sales,units,price,distribution,promo_rate,is_actual,unit_cost,gross_margin,margin_percent,regular_price,actual_price&order=week_ending.asc&limit=100000");
  const retailerSummary:any[]=await get("cpgist_brand_retailer_weekly?brand_id=eq."+enc(brandId)+"&select=brand_id,retailer_id,category,week_ending,sales,units,distribution,price,promo_rate,is_actual,unit_cost,gross_margin,margin_percent&order=week_ending.asc&limit=100000");
  const retailerMaster:any[]=await get("cpgist_retailers?select=id,name,channel,region,retailer_group,total_stores&limit=5000");
  const retailersById=new Map(retailerMaster.map(r=>[String(r.id),r]));

  const events:any[]=await get("cpgist_promotion_events?brand_id=eq."+enc(brandId)+"&select=*&order=date_start.asc&limit=5000");
  const baseline:any[]=await get("cpgist_baseline_sales?brand_id=eq."+enc(brandId)+"&select=*&order=week.asc&limit=100000");
  const trade:any[]=await get("cpgist_trade_spend?brand_id=eq."+enc(brandId)+"&select=*&order=week.asc&limit=100000");
  const trial:any[]=await get("cpgist_trial_repeat?select=*&limit=100000");
  const panel:any[]=await get("cpgist_panel_household?select=*&limit=100000");
  const macro:any[]=await get("cpgist_macro_signals?select=*&limit=100000");
  const categoryRows:any[]=categoryName?await get("cpgist_category_aggregates?category=eq."+enc(categoryName)+"&select=*&order=week.asc&limit=100000"):[];
  const categoryWeekly:any[]=categoryName?await get("cpgist_category_weekly?category=eq."+enc(categoryName)+"&select=category,week_ending,sales,units,distribution,is_actual&order=week_ending.asc&limit=5000"):[];
  const competitorPrice:any[]=await get("cpgist_competitor_price_sales?brand="+enc(brand.name||"")+"&select=*&order=week.asc&limit=100000").catch(()=>[]);

  const provenance=actualSyntheticProvenance(brandRows,startDate||null,endDate||null);
  const brandPeriods=[...new Set(brandRows.map(r=>String(r.week_ending)).filter(Boolean))].sort();
  const brandLatest=brandPeriods.slice(-13),brandPrior=brandPeriods.slice(-26,-13);
  const sumBrand=(periods:string[])=>brandRows.filter(r=>periods.includes(String(r.week_ending))).reduce((s,r)=>s+Number(r.sales||0),0);
  const brandSummary={latestSales:sumBrand(brandLatest),priorSales:sumBrand(brandPrior),growthPct:sumBrand(brandPrior)?(sumBrand(brandLatest)/sumBrand(brandPrior)-1)*100:null,latestPeriodCount:brandLatest.length,priorPeriodCount:brandPrior.length};
  const promoLift=getPromoLift(events,productWeekly,baseline,trade);
  const skuGrowth=getSkuGrowth(productWeekly);
  const categoryContextRows=categoryRows.length?categoryRows:categoryWeekly.map(r=>({week:r.week_ending,category:r.category,subcategory:"ALL",region:"ALL",total_category_sales:r.sales,total_category_units:r.units,brand_count_in_category:null,is_actual:r.is_actual}));
  const categoryContext=getCategoryContext(categoryContextRows,brandRows,brandId);
  const channelBreakdown=getChannelBreakdown(retailerSummary,retailerMaster);
  const margin=getMarginPnl(productWeekly.length?productWeekly:brandRows,productMaster,retailerMaster);
  const launch=getLaunchPerformance(productMaster,trial,productWeekly);
  const panelInsight=getSyntheticPanel(panel);
  const macroOverlay=getMacroOverlay(macro);

  const warnings:string[]=[];
  if(provenance.label)warnings.push(provenance.label+"; projected weeks are derived from is_actual and are not observed.");
  if(!promoLift.available)warnings.push("Promotion economics are unavailable until promotion events, baseline sales, trade spend and SKU-level sales are populated.");
  if(!skuGrowth.products.length)warnings.push("SKU growth is unavailable until product-weekly sales are populated.");
  if(!categoryContext.available)warnings.push("Observed category context is unavailable because neither category_aggregates nor category_weekly contains a complete 13W + prior-13W window.");
  if(!channelBreakdown.length)warnings.push("Channel breakdown is unavailable until retailer-level brand sales are populated.");
  if(!margin.available)warnings.push("SKU/retailer margin detail is unavailable until margin-bearing weekly rows are populated.");
  if(!launch.available)warnings.push("Launch tracking is unavailable until products have launch_date and matching trial_repeat records.");
  if(panelInsight.available)warnings.push(panelInsight.label);
  if(macroOverlay.available)warnings.push(macroOverlay.label);

  return NextResponse.json({
    brand:{id:brand.id,name:brand.name,category:categoryName},
    brandSummary,
    provenance,
    promoLift,
    skuGrowth,
    categoryContext,
    channelBreakdown,
    margin,
    launchPerformance:launch,
    syntheticPanel:panelInsight,
    macroOverlay,
    competitorPrice,
    filters:{brandId,category:categoryName,retailerId:retailerId||null,sku:sku||null,startDate:startDate||null,endDate:endDate||null},
    evidence:{sources:["cpgist_brand_weekly","cpgist_product_weekly","cpgist_promotion_events","cpgist_baseline_sales","cpgist_trade_spend","cpgist_category_aggregates","cpgist_trial_repeat","cpgist_panel_household","cpgist_macro_signals","cpgist_retailers"],generatedAt:new Date().toISOString()},
    warnings
  });
 }catch(e:any){return NextResponse.json({error:e?.message||"Advanced analytics failed."},{status:500})}
}
