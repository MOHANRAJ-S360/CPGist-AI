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
async function getAll(path:string,pageSize=1000,maxRows=10000){
 const clean=path.replace(/([&?])limit=\\d+/,"$1").replace(/&&/g,"&").replace(/[?&]$/,"");
 const out:any[]=[];
 for(let offset=0;offset<maxRows;offset+=pageSize){
   const sep=clean.includes("?")?"&":"?";
   const page=await get(clean+sep+"limit="+pageSize+"&offset="+offset);
   if(!Array.isArray(page)||!page.length)break;
   out.push(...page);
   if(page.length<pageSize)break;
 }
 return out.slice(0,maxRows);
}
const enc=(v:any)=>encodeURIComponent(String(v??""));
const actualFlag=(v:any)=>v===true||String(v).toLowerCase()==="true";

export async function GET(req:NextRequest){
 try{
  const p=req.nextUrl.searchParams,brandId=p.get("brand_id")||"",category=p.get("category")||"",retailerId=p.get("retailer_id")||"",sku=p.get("sku")||"",startDate=p.get("start_date")||"",endDate=p.get("end_date")||"";
  if(!brandId)return NextResponse.json({error:"brand_id is required."},{status:400});

  const brandRows:any[]=await get("cpgist_brand_weekly?brand_id=eq."+enc(brandId)+"&select=brand_id,category,week_ending,sales,units,avg_price,promo_rate,baseline_sales,incremental_sales,incremental_units,gross_margin,margin_percent,trade_spend,promo_events,is_actual&order=week_ending.asc&limit=100000");
  const brand= (await get("cpgist_brands?select=id,name,category&id=eq."+enc(brandId)+"&limit=1"))[0]||{};
  const categoryName=category||brand.category||"";
  const productMaster:any[]=await get("cpgist_products?brand_id=eq."+enc(brandId)+"&select=id,brand_id,name,sku,category,subcategory,size,launch_date&order=name&limit=5000");
  const productWeekly:any[]=await getAll("cpgist_product_weekly?brand_id=eq."+enc(brandId)+"&select=product_id,brand_id,retailer_id,week_ending,sales,units,price,distribution,promo_rate,is_actual,unit_cost,gross_margin,margin_percent,regular_price,actual_price&order=week_ending.asc",1000,10000);
  const retailerSummary:any[]=await getAll("cpgist_brand_retailer_weekly?brand_id=eq."+enc(brandId)+"&select=brand_id,retailer_id,category,week_ending,sales,units,distribution,price,promo_rate,is_actual,unit_cost,gross_margin,margin_percent&order=week_ending.asc",1000,10000);
  const retailerMaster:any[]=await get("cpgist_retailers?select=id,name,channel,region,retailer_group,total_stores&limit=5000");
  const retailersById=new Map(retailerMaster.map(r=>[String(r.id),r]));

  const events:any[]=await getAll("cpgist_promotion_events?brand_id=eq."+enc(brandId)+"&select=*&order=date_start.asc",1000,10000);
  const baseline:any[]=await getAll("cpgist_baseline_sales?brand_id=eq."+enc(brandId)+"&select=*&order=week.asc",1000,10000);
  const trade:any[]=await getAll("cpgist_trade_spend?brand_id=eq."+enc(brandId)+"&select=*&order=week.asc",1000,10000);
  const trial:any[]=await getAll("cpgist_trial_repeat?select=*",1000,10000);
  const panel:any[]=await getAll("cpgist_panel_household?select=*",1000,10000);
  const macro:any[]=await getAll("cpgist_macro_signals?select=*",1000,10000);
  const categoryRows:any[]=categoryName?await getAll("cpgist_category_aggregates?category=eq."+enc(categoryName)+"&select=*&order=week.asc",1000,10000):[];
  const categoryWeekly:any[]=categoryName?await getAll("cpgist_category_weekly?category=eq."+enc(categoryName)+"&select=category,week_ending,sales,units,distribution,is_actual&order=week_ending.asc",1000,10000):[];
  const competitorPrice:any[]=await getAll("cpgist_competitor_price_sales?brand="+enc(brand.name||"")+"&select=*&order=week.asc",1000,10000).catch(()=>[]);

  const provenance=actualSyntheticProvenance(brandRows,startDate||null,endDate||null);
  const brandPeriods=[...new Set(brandRows.map(r=>String(r.week_ending)).filter(Boolean))].sort();
  const brandLatest=brandPeriods.slice(-13),brandPrior=brandPeriods.slice(-26,-13);
  const latestStatusRows=brandRows.filter(r=>brandLatest.includes(String(r.week_ending)));
  const selectedStatus=latestStatusRows.length>0 && latestStatusRows.some(r=>!actualFlag(r.is_actual))?false:true;
  const sumBrand=(periods:string[])=>brandRows.filter(r=>periods.includes(String(r.week_ending))).reduce((s,r)=>s+Number(r.sales||0),0);
  const brandSummary={latestSales:sumBrand(brandLatest),priorSales:sumBrand(brandPrior),growthPct:sumBrand(brandPrior)?(sumBrand(brandLatest)/sumBrand(brandPrior)-1)*100:null,latestPeriodCount:brandLatest.length,priorPeriodCount:brandPrior.length,status:selectedStatus?"actual":"projected"};
  const promoLift=getPromoLift(events,productWeekly,baseline,trade);
  const skuGrowth=getSkuGrowth(productWeekly);

  const normalizedCategoryAgg=categoryRows.map(r=>({week_ending:r.week,category:r.category,subcategory:r.subcategory,region:r.region,total_category_sales:r.total_category_sales,total_category_units:r.total_category_units,brand_count_in_category:r.brand_count_in_category,is_actual:r.is_actual}));
  const weeklyCategoryRows=categoryWeekly.map(r=>({week_ending:r.week_ending,category:r.category,subcategory:"ALL",region:"ALL",total_category_sales:r.sales,total_category_units:r.units,brand_count_in_category:null,is_actual:r.is_actual}));
  const categoryCandidates=[normalizedCategoryAgg,weeklyCategoryRows];
  const categoryContextRows=categoryCandidates.find(rows=>rows.filter(r=>actualFlag(r.is_actual)===selectedStatus).length>0)||weeklyCategoryRows;
  const categoryContext=getCategoryContext(categoryContextRows,brandRows,brandId);

  const channelBreakdown=getChannelBreakdown(retailerSummary,retailerMaster,brandLatest,selectedStatus);
  const marginRows=productWeekly.filter(r=>brandLatest.includes(String(r.week_ending))&&actualFlag(r.is_actual)===selectedStatus);
  const margin=getMarginPnl(marginRows.length?marginRows:productWeekly.filter(r=>brandLatest.includes(String(r.week_ending))),productMaster,retailerMaster);
  const launch=getLaunchPerformance(productMaster,trial,productWeekly);
  const panelInsight=getSyntheticPanel(panel);
  const macroOverlay=getMacroOverlay(macro);

  const warnings:string[]=[];
  if(provenance.label)warnings.push(provenance.label+"; projected weeks are derived from is_actual and are not observed.");
  if(!promoLift.available)warnings.push("Promotion economics are unavailable until promotion events have aligned same-status sales and baseline evidence.");
  if(!skuGrowth.products.length)warnings.push("SKU growth is unavailable until product-weekly sales are populated.");
  if(!categoryContext.available)warnings.push("Category context is unavailable because no category source contains a complete 13W + prior-13W window aligned to the selected brand status.");
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
