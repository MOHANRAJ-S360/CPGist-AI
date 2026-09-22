import { NextResponse } from "next/server";
import { CPG_TOOLS } from "../../../lib/cpg-analytics";
import { capabilityContext } from "../../../lib/cpg-intelligence/capabilities";
import {
  analyzeDrivers,
  compareBrandPeriods,
  categoryGrowthPlan,
  detectAnomalies,
  forecastSales,
  getDistribution,
  getMarketShare,
  getPrice,
  getSales,
  runScenario,
  retailerOpportunity,
  crossCategoryPortfolio,
  businessHealthScan,
  validateAnalyticalResult,
  type IntelligenceQuery,
  type IntelligenceRow,
} from "../../../lib/cpg-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Args = Record<string, string | number | undefined>;

type Dataset = {
  rows: IntelligenceRow[];
  source: string;
};

async function get(path: string, token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment is not configured.");
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(url + "/rest/v1/" + path, {
    headers: { apikey: key, Authorization: "Bearer " + token },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function filtersFromArgs(a: Args): IntelligenceQuery {
  return {
    brandId: a.brandId ? String(a.brandId) : undefined,
    categoryId: a.categoryId ? String(a.categoryId) : undefined,
    retailerId: a.retailerId ? String(a.retailerId) : undefined,
    startDate: a.startDate ? String(a.startDate) : undefined,
    endDate: a.endDate ? String(a.endDate) : undefined,
  };
}

async function queryDataset(a: Args, token: string, mode: "sales" | "retailer" = "sales"): Promise<Dataset> {
  const brand = a.brandId ? String(a.brandId) : "";
  const category = a.categoryId ? String(a.categoryId) : "";
  const retailer = a.retailerId ? String(a.retailerId) : "";

  let compact = false;
  try {
    const probe = await get("cpgist_brands?select=id&limit=1", token);
    compact = Array.isArray(probe) && probe.length > 0;
  } catch {}

  if (!compact) {
    throw new Error("CPGist Free Dataset is not imported yet. Open Data Import and load CPGist_Supabase_Free_Dataset.zip before using AI Analyst.");
  }

  if (mode === "retailer" || (retailer && !brand && !category)) {
    let q = "cpgist_brand_retailer_weekly?select=brand_id,retailer_id,category,week_ending,sales,units,distribution,price,promo_rate&limit=100000";
    q += "&retailer_id=eq." + encodeURIComponent(retailer);
    if (a.startDate) q += "&week_ending=gte." + encodeURIComponent(String(a.startDate));
    if (a.endDate) q += "&week_ending=lte." + encodeURIComponent(String(a.endDate));
    const raw = await get(q, token);
    return { rows: raw.map((r:any) => ({
      brand_id: r.brand_id, category: r.category, retailer_id: r.retailer_id, week_ending: r.week_ending,
      dollar_sales: r.sales, units: r.units, acv_distribution: r.distribution,
      avg_price: r.price, promo_observations: r.promo_rate, observations: 1
    })), source: "cpgist_brand_retailer_weekly" };
  }

  let q = "cpgist_brand_weekly?select=brand_id,category,week_ending,sales,units,distribution,avg_price,promo_rate,regular_price,actual_price,baseline_sales,baseline_units,incremental_sales,incremental_units,gross_margin,margin_percent,trade_spend,promo_events,avg_discount_depth_pct,data_quality_status&limit=100000";
  if (brand) q += "&brand_id=eq." + encodeURIComponent(brand);
  if (category) q += "&category=ilike." + encodeURIComponent(category);
  if (a.startDate) q += "&week_ending=gte." + encodeURIComponent(String(a.startDate));
  if (a.endDate) q += "&week_ending=lte." + encodeURIComponent(String(a.endDate));
  const raw = await get(q, token);
  return { rows: raw.map((r:any) => ({
    brand_id: r.brand_id, category: r.category, week_ending: r.week_ending,
    dollar_sales: r.sales, units: r.units, acv_distribution: r.distribution,
    avg_price: r.avg_price, promo_observations: r.promo_rate, regular_price: r.regular_price, actual_price: r.actual_price, baseline_sales: r.baseline_sales, baseline_units: r.baseline_units, incremental_sales: r.incremental_sales, incremental_units: r.incremental_units, gross_margin: r.gross_margin, margin_percent: r.margin_percent, trade_spend: r.trade_spend, promo_events: r.promo_events, avg_discount_depth_pct: r.avg_discount_depth_pct, data_quality_status: r.data_quality_status, observations: 1
  })), source: "cpgist_brand_weekly" };
}
async function tool(name: string, a: Args, token: string) {
  const filters = filtersFromArgs(a);
  const dataset = await queryDataset(a, token);

  switch (name) {
    case "data_readiness": {
      const tables = ["cpgist_brands","cpgist_products","cpgist_categories","cpgist_regions","cpgist_brand_weekly","cpgist_category_weekly","cpgist_retailer_weekly","cpgist_brand_retailer_weekly","cpgist_brand_retailer_summary","cpgist_product_weekly","cpgist_product_summary","cpgist_competitor_weekly","syndicate_competitor_signals"];
      const counts: Record<string, number> = {};
      for (const table of tables) {
        try {
          const response = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/" + table + "?select=*", { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "", Authorization: "Bearer " + token, Prefer: "count=exact" }, cache: "no-store" });
          if (!response.ok) throw new Error("readiness check failed");
          const range = response.headers.get("content-range");
          counts[table] = range && range.includes("/") ? Number(range.split("/")[1]) || 0 : (await response.json()).length;
        } catch { counts[table] = 0; }
      }
      return { domains: { sales: counts.cpgist_brand_weekly > 0, retailerOpportunity: counts.cpgist_brand_retailer_weekly > 0 || counts.cpgist_brand_retailer_summary > 0, products: counts.cpgist_product_weekly > 0 || counts.cpgist_product_summary > 0, competition: counts.cpgist_competitor_weekly > 0 || counts.syndicate_competitor_signals > 0, geography: false, shopper: false, innovation: false, ecommerce: false }, counts, warnings: counts.cpgist_brand_weekly === 0 ? ["CPGist Free Dataset is not imported yet."] : [] };
    }

    case "business_health_scan": {
      const result = businessHealthScan(dataset.rows, filters);
      return { ...result.data, evidence: { ...result.evidence, source: dataset.source }, warnings: result.warnings };
    }

    case "cross_category_portfolio": {
      const [brands, salesRows] = await Promise.all([
        get("cpgist_brands?select=id,name,category,parent_company&limit=2000", token),
        get("cpgist_brand_weekly?select=brand_id,sales&limit=100000", token)
      ]);
      const result = crossCategoryPortfolio(brands, salesRows);
      const issues = validateAnalyticalResult(result);
      return { ...result.data, evidence: result.evidence, warnings: [...result.warnings, ...issues.map(i => i.message)], validation: issues };
    }

    case "retailer_opportunity": {
      const brandId = String(a.brandId || "").trim();
      const category = String(a.categoryId || "").trim();
      if (!brandId || !category) return { error: "retailer_opportunity requires brandId and categoryId." };
      const encodedCategory = encodeURIComponent(category);
      let retailerRows = await get("cpgist_brand_retailer_weekly?select=brand_id,retailer_id,category,sales,units,distribution,price,promo_rate&category=ilike." + encodedCategory + "&limit=100000", token);
      if (!retailerRows.length) { const summary = await get("cpgist_brand_retailer_summary?select=brand_id,retailer_id,category,sales_13w,units_13w,distribution_13w,avg_price_13w,promo_rate_13w&category=ilike."+encodedCategory+"&limit=100000", token); retailerRows = summary.map((r:any)=>({brand_id:r.brand_id,retailer_id:r.retailer_id,category:r.category,sales:r.sales_13w,units:r.units_13w,distribution:r.distribution_13w,price:r.avg_price_13w,promo_rate:r.promo_rate_13w})); }
      const result = retailerOpportunity(retailerRows, brandId, category);
      const ids = result.data.retailers.map(x => x.retailerId).join(",");
      const retailers = ids ? await get("cpgist_retailers?select=id,name,channel,region,retailer_group,total_stores&id=in.(" + encodeURIComponent(ids) + ")", token) : [];
      const names = Object.fromEntries(retailers.map((r:any) => [String(r.id), r]));
      const issues = validateAnalyticalResult(result);
      return {
        ...result.data,
        retailers: result.data.retailers.map(x => ({
          ...x,
          retailerName: names[x.retailerId]?.name ?? null,
          channel: names[x.retailerId]?.channel ?? null,
          region: names[x.retailerId]?.region ?? null,
          totalStores: names[x.retailerId]?.total_stores ?? null
        })),
        evidence: result.evidence,
        warnings: [...result.warnings, ...issues.map(i => i.message)],
        validation: issues
      };
    }

    case "monthly_business_review": {
      const brandId = String(a.brandId || "").trim();
      if (!brandId) return { error: "monthly_business_review requires a brandId for a brand-scoped review." };

      const brandContext = await resolveBrandContext(brandId, token);
      const categoryName = brandContext.category;
      if (!categoryName) return { error: "The selected brand has no category in the brand master, so category context cannot be validated." };

      const brandDataset = await queryDataset({ ...a, brandId }, token);
      const categoryDataset = await queryDataset({ ...a, brandId: undefined, categoryId: categoryName }, token);

      const brandPeriods = [...new Set(brandDataset.rows.map(r => r.week_ending).filter(Boolean))].sort();
      const latest13 = brandPeriods.slice(-13);
      const prior13 = brandPeriods.slice(-26, -13);
      const recentSet = new Set(latest13);
      const priorSet = new Set(prior13);

      const sum = (rows:any[], key:string) => rows.reduce((s,r)=>s + Number(r[key] || 0), 0);
      const avg = (rows:any[], key:string) => rows.length ? rows.reduce((s,r)=>s + Number(r[key] || 0), 0) / rows.length : null;
      const recentRows = brandDataset.rows.filter(r => recentSet.has(r.week_ending));
      const priorRows = brandDataset.rows.filter(r => priorSet.has(r.week_ending));

      const recentSales = sum(recentRows, "dollar_sales");
      const priorSales = sum(priorRows, "dollar_sales");
      const recentUnits = sum(recentRows, "units");
      const priorUnits = sum(priorRows, "units");
      const recentPrice = recentUnits ? recentSales / recentUnits : null;
      const priorPrice = priorUnits ? priorSales / priorUnits : null;
      const recentDistribution = avg(recentRows, "acv_distribution");
      const priorDistribution = avg(priorRows, "acv_distribution");
      const recentPromo = avg(recentRows, "promo_observations");
      const priorPromo = avg(priorRows, "promo_observations");

      const pct = (now:number, old:number) => old ? (now / old - 1) * 100 : null;
      const salesGrowthPct = pct(recentSales, priorSales);
      const unitGrowthPct = pct(recentUnits, priorUnits);
      const priceGrowthPct = recentPrice !== null && priorPrice ? pct(recentPrice, priorPrice) : null;
      const distributionChangePts = recentDistribution !== null && priorDistribution !== null ? recentDistribution - priorDistribution : null;
      const promoChangePts = recentPromo !== null && priorPromo !== null ? recentPromo - priorPromo : null;

      // Category metrics use the exact same 13-week and prior-13-week windows as the brand.
      // Category totals use the canonical category weekly table so AI Analyst,
      // Reports and Explorer all use the same category denominator.
      const encodedCategoryName = encodeURIComponent(categoryName);
      const categoryWeeklyRaw:any[] = await get("cpgist_category_weekly?category=eq."+encodedCategoryName+"&select=category,week_ending,sales,units,distribution&order=week_ending.asc&limit=5000", token);
      const categoryPeriods = [...new Set(categoryWeeklyRaw.map(r => String(r.week_ending)).filter(Boolean))].sort();
      const categoryLatest13 = new Set(categoryPeriods.slice(-13));
      const categoryPrior13 = new Set(categoryPeriods.slice(-26, -13));
      const categoryRecentRows = categoryWeeklyRaw.filter(r => categoryLatest13.has(String(r.week_ending)));
      const categoryPriorRows = categoryWeeklyRaw.filter(r => categoryPrior13.has(String(r.week_ending)));
      const categorySales = categoryRecentRows.reduce((s:number,r:any)=>s + Number(r.sales || 0),0);
      const categoryPriorSales = categoryPriorRows.reduce((s:number,r:any)=>s + Number(r.sales || 0),0);
      const categoryGrowthPct = pct(categorySales, categoryPriorSales);
      const marketShare = categorySales ? recentSales / categorySales : null;
      const priorMarketShare = categoryPriorSales ? priorSales / categoryPriorSales : null;
      const shareChangePts = marketShare !== null && priorMarketShare !== null ? (marketShare - priorMarketShare) * 100 : null;

      const categoryResult = categoryGrowthPlan(categoryDataset.rows, { categoryId: categoryName });
      const categoryBrands = categoryResult.data.brands.slice(0, 8);

      const recentAnomalies = detectAnomalies(recentRows, { brandId }).data.anomalies;
      const anomalyDetails = recentAnomalies.map(x => ({ period:x.period, sales:x.sales, zScore:x.zScore }));

      const products = await get("cpgist_product_summary?select=product_id,brand_id,period_end,sales_13w,units_13w,avg_price_13w,distribution_13w,promo_rate_13w&brand_id=eq."+encodeURIComponent(brandId)+"&order=sales_13w.desc&limit=10", token);
      const productIds = products.map((x:any)=>x.product_id).join(",");
      const productMaster = productIds ? await get("cpgist_products?select=id,name,sku,category,subcategory,size,pack_count&id=in.("+encodeURIComponent(productIds)+")", token) : [];
      const productNames = Object.fromEntries(productMaster.map((x:any)=>[String(x.id),x]));

      const retailers = await get("cpgist_brand_retailer_summary?select=brand_id,retailer_id,category,period_end,sales_13w,units_13w,avg_price_13w,distribution_13w,promo_rate_13w&brand_id=eq."+encodeURIComponent(brandId)+"&order=sales_13w.desc&limit=20", token);
      const retailerIds = retailers.map((x:any)=>x.retailer_id).join(",");
      const retailerMaster = retailerIds ? await get("cpgist_retailers?select=id,name,channel,region,total_stores&id=in.("+encodeURIComponent(retailerIds)+")", token) : [];
      const retailerNames = Object.fromEntries(retailerMaster.map((x:any)=>[String(x.id),x]));

      const validationIssues:any[] = [];
      if (latest13.length !== 13) validationIssues.push({ severity:"warning", code:"INCOMPLETE_RECENT_13W", message:"Fewer than 13 observed weeks are available for the recent period." });
      if (prior13.length !== 13) validationIssues.push({ severity:"warning", code:"INCOMPLETE_PRIOR_13W", message:"Fewer than 13 observed weeks are available for the prior comparison period." });
      if (categoryLatest13.size !== 13) validationIssues.push({ severity:"warning", code:"INCOMPLETE_CATEGORY_13W", message:"Fewer than 13 category weeks are available for the recent period." });
      if (categoryPrior13.size !== 13) validationIssues.push({ severity:"warning", code:"INCOMPLETE_CATEGORY_PRIOR_13W", message:"Fewer than 13 category weeks are available for the prior comparison period." });
      if (marketShare !== null && (marketShare < 0 || marketShare > 1)) validationIssues.push({ severity:"error", code:"INVALID_SHARE", message:"Calculated brand share is outside the valid 0–100% range." });
      if (recentSales >= 0 && recentUnits > 0 && recentPrice !== null && Math.abs(recentSales - recentUnits * recentPrice) > Math.max(1, recentSales * 1e-8)) validationIssues.push({ severity:"error", code:"PRICE_RECONCILIATION", message:"Recent sales, units and realized price do not reconcile." });

      const evidence = {
        source: "cpgist_brand_weekly + cpgist_category_weekly-equivalent brand/category scope",
        grain: "weekly brand/category sales",
        rowCount: brandDataset.rows.length,
        periodStart: latest13[0] ?? null,
        periodEnd: latest13.at(-1) ?? null,
        periodCount: latest13.length,
        filters: { brandId, categoryId: categoryName },
        generatedAt: new Date().toISOString()
      };

      return {
        brand: { brandId, brandName: brandContext.brandName, category: categoryName },
        executive: {
          latest13wSales: recentSales,
          prior13wSales: priorSales,
          salesGrowthPct,
          latest13wUnits: recentUnits,
          prior13wUnits: priorUnits,
          unitGrowthPct,
          latest13wRealizedPrice: recentPrice,
          prior13wRealizedPrice: priorPrice,
          priceGrowthPct,
          distributionAcv: recentDistribution,
          priorDistributionAcv: priorDistribution,
          distributionChangePts,
          promoRate: recentPromo,
          priorPromoRate: priorPromo,
          promoChangePts,
          category13wSales: categorySales,
          categoryPrior13wSales: categoryPriorSales,
          categoryGrowthPct,
          marketShare,
          priorMarketShare,
          shareChangePts,
          anomalyCountRecent13w: anomalyDetails.length
        },
        categoryContext: {
          categorySales: categorySales,
          categoryPriorSales,
          categoryGrowthPct,
          topBrands: categoryBrands.map((x:any)=>({ brandId:x.brandId, sales:x.recentSales, growthPct:x.growthPct, share:x.share }))
        },
        products: products.map((x:any)=>({...x, productName:productNames[String(x.product_id)]?.name ?? null, sku:productNames[String(x.product_id)]?.sku ?? null, size:productNames[String(x.product_id)]?.size ?? null, packCount:productNames[String(x.product_id)]?.pack_count ?? null})),
        retailers: retailers.map((x:any)=>({...x, retailerName:retailerNames[String(x.retailer_id)]?.name ?? null, channel:retailerNames[String(x.retailer_id)]?.channel ?? null, region:retailerNames[String(x.retailer_id)]?.region ?? null, totalStores:retailerNames[String(x.retailer_id)]?.total_stores ?? null})),
        anomalies: anomalyDetails,
        evidence,
        warnings: [
          ...(latest13.length < 13 || prior13.length < 13 ? ["The 13-week comparison is incomplete."] : []),
          "Discount depth is not available in cpgist_brand_weekly; do not infer discounting from the promotion rate.",
          "Promotion rate is descriptive. Incremental lift, ROI and causal promotional effectiveness are not estimated.",
          "Retailer gaps are candidate distribution gaps, not quantified incremental sales opportunity.",
          "No margin/cost fields are available in the supplied product summary, so margin contribution cannot be inferred.",
          "Anomalies are statistical flags requiring underlying-record review; they do not establish a business cause."
        ],
        validation: validationIssues
      };
    }

    case "product_sku_performance": {
      const brand = a.brandId ? "&brand_id=eq."+encodeURIComponent(String(a.brandId)) : "";
      const rows = await get("cpgist_product_summary?select=product_id,brand_id,period_end,sales_13w,units_13w,avg_price_13w,distribution_13w,promo_rate_13w&order=sales_13w.desc&limit=30"+brand, token);
      if (!rows.length) return { products: [], evidence:{source:"cpgist_product_summary",grain:"product 13-week summary",rowCount:0,periodStart:null,periodEnd:null,periodCount:0,filters:filtersFromArgs(a),generatedAt:new Date().toISOString()}, warnings:["Product-level weekly summary data is not populated for the requested scope."] };
      const ids = rows.map((x:any)=>x.product_id).join(",");
      const products = ids ? await get("cpgist_products?select=id,name,sku,category,subcategory,size,pack_count,brand_id&id=in.("+encodeURIComponent(ids)+")", token) : [];
      const master = Object.fromEntries(products.map((x:any)=>[String(x.id),x]));
      const total = rows.reduce((s:number,x:any)=>s+Number(x.sales_13w||0),0);
      return { products: rows.map((x:any)=>({...x,...(master[String(x.product_id)]||{}),shareOfBrand:total?Number(x.sales_13w||0)/total:0})), totalSales:total,
        evidence:{source:"cpgist_product_summary",grain:"product 13-week summary",rowCount:rows.length,periodStart:rows[0]?.period_end??null,periodEnd:rows[0]?.period_end??null,periodCount:1,filters:filtersFromArgs(a),generatedAt:new Date().toISOString()}, warnings:[] };
    }

    case "competitive_signals": {
      const clauses:string[]=[];
      if(a.brandId) clauses.push("brand_id=eq."+encodeURIComponent(String(a.brandId)));
      if(a.categoryId) clauses.push("category=ilike."+encodeURIComponent(String(a.categoryId)));
      if(a.retailerId) clauses.push("retailer_id=eq."+encodeURIComponent(String(a.retailerId)));
      const q="syndicate_competitor_signals?select=brand_id,category,retailer_id,region,signal_date,signal_type,magnitude_pct,description&order=signal_date.desc&limit=50"+(clauses.length?"&"+clauses.join("&"):"");
      const rows=await get(q,token);
      const ids=[...new Set(rows.map((x:any)=>x.brand_id).filter(Boolean))].join(",");
      const brands=ids?await get("syndicate_brands?select=id,name&id=in.("+encodeURIComponent(ids)+")",token):[];
      const names=Object.fromEntries(brands.map((x:any)=>[String(x.id),x.name]));
      return {signals:rows.map((x:any)=>({...x,brandName:names[String(x.brand_id)]??null})),evidence:{source:"syndicate_competitor_signals",grain:"competitive signal event",rowCount:rows.length,periodStart:rows.at(-1)?.signal_date??null,periodEnd:rows[0]?.signal_date??null,periodCount:new Set(rows.map((x:any)=>x.signal_date).filter(Boolean)).size,filters:filtersFromArgs(a),generatedAt:new Date().toISOString()},warnings:rows.length?[]:["No competitive signals are available for the requested scope."]};
    }

    case "promotion_diagnostic": {
      const rows=await queryDataset(a,token);
      const filters=filtersFromArgs(a);
      const sales=getSales(rows.rows,filters).data;
      const price=getPrice(rows.rows,filters).data;
      const promoRows=rows.rows.filter(x=>x.promo_observations!==undefined || x.avg_discount_depth_pct!==undefined);
      const promoRate=promoRows.length?promoRows.reduce((s,r)=>s+Number(r.promo_observations||0),0)/Math.max(1,promoRows.length):null;
      const discountDepth=promoRows.length?promoRows.reduce((s,r)=>s+Number(r.avg_discount_depth_pct||0),0)/Math.max(1,promoRows.length):null;
      const baselineSales=rows.rows.reduce((s,r)=>s+Number(r.baseline_sales||0),0),incrementalSales=rows.rows.reduce((s,r)=>s+Number(r.incremental_sales||0),0),tradeSpend=rows.rows.reduce((s,r)=>s+Number(r.trade_spend||0),0),grossMargin=rows.rows.reduce((s,r)=>s+Number(r.gross_margin||0),0);
      const estimatedIncrementalProfit=incrementalSales*(sales.totalSales?grossMargin/sales.totalSales:0),estimatedRoi=tradeSpend>0?(estimatedIncrementalProfit-tradeSpend)/tradeSpend*100:null;
      const periods=[...new Set(rows.rows.map(x=>x.week_ending).filter(Boolean))].sort();
      return {sales:{totalSales:sales.totalSales,totalUnits:sales.totalUnits},realizedPrice:price.averagePrice,promoRate,avgDiscountDepthPct:discountDepth,baselineSales,incrementalSales,tradeSpend,grossMargin,estimatedIncrementalProfit,estimatedPromotionROI:estimatedRoi,
        evidence:{source:rows.source,grain:"brand/category/retailer week",rowCount:rows.rows.length,periodStart:periods[0]??null,periodEnd:periods.at(-1)??null,periodCount:periods.length,filters,generatedAt:new Date().toISOString()},
        warnings:["Baseline is a supplied trailing-8-week heuristic; incremental sales are arithmetic actual-minus-baseline, not causal lift.","Promotion ROI is an analytical estimate using observed gross-margin rate and supplied trade spend; it is not an audited finance measure or proof of causal promotion effectiveness."]};
    }

    case "category_growth_plan": {
      const categoryName = String(a.categoryId || "").trim();
      if (!categoryName) return { error: "category_growth_plan requires categoryId." };
      const categoryDataset = await queryDataset({ ...a, brandId: undefined, categoryId: categoryName }, token);
      const result = categoryGrowthPlan(categoryDataset.rows, filtersFromArgs(a));
      const issues = validateAnalyticalResult(result);
      const ids = result.data.brands.map(x=>x.brandId).join(",");
      const brands = ids ? await get("cpgist_brands?select=id,name&id=in.(" + encodeURIComponent(ids) + ")", token) : [];
      const names = Object.fromEntries(brands.map((b:any)=>[String(b.id),b.name]));
      return {
        ...result.data,
        brands: result.data.brands.map(x=>({...x,brandName:names[x.brandId] ?? null})),
        diagnostics: result.data.diagnostics.map(x=>({...x,brandName:names[x.brandId] ?? null})),
        evidence:{...result.evidence,source:categoryDataset.source},
        warnings:[...result.warnings,...issues.map(i=>i.message)],
        validation:issues
      };
    }

    case "week_over_week_brands": {
      const result = compareBrandPeriods(dataset.rows, filters);
      const ids = result.data.brands.map(x => x.brandId).join(",");
      const brands = ids ? await get("cpgist_brands?select=id,name&id=in.(" + encodeURIComponent(ids) + ")", token) : [];
      const names = Object.fromEntries(brands.map((b:any) => [String(b.id), b.name]));
      return {
        ...result.data,
        brands: result.data.brands.map(x => ({ ...x, brandName: names[x.brandId] ?? null })),
        evidence: { ...result.evidence, source: dataset.source },
        warnings: result.warnings,
      };
    }
    case "get_sales": {
      const result = getSales(dataset.rows, filters);
      const issues = validateAnalyticalResult(result);
      return { ...result.data, evidence: { ...result.evidence, source: dataset.source }, warnings: result.warnings, validation: issues };
    }
    case "get_distribution": {
      const result = getDistribution(dataset.rows, filters);
      return { ...result.data, evidence: { ...result.evidence, source: dataset.source }, warnings: result.warnings };
    }
    case "get_price": {
      const result = getPrice(dataset.rows, filters);
      return { ...result.data, evidence: { ...result.evidence, source: dataset.source }, warnings: result.warnings };
    }
    case "analyze_drivers": {
      const result = analyzeDrivers(dataset.rows, filters);
      const issues = validateAnalyticalResult(result);
      const ids = result.data.byBrand.map(x => x.brandId).join(",");
      let brandNames: Record<string,string> = {};
      if (ids) {
        const brands = await get("cpgist_brands?select=id,name&id=in.(" + encodeURIComponent(ids) + ")", token);
        brandNames = Object.fromEntries(brands.map((b:any) => [String(b.id), b.name]));
      }
      return {
        ...result.data,
        byBrand: result.data.byBrand.map(x => ({ ...x, brandName: brandNames[x.brandId] ?? null })),
        evidence: { ...result.evidence, source: dataset.source },
        warnings: [...result.warnings, ...issues.map(i => i.message)],
        validation: issues
      };
    }
    case "detect_anomalies": {
      const result = detectAnomalies(dataset.rows, filters);
      return { ...result.data, evidence: { ...result.evidence, source: dataset.source }, warnings: result.warnings };
    }
    case "forecast_sales": {
      const result = forecastSales(dataset.rows, filters, Number(a.horizon || 4));
      return { ...result.data, evidence: { ...result.evidence, source: dataset.source }, warnings: result.warnings };
    }
    case "run_scenario": {
      const result = runScenario(dataset.rows, filters, Number(a.priceChangePct || 0), Number(a.distributionChangePts || 0));
      const issues = validateAnalyticalResult(result);
      return { ...result.data, evidence: { ...result.evidence, source: dataset.source }, warnings: [...result.warnings, ...issues.map(i => i.message)], validation: issues };
    }
    case "get_market_share": {
      if (!a.brandId) {
        return { error: "get_market_share requires brandId so the analyst can identify the numerator." };
      }
      const categoryRows = await queryDataset({ ...a, brandId: undefined }, token);
      const result = getMarketShare(dataset.rows, categoryRows.rows, filters);
      return { ...result.data, evidence: { ...result.evidence, source: dataset.source + " + " + categoryRows.source }, warnings: result.warnings };
    }
    default:
      throw new Error("Unsupported analytical tool: " + name);
  }
}

async function groqChat(key: string, body: any) {
  let last: Response | null = null;
  for (let attempt=0; attempt<3; attempt++) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify(body),
    });
    last = response;
    if (response.ok) {
      const raw = await response.text();
      try {
        return { response, data: raw ? JSON.parse(raw) : { error: "AI provider returned an empty response body." } };
      } catch {
        return { response, data: { error: "AI provider returned an unreadable JSON response." } };
      }
    }
    if (response.status !== 429 && response.status !== 502 && response.status !== 503 && response.status !== 504) {
      return { response, data: await response.json().catch(()=>({error:"AI provider returned an invalid response."})) };
    }
    const retryAfter = Number(response.headers.get("retry-after") || 0);
    const waitMs = retryAfter > 0 ? Math.min(retryAfter*1000, 8000) : 500 * Math.pow(2, attempt);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  const data = await last!.json().catch(()=>({error:"AI provider did not return a readable response."}));
  return { response: last!, data };
}

async function resolveBrandContext(brandId: string | undefined, token: string) {
  if (!brandId) return { brandName: null, category: null };
  try {
    const rows = await get("cpgist_brands?select=id,name,category&id=eq." + encodeURIComponent(brandId) + "&limit=1", token);
    return { brandName: rows?.[0]?.name ?? null, category: rows?.[0]?.category ?? null };
  } catch {
    return { brandName: null, category: null };
  }
}

function compactForModel(value: any, maxChars = 5600): any {
  const seen = new WeakSet();
  const walk = (v: any, depth = 0): any => {
    if (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
    if (depth > 4) return "[truncated]";
    if (typeof v === "object") {
      if (seen.has(v)) return "[circular]";
      seen.add(v);
      if (Array.isArray(v)) return v.slice(0, 12).map(x => walk(x, depth + 1));
      const out: Record<string, any> = {};
      for (const key of Object.keys(v).slice(0, 40)) out[key] = walk(v[key], depth + 1);
      return out;
    }
    return String(v);
  };
  const result = walk(value);
  const json = JSON.stringify(result);
  if (json.length <= maxChars) return result;
  return { truncatedEvidence: json.slice(0, maxChars) + "…", note: "Evidence was compacted to preserve model capacity." };
}

async function collectEvidence(question: string, brandId: string | undefined, token: string) {
  const q = question.toLowerCase();
  const scope = brandId ? { brandId } : {};
  const context = await resolveBrandContext(brandId, token);
  const categoryId = context.category || undefined;
  const selected: string[] = [];

  const add = (name: string) => { if (!selected.includes(name)) selected.push(name); };

  // Brand scope gets the validated 13-week business review as its evidence spine.
  // Market scope must never call the brand-only monthly review tool.
  if (brandId) {
    add("monthly_business_review");
  } else {
    add("business_health_scan");
    if (/category|growth|underperform|momentum|market|all brands|review|why|decline|improve|turnaround/.test(q)) {
      add("category_growth_plan");
    }
  }
  if (brandId && categoryId && /category|growth|underperform|momentum|monthly|review|why|decline|improve|turnaround/.test(q)) add("category_growth_plan");
  if (/sku|product|assortment|portfolio|item|size|pack/.test(q)) add("product_sku_performance");
  if (brandId && categoryId && /retailer|account|walmart|kroger|distribution|whitespace|store|customer/.test(q)) add("retailer_opportunity");
  if (/price|pricing|promotion|promo|discount|elasticity|roi/.test(q)) add("promotion_diagnostic");
  if (/competitor|competitive|competition|market movement/.test(q)) add("competitive_signals");
  if (/forecast|outlook|next 8|next 12|projection/.test(q)) add("forecast_sales");
  if (/anomal|spike|drop|unusual|outlier/.test(q)) add("detect_anomalies");
  if (brandId && categoryId && /share|market share|category context/.test(q)) add("get_market_share");
  if (/scenario|what if|simulate/.test(q)) add("run_scenario");

  const evidence: any[] = [];
  for (const name of selected.slice(0, 3)) {
    try {
      const args: Args = { ...scope };
      if (categoryId && ["category_growth_plan","retailer_opportunity","get_market_share"].includes(name)) args.categoryId = categoryId;
      if (name === "forecast_sales") args.horizon = 8;
      if (name === "run_scenario") { args.priceChangePct = 0; args.distributionChangePts = 0; }
      const result = await tool(name, args, token);
      evidence.push({ tool: name, result: compactForModel(result) });
    } catch (error: any) {
      evidence.push({ tool: name, result: { error: error?.message || "Analytical tool failed." } });
    }
  }
  return { evidence, context, selected };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const key = process.env.GROQ_API_KEY;
    if (!key) return NextResponse.json({ error: "GROQ_API_KEY is not configured in Vercel Production." }, { status: 503 });

    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Please sign in again before using AI Analyst." }, { status: 401 });

    const capabilityCatalog = capabilityContext();
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const latestUser = [...incoming].reverse().find((m: any) => m?.role === "user")?.content || "";
    const brandId = body?.scope?.brandId ? String(body.scope.brandId) : undefined;
    const activeScope = brandId
      ? "\nActive analysis scope: brandId=" + brandId + ". Keep the answer focused on this brand unless the user explicitly changes scope."
      : "";
    const { evidence, context, selected } = await collectEvidence(String(latestUser), brandId, token);

    const evidenceJson = JSON.stringify(evidence);
    const messages = [
      {
        role: "system",
        content: "You are CPGist AI Analyst, an evidence-first CPG business analyst. The database/analytical layer has already calculated the metrics. Your job is to interpret those results precisely and communicate them like a professional CPG business review. Do not calculate replacement numbers, invent missing data, or claim causality from descriptive evidence. Treat diagnostic labels as hypotheses, never as proof. Distinguish observed facts, diagnostic interpretations, hypotheses, and actions. Never report a metric if the supplied evidence has a validation error or scope mismatch. Never infer margin without cost/margin data, never quantify whitespace as incremental opportunity unless explicitly sized by the analytical layer, and never describe a period as 13 weeks unless evidence.periodCount is 13. If evidence is unavailable, say so explicitly. Use brandName and category names when available. Never turn a limitation into a fabricated estimate.\n\nCapability catalog:\n" + capabilityCatalog + "\n\nScope context:\n" + JSON.stringify(context) + activeScope + "\n\nControlled evidence from this request:\n" + evidenceJson + "\n\nReturn ONLY a JSON object with exactly these fields: type, headline, executiveTakeaway, metrics, table, sections, warnings, evidence, decisionTrail, nextBestQuestion. metrics is an array of {label,value,change?,tone?}; table is null or {columns,rows}; sections is an array of {title,bullets}; warnings is an array; evidence is {source,period,periodCount,filters}; decisionTrail is an array of {type,text} using observed|diagnostic|action|limitation. Keep the answer concise but specific. Every quantitative claim must be traceable to the supplied evidence. For recommendations, reference the signal that triggered the recommendation. Do not claim that price, promotion, distribution or retailer mix caused sales movement unless the evidence explicitly establishes it. If the user asks a question outside the supplied data, answer the supported portion and state the missing domain.\nSelected deterministic tools: " + selected.join(", ")
      },
      ...incoming.slice(-6).map((m: any) => ({
        role: m?.role === "assistant" ? "assistant" : "user",
        content: String(m?.content || "").slice(-1600)
      }))
    ];

    const { response, data } = await groqChat(key, {
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      messages,
      temperature: 0.05,
      max_completion_tokens: 1400,
      reasoning_effort: "low",
      include_reasoning: false,
      response_format: { type: "json_object" }
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || data?.message || "AI provider request failed.", providerStatus: response.status },
        { status: response.status }
      );
    }

    const raw = data.choices?.[0]?.message?.content;
    try {
      const analyst = JSON.parse(raw || "{}");
      if (!analyst.headline || !analyst.executiveTakeaway || !Array.isArray(analyst.metrics) || !Array.isArray(analyst.sections) || !Array.isArray(analyst.warnings) || !Array.isArray(analyst.decisionTrail)) {
        throw new Error("Invalid structured analyst response.");
      }

      const monthlyEvidence = evidence.find(x => x.tool === "monthly_business_review")?.result?.evidence;
      const validationIssues = evidence.flatMap(x => Array.isArray(x.result?.validation) ? x.result.validation : []);
      analyst.evidence = {
        source: monthlyEvidence?.source ?? analyst.evidence?.source ?? "CPGist analytical layer",
        period: monthlyEvidence?.periodStart && monthlyEvidence?.periodEnd
          ? String(monthlyEvidence.periodStart) + " → " + String(monthlyEvidence.periodEnd)
          : analyst.evidence?.period ?? "Observed source coverage",
        periodCount: Number(monthlyEvidence?.periodCount ?? analyst.evidence?.periodCount ?? 0),
        filters: JSON.stringify(monthlyEvidence?.filters ?? {})
      };
      analyst.warnings = [...new Set([
        ...(analyst.warnings || []),
        ...evidence.flatMap(x => Array.isArray(x.result?.warnings) ? x.result.warnings : []),
        ...validationIssues.filter((x:any) => x.severity === "warning").map((x:any) => x.message)
      ])];
      const hardValidationErrors = validationIssues.filter((x:any) => x.severity === "error");
      if (hardValidationErrors.length) {
        analyst.warnings = [...new Set([...analyst.warnings, ...hardValidationErrors.map((x:any) => x.message)])];
        analyst.decisionTrail = (analyst.decisionTrail || []).filter((x:any) => x.type !== "action");
      }

      return NextResponse.json({
        analyst,
        verification: { performed: false, toolCount: evidence.length, mode: "deterministic-evidence + single-model-call" }
      });
    } catch {
      return NextResponse.json({ error: "The analyst produced an invalid structured response. Please retry." }, { status: 502 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "AI Analyst request failed." }, { status: 500 });
  }
}
