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
import {getPromoLift,getSkuGrowth,getCategoryContext,getChannelBreakdown,getMarginPnl,getLaunchPerformance,getSyntheticPanel,getMacroOverlay} from "../../../lib/cpg-advanced";

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

async function getAll(path: string, token: string, pageSize = 1000, maxRows = 10000) {
  const clean = path.replace(/([&?])limit=\d+/, "$1").replace(/&&/g, "&").replace(/[?&]$/, "");
  const out:any[] = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const sep = clean.includes("?") ? "&" : "?";
    const page = await get(clean + sep + "limit=" + pageSize + "&offset=" + offset, token);
    if (!Array.isArray(page) || !page.length) break;
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out.slice(0, maxRows);
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
    const raw = await getAll(q, token);
    return { rows: raw.map((r:any) => ({
      brand_id: r.brand_id, category: r.category, retailer_id: r.retailer_id, week_ending: r.week_ending,
      dollar_sales: r.sales, units: r.units, acv_distribution: r.distribution,
      avg_price: r.price, promo_observations: r.promo_rate, observations: 1, is_actual: r.is_actual
    })), source: "cpgist_brand_retailer_weekly" };
  }

  let q = "cpgist_brand_weekly?select=brand_id,category,week_ending,sales,units,distribution,avg_price,promo_rate,is_actual&limit=100000";
  if (brand) q += "&brand_id=eq." + encodeURIComponent(brand);
  if (category) q += "&category=ilike." + encodeURIComponent(category);
  if (a.startDate) q += "&week_ending=gte." + encodeURIComponent(String(a.startDate));
  if (a.endDate) q += "&week_ending=lte." + encodeURIComponent(String(a.endDate));
  const raw = await getAll(q, token);
  return { rows: raw.map((r:any) => ({
    brand_id: r.brand_id, category: r.category, week_ending: r.week_ending,
    dollar_sales: r.sales, units: r.units, acv_distribution: r.distribution,
    avg_price: r.avg_price, promo_observations: r.promo_rate, observations: 1, is_actual: r.is_actual
  })), source: "cpgist_brand_weekly" };
}
async function tool(name: string, a: Args, token: string) {
  const filters = filtersFromArgs(a);
  const dataset = await queryDataset(a, token);

  switch (name) {
    case "data_readiness": {
      const tables = ["cpgist_brands","cpgist_products","cpgist_categories","cpgist_regions","cpgist_brand_weekly","cpgist_category_weekly","cpgist_retailer_weekly","cpgist_brand_retailer_weekly","cpgist_brand_retailer_summary","cpgist_product_weekly","cpgist_product_summary","cpgist_competitor_weekly","cpgist_competitor_price_sales","syndicate_competitor_signals","cpgist_promotion_events","cpgist_baseline_sales","cpgist_trade_spend","cpgist_category_aggregates","cpgist_trial_repeat","cpgist_panel_household","cpgist_macro_signals"];
      const counts: Record<string, number> = {};
      for (const table of tables) {
        try {
          const response = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/" + table + "?select=*", { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "", Authorization: "Bearer " + token, Prefer: "count=exact" }, cache: "no-store" });
          if (!response.ok) throw new Error("readiness check failed");
          const range = response.headers.get("content-range");
          counts[table] = range && range.includes("/") ? Number(range.split("/")[1]) || 0 : (await response.json()).length;
        } catch { counts[table] = 0; }
      }
      return { domains: { sales: counts.cpgist_brand_weekly > 0, retailerOpportunity: counts.cpgist_brand_retailer_weekly > 0 || counts.cpgist_brand_retailer_summary > 0, products: counts.cpgist_product_weekly > 0 || counts.cpgist_product_summary > 0, competition: counts.cpgist_competitor_weekly > 0 || counts.cpgist_competitor_price_sales > 0 || counts.syndicate_competitor_signals > 0, geography: counts.cpgist_product_weekly > 0 && counts.cpgist_retailers > 0 && counts.cpgist_regions > 0, shopper: counts.cpgist_panel_household > 0, innovation: counts.cpgist_trial_repeat > 0, ecommerce: false, promotionEconomics: counts.cpgist_promotion_events > 0 && counts.cpgist_baseline_sales > 0 && counts.cpgist_trade_spend > 0, margin: counts.cpgist_product_weekly > 0 || counts.cpgist_brand_retailer_weekly > 0, channel: counts.cpgist_brand_retailer_weekly > 0, macro: counts.cpgist_macro_signals > 0 }, counts, warnings: counts.cpgist_brand_weekly === 0 ? ["CPGist Free Dataset is not imported yet."] : [] };
    }

    case "business_health_scan": {
      const result = businessHealthScan(dataset.rows, filters);
      const brandId = String(a.brandId || "").trim();
      let category = String(a.categoryId || "").trim();
      const retailerWarnings: string[] = [];
      let retailerOpportunityEvidence: any = null;

      // Health scan previously used only brand-weekly data, so the model could see
      // overall ACV but not the retailer-level distribution already present in the
      // supplied dataset. Enrich the scan with the canonical retailer summary.
      if (brandId) {
        if (!category) {
          try {
            const brandContext = await resolveBrandContext(brandId, token);
            category = String(brandContext.category || "").trim();
          } catch {}
        }
        if (category) {
          try {
            const encodedCategory = encodeURIComponent(category);
            let retailerRows = await get(
              "cpgist_brand_retailer_weekly?select=brand_id,retailer_id,category,sales,units,distribution,price,promo_rate&category=ilike." +
              encodedCategory + "&limit=100000",
              token
            );
            if (!retailerRows.length) {
              const summary = await get(
                "cpgist_brand_retailer_summary?select=brand_id,retailer_id,category,sales_13w,units_13w,distribution_13w,avg_price_13w,promo_rate_13w&category=ilike." +
                encodedCategory + "&limit=100000",
                token
              );
              retailerRows = summary.map((r:any) => ({
                brand_id: r.brand_id,
                retailer_id: r.retailer_id,
                category: r.category,
                sales: r.sales_13w,
                units: r.units_13w,
                distribution: r.distribution_13w,
                price: r.avg_price_13w,
                promo_rate: r.promo_rate_13w
              }));
            }
            const retailerResult = retailerOpportunity(retailerRows, brandId, category);
            const ids = retailerResult.data.retailers.map(x => x.retailerId).join(",");
            const retailerMaster = ids
              ? await get("cpgist_retailers?select=id,name,channel,region,retailer_group,total_stores&id=in.(" + encodeURIComponent(ids) + ")", token)
              : [];
            const names = Object.fromEntries(retailerMaster.map((r:any) => [String(r.id), r]));
            retailerOpportunityEvidence = {
              category: category,
              categoryBrandSharePct: retailerResult.data.categoryBrandSharePct,
              retailers: retailerResult.data.retailers.map(x => ({
                ...x,
                retailerName: names[x.retailerId]?.name ?? null,
                channel: names[x.retailerId]?.channel ?? null,
                region: names[x.retailerId]?.region ?? null,
                totalStores: names[x.retailerId]?.total_stores ?? null
              })),
              evidence: retailerResult.evidence
            };
            retailerWarnings.push(...retailerResult.warnings);
          } catch {
            retailerWarnings.push("Retailer-level distribution could not be loaded for this health scan.");
          }
        } else {
          retailerWarnings.push("Brand category is required to evaluate retailer-level whitespace.");
        }
      }

      return {
        ...result.data,
        retailerOpportunity: retailerOpportunityEvidence,
        evidence: {
          ...result.evidence,
          source: dataset.source,
          retailerOpportunitySource: retailerOpportunityEvidence?.evidence?.source ?? null,
          retailerOpportunityGrain: retailerOpportunityEvidence?.evidence?.grain ?? null
        },
        warnings: [...result.warnings, ...retailerWarnings]
      };
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

    case "product_competitor_diagnostic": {
      const brandId=String(a.brandId||"").trim();
      if(!brandId) return {error:"product_competitor_diagnostic requires brandId."};

      const productQuery=String(a.productQuery||"").trim().toLowerCase();
      const products=await get("cpgist_products?brand_id=eq."+encodeURIComponent(brandId)+"&select=id,name,sku,category,subcategory,size,pack_count&limit=5000",token);
      if(!products.length) return {product:null,productRetailers:[],regions:[],competitorBenchmark:{},evidence:{source:"cpgist_products + cpgist_product_weekly + cpgist_competitor_price_sales",grain:"product/retailer/region",rowCount:0,periodStart:null,periodEnd:null,periodCount:0,filters:filtersFromArgs(a),generatedAt:new Date().toISOString()},warnings:["No products are populated for the selected brand."]};

      const scored=products.map((p:any)=>{
        const hay=(String(p.name||"")+" "+String(p.sku||"")+" "+String(p.subcategory||"")).toLowerCase();
        const tokens=productQuery.split(/\\s+/).filter(x=>x.length>2);
        const score=tokens.reduce((n,t)=>n+(hay.includes(t)?1:0),0)+(productQuery&&hay.includes(productQuery)?3:0);
        return {p,score};
      }).sort((a:any,b:any)=>b.score-a.score);
      const selected=scored[0]?.p;
      if(!selected || (productQuery && scored[0]?.score===0)) {
        return {
          product:null,
          productCandidates:products.slice(0,10),
          evidence:{source:"cpgist_products",grain:"product master",rowCount:products.length,periodStart:null,periodEnd:null,periodCount:0,filters:{...filtersFromArgs(a),productQuery},generatedAt:new Date().toISOString()},
          warnings:["The requested product could not be matched confidently to the selected brand's product master."]
        };
      }

      const productRows=await getAll("cpgist_product_weekly?product_id=eq."+encodeURIComponent(String(selected.id))+"&select=product_id,brand_id,retailer_id,week_ending,sales,units,price,distribution,promo_rate,is_actual&order=week_ending.asc&limit=100000",token,1000,10000);
      const periods=[...new Set(productRows.map((x:any)=>String(x.week_ending)).filter(Boolean))].sort();
      const latest=periods.slice(-13), prior=periods.slice(-26,-13);
      const latestSet=new Set(latest), priorSet=new Set(prior);
      const recent=productRows.filter((x:any)=>latestSet.has(String(x.week_ending)));
      const old=productRows.filter((x:any)=>priorSet.has(String(x.week_ending)));
      const sum=(rows:any[],key:string)=>rows.reduce((n,r)=>n+Number(r[key]||0),0);
      const avg=(rows:any[],key:string)=>rows.length?rows.reduce((n,r)=>n+Number(r[key]||0),0)/rows.length:null;
      const growth=(now:number,base:number)=>base?(now/base-1)*100:null;
      const recentSales=sum(recent,"sales"), priorSales=sum(old,"sales");
      const recentUnits=sum(recent,"units"), priorUnits=sum(old,"units");
      const recentPrice=recentUnits?recentSales/recentUnits:null;
      const priorPrice=priorUnits?priorSales/priorUnits:null;

      const retailerIds=[...new Set(productRows.map((x:any)=>String(x.retailer_id)).filter(Boolean))];
      const retailerMaster=retailerIds.length?await get("cpgist_retailers?select=id,name,channel,region,total_stores&id=in.("+encodeURIComponent(retailerIds.join(","))+")&limit=5000",token):[];
      const retailerMap=Object.fromEntries(retailerMaster.map((x:any)=>[String(x.id),x]));

      const retailerAgg=new Map<string,any>();
      for(const r of recent){
        const id=String(r.retailer_id);
        const x=retailerAgg.get(id)||{retailerId:id,sales:0,units:0,distributionSum:0,weeks:0};
        x.sales+=Number(r.sales||0); x.units+=Number(r.units||0); x.distributionSum+=Number(r.distribution||0); x.weeks++;
        retailerAgg.set(id,x);
      }
      const retailerPrior=new Map<string,number>();
      for(const r of old) retailerPrior.set(String(r.retailer_id),(retailerPrior.get(String(r.retailer_id))||0)+Number(r.sales||0));
      const productRetailers=[...retailerAgg.values()].map(x=>{
        const m=retailerMap[x.retailerId]||{};
        return {...x,retailerName:m.name||null,region:m.region||null,channel:m.channel||null,totalStores:m.total_stores??null,distribution:x.weeks?x.distributionSum/x.weeks:null,salesGrowthPct:growth(x.sales,retailerPrior.get(x.retailerId)||0)};
      }).sort((a,b)=>b.sales-a.sales).slice(0,20);

      const regionMap=new Map<string,any>();
      for(const x of productRetailers){
        const region=x.region||"Unknown";
        const z=regionMap.get(region)||{region,sales:0,units:0,retailers:0,distributionWeighted:0};
        z.sales+=x.sales; z.units+=x.units; z.retailers++; z.distributionWeighted+=Number(x.distribution||0);
        regionMap.set(region,z);
      }
      const regions=[...regionMap.values()].map(x=>({...x,avgDistribution:x.retailers?x.distributionWeighted/x.retailers:null})).sort((a:any,b:any)=>b.sales-a.sales);

      // Competitor price/sales is a brand/retailer/region benchmark, not SKU-level.
      // The competitor file contains competitor brands only; it does NOT contain the focal
      // brand. Therefore the focal brand must come from cpgist_product_weekly and the peer
      // benchmark must come from cpgist_competitor_price_sales at the same category/region grain.
      const cat=String(selected.category||"");
      const compRows=cat?await getAll("cpgist_competitor_fact?category=eq."+encodeURIComponent(cat)+"&select=brand,retailer,region,category,week,sales,units,price,is_actual&order=week.asc&limit=100000",token,1000,20000):[];
      const compPeriods=[...new Set(compRows.map((x:any)=>String(x.week)).filter(Boolean))].sort();
      const compLatest=new Set(compPeriods.slice(-13));
      const compRecent=compRows.filter((x:any)=>compLatest.has(String(x.week)));

      const contextBrand=await resolveBrandContext(brandId,token);
      const selectedBrandName=String(contextBrand.brandName||"");

      // Prefer the explicit v3 competitor relationship mapping for peer selection.
      let relatedNames:string[]=[];
      try{
        const rels=await get("syndicate_brand_relationships?brand_id=eq."+encodeURIComponent(brandId)+"&relationship_type=eq.competitor&select=related_brand_id&limit=5000",token);
        if(Array.isArray(rels)&&rels.length){
          const ids=rels.map((r:any)=>String(r.related_brand_id)).filter(Boolean);
          const peerMasters=await get("cpgist_brands?id=in.("+encodeURIComponent(ids.join(","))+")&select=id,name&limit=5000",token);
          relatedNames=peerMasters.map((r:any)=>String(r.name||"")).filter(Boolean);
        }
      }catch{}
      const relatedNameSet=new Set(relatedNames.map(x=>x.toLowerCase()));

      // Focal product sales by region over the same latest 13 weeks.
      const focalRegion=new Map<string,any>();
      for(const r of recent){
        const rm=retailerMap[String(r.retailer_id)]||{};
        const region=String(rm.region||"Unknown");
        const x=focalRegion.get(region)||{region,sales:0,units:0,retailers:new Set<string>(),distributionSum:0,weeks:0};
        x.sales+=Number(r.sales||0); x.units+=Number(r.units||0);
        x.retailers.add(String(r.retailer_id)); x.distributionSum+=Number(r.distribution||0); x.weeks++;
        focalRegion.set(region,x);
      }

      const compByRegion=new Map<string,Map<string,any>>();
      for(const r of compRecent){
        const region=String(r.region||"Unknown"), name=String(r.brand||"");
        if(name.toLowerCase()===selectedBrandName.toLowerCase())continue;
        if(relatedNameSet.size && !relatedNameSet.has(name.toLowerCase()))continue;
        const brands=compByRegion.get(region)||new Map<string,any>();
        const x=brands.get(name)||{brand:name,sales:0,units:0};
        x.sales+=Number(r.sales||0); x.units+=Number(r.units||0);
        brands.set(name,x); compByRegion.set(region,brands);
      }

      const competitorRegions=[...focalRegion.values()].map((f:any)=>{
        const peers=[...(compByRegion.get(f.region)?.values()||[])].sort((a:any,b:any)=>Number(b.sales)-Number(a.sales));
        const focalEntry={sales:f.sales};
        const combined=[focalEntry,...peers].sort((a:any,b:any)=>Number(b.sales)-Number(a.sales));
        const rank=combined.indexOf(focalEntry)+1;
        const topPeer=peers[0]||null;
        return {
          region:f.region,
          selectedBrandSales:f.sales,
          selectedBrandUnits:f.units,
          selectedBrandRank:rank,
          brandCount:peers.length+1,
          topPeerSales:topPeer?.sales??null,
          peerGapPct:topPeer?growth(f.sales,topPeer.sales):null,
          retailerCount:f.retailers.size,
          avgDistribution:f.weeks?f.distributionSum/f.weeks:null
        };
      }).sort((a:any,b:any)=>Number(b.selectedBrandSales)-Number(a.selectedBrandSales));

      // Same-grain retailer comparison. Focal sales are from product_weekly; peer sales are
      // from competitor_price_sales. This avoids the previous bug where the focal brand was
      // searched inside a competitor-only table and therefore appeared to have no data.
      const focalRetailer=new Map<string,any>();
      for(const r of recent){
        const rm=retailerMap[String(r.retailer_id)]||{};
        const key=String(rm.name||r.retailer_id)+"|"+String(rm.region||"Unknown");
        const x=focalRetailer.get(key)||{retailer:String(rm.name||r.retailer_id),region:String(rm.region||"Unknown"),sales:0,units:0};
        x.sales+=Number(r.sales||0); x.units+=Number(r.units||0); focalRetailer.set(key,x);
      }
      const compByRetailer=new Map<string,Map<string,any>>();
      for(const r of compRecent){
        const key=String(r.retailer||"Unknown")+"|"+String(r.region||"Unknown"),name=String(r.brand||"");
        if(relatedNameSet.size && !relatedNameSet.has(name.toLowerCase()))continue;
        const brands=compByRetailer.get(key)||new Map<string,any>();
        const x=brands.get(name)||{brand:name,sales:0,units:0};
        x.sales+=Number(r.sales||0); x.units+=Number(r.units||0); brands.set(name,x); compByRetailer.set(key,brands);
      }
      const competitorRetailers=[...focalRetailer.values()].map((f:any)=>{
        const peers=[...(compByRetailer.get(f.retailer+"|"+f.region)?.values()||[])].sort((a:any,b:any)=>Number(b.sales)-Number(a.sales));
        const focalEntry={sales:f.sales};
        const combined=[focalEntry,...peers].sort((a:any,b:any)=>Number(b.sales)-Number(a.sales));
        const topPeer=peers[0]||null;
        return {
          retailer:f.retailer,region:f.region,selectedBrandSales:f.sales,
          topPeerSales:topPeer?.sales??null,
          selectedBrandRank:combined.indexOf(focalEntry)+1,
          brandCount:peers.length+1,
          peerGapPct:topPeer?growth(f.sales,topPeer.sales):null
        };
      }).sort((a:any,b:any)=>Number(b.selectedBrandSales)-Number(a.selectedBrandSales)).slice(0,20);

      const brandProducts=await get("cpgist_product_summary?brand_id=eq."+encodeURIComponent(brandId)+"&select=product_id,sales_13w&order=sales_13w.desc&limit=100",token);
      const brandProductSales=sum(brandProducts,"sales_13w");
      return {
        product:{id:selected.id,name:selected.name,sku:selected.sku,category:selected.category,subcategory:selected.subcategory,size:selected.size,latest13wSales:recentSales,prior13wSales:priorSales,salesGrowthPct:growth(recentSales,priorSales),latest13wUnits:recentUnits,avgPrice:recentPrice,distribution:avg(recent,"distribution"),promoRate:avg(recent,"promo_rate"),shareOfBrand:brandProductSales?recentSales/brandProductSales:null},
        productRetailers,
        regions,
        competitorBenchmark:{
          grain:"brand-level category benchmark, not SKU-to-SKU",
          category:cat,
          regions:competitorRegions,
          retailers:competitorRetailers,
          skuToSkuAvailable:false
        },
        evidence:{source:"cpgist_product_weekly + cpgist_products + cpgist_retailers + cpgist_competitor_fact + cpgist_product_summary",grain:"product/retailer/region plus brand-level competitor benchmark",rowCount:productRows.length+compRows.length,periodStart:latest[0]??null,periodEnd:latest.at(-1)??null,periodCount:latest.length,filters:{...filtersFromArgs(a),productId:selected.id,productName:selected.name},generatedAt:new Date().toISOString()},
        warnings:[
          ...(latest.length<13?["Fewer than 13 product weeks are available for the requested recent period."]:[]),
          ...(prior.length<13?["Fewer than 13 prior product weeks are available for product growth."]:[]),
          compRows.length?["Competitor evidence is available at brand/retailer/region level; the connected competitor table does not contain SKU identifiers, so SKU-to-SKU Butter-vs-competitor comparison is not claimed."]:["No competitor price/sales rows are populated for this product category."]
        ]
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

      // The product summary is not regional, but the underlying product-weekly
      // table is linked to retailers, and retailers carry region metadata.
      // Pull that layer when it is available so product questions such as
      // "where is Butter underperforming?" can be answered from observed data.
      const productIdList = rows.map((x:any)=>String(x.product_id)).filter(Boolean);
      let regionalByProduct: Record<string, any[]> = {};
      if (productIdList.length) {
        const weekly = await getAll(
          "cpgist_product_weekly?product_id=in.("+encodeURIComponent(productIdList.join(","))+")&select=product_id,retailer_id,week_ending,sales,units,distribution,promo_rate,price,is_actual&order=week_ending.asc&limit=100000",
          token, 1000, 20000
        );
        const retailerIds = [...new Set(weekly.map((x:any)=>String(x.retailer_id)).filter(Boolean))];
        const retailerRows = retailerIds.length
          ? await get("cpgist_retailers?select=id,name,region,channel,total_stores&id=in.("+encodeURIComponent(retailerIds.join(","))+")&limit=5000", token)
          : [];
        const retailerMap = Object.fromEntries(retailerRows.map((x:any)=>[String(x.id),x]));
        const periods = [...new Set(weekly.map((x:any)=>String(x.week_ending)).filter(Boolean))].sort();
        const latest13 = periods.slice(-13);
        const prior13 = periods.slice(-26,-13);
        const recentSet = new Set(latest13), priorSet = new Set(prior13);
        const regionAgg = new Map<string,any>();
        for (const r of weekly) {
          const region = String(retailerMap[String(r.retailer_id)]?.region || "Unknown");
          const key = String(r.product_id)+"|"+region;
          const x = regionAgg.get(key) || { productId:String(r.product_id), region, sales:0, units:0, distributionSum:0, promoSum:0, priceSum:0, weeks:0, priorSales:0, priorWeeks:0 };
          const isRecent = recentSet.has(String(r.week_ending));
          const isPrior = priorSet.has(String(r.week_ending));
          if (isRecent) {
            x.sales += Number(r.sales||0);
            x.units += Number(r.units||0);
            x.distributionSum += Number(r.distribution||0);
            x.promoSum += Number(r.promo_rate||0);
            x.priceSum += Number(r.price||0);
            x.weeks++;
          } else if (isPrior) {
            x.priorSales += Number(r.sales||0);
            x.priorWeeks++;
          }
          regionAgg.set(key,x);
        }
        for (const x of regionAgg.values()) {
          const item = {
            region:x.region,
            sales:x.sales,
            priorSales:x.priorSales,
            salesGrowthPct:x.priorSales ? (x.sales/x.priorSales-1)*100 : null,
            units:x.units,
            avgDistribution:x.weeks ? x.distributionSum/x.weeks : null,
            avgPromoRate:x.weeks ? x.promoSum/x.weeks : null,
            avgPrice:x.weeks ? x.priceSum/x.weeks : null,
            weeks:x.weeks,
            priorWeeks:x.priorWeeks
          };
          (regionalByProduct[x.productId] ||= []).push(item);
        }
        for (const id of Object.keys(regionalByProduct)) regionalByProduct[id].sort((a:any,b:any)=>Number(a.sales)-Number(b.sales));
      }

      return {
        products: rows.map((x:any)=>({
          ...x,
          ...(master[String(x.product_id)]||{}),
          shareOfBrand:total?Number(x.sales_13w||0)/total:0,
          regionalPerformance:regionalByProduct[String(x.product_id)]||[]
        })),
        totalSales:total,
        evidence:{
          source:"cpgist_product_summary + cpgist_product_weekly + cpgist_retailers",
          grain:"product 13-week summary with product/region weekly drill-down",
          rowCount:rows.length,
          periodStart:rows[0]?.period_end??null,
          periodEnd:rows[0]?.period_end??null,
          periodCount:1,
          filters:filtersFromArgs(a),
          generatedAt:new Date().toISOString()
        },
        warnings:[
          ...(Object.keys(regionalByProduct).length ? [] : ["Regional product performance is unavailable because the product-weekly rows could not be linked to retailer region metadata."])
        ]
      };
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
      const periods=[...new Set(rows.rows.map(x=>x.week_ending).filter(Boolean))].sort();
      return {sales:{totalSales:sales.totalSales,totalUnits:sales.totalUnits},realizedPrice:price.averagePrice,promoRate,avgDiscountDepthPct:discountDepth,
        evidence:{source:rows.source,grain:"brand/category/retailer week",rowCount:rows.rows.length,periodStart:periods[0]??null,periodEnd:periods.at(-1)??null,periodCount:periods.length,filters,generatedAt:new Date().toISOString()},
        warnings:["Promotion observations are descriptive. Incremental promotional lift, ROI and causal effectiveness are not estimated by the current dataset."]};
    }

    case "get_promo_lift": {
      const brandId=String(a.brandId||"").trim();
      if(!brandId)return {error:"get_promo_lift requires brandId."};
      const [events,baseline,trade,sales]=await Promise.all([
        get("cpgist_promotion_events?brand_id=eq."+encodeURIComponent(brandId)+"&select=*&limit=5000",token),
        get("cpgist_baseline_sales?brand_id=eq."+encodeURIComponent(brandId)+"&select=*&limit=100000",token),
        get("cpgist_trade_spend?brand_id=eq."+encodeURIComponent(brandId)+"&select=*&limit=100000",token),
        get("cpgist_product_weekly?brand_id=eq."+encodeURIComponent(brandId)+"&select=product_id,brand_id,retailer_id,week_ending,sales,units,gross_margin,is_actual&limit=100000",token)
      ]);
      const result=getPromoLift(events,sales,baseline,trade);
      return {...result,evidence:{source:"cpgist_promotion_events + cpgist_product_weekly + cpgist_baseline_sales + cpgist_trade_spend",grain:"promotion event",rowCount:result.events.length,periodStart:result.events[0]?.dateStart??null,periodEnd:result.events.at(-1)?.dateEnd??null,periodCount:new Set(result.events.map((x:any)=>x.dateStart)).size,filters:filtersFromArgs(a),generatedAt:new Date().toISOString()},warnings:result.available?[]:["Promotion economics data is not populated for this brand."]};
    }
    case "get_sku_growth": {
      const brandId=String(a.brandId||"").trim();
      const rows=await get("cpgist_product_weekly?brand_id=eq."+encodeURIComponent(brandId)+"&select=product_id,brand_id,week_ending,sales,units,is_actual&order=week_ending.asc&limit=100000",token);
      const result=getSkuGrowth(rows);
      return {...result,evidence:{source:"cpgist_product_weekly",grain:"SKU week",rowCount:rows.length,periodStart:rows[0]?.week_ending??null,periodEnd:rows.at(-1)?.week_ending??null,periodCount:new Set(rows.map((x:any)=>x.week_ending)).size,filters:filtersFromArgs(a),generatedAt:new Date().toISOString()},warnings:result.products.length?[]:["SKU weekly data is not populated."]};
    }
    case "get_category_context": {
      const brandId=String(a.brandId||"").trim(),ctx=await resolveBrandContext(brandId,token),cat=String(a.categoryId||ctx.category||"");
      const [cr,br]=await Promise.all([
        get("cpgist_category_aggregates?category=eq."+encodeURIComponent(cat)+"&select=*&order=week.asc&limit=100000",token),
        get("cpgist_brand_weekly?brand_id=eq."+encodeURIComponent(brandId)+"&select=brand_id,week_ending,sales,is_actual&order=week_ending.asc&limit=100000",token)
      ]);
      const result=getCategoryContext(cr,br,brandId);
      return {...result,evidence:{source:"cpgist_category_aggregates + cpgist_brand_weekly",grain:"category/brand week",rowCount:cr.length+br.length,periodStart:result.context?.periods?.[0]??null,periodEnd:result.context?.periods?.at(-1)??null,periodCount:result.context?.periodCount??0,filters:{...filtersFromArgs(a),categoryId:cat},generatedAt:new Date().toISOString()},warnings:result.available?[]:["Observed category aggregates are not populated."]};
    }
    case "get_channel_breakdown": {
      const brandId=String(a.brandId||"").trim();
      const [rr,rm]=await Promise.all([
        get("cpgist_brand_retailer_weekly?brand_id=eq."+encodeURIComponent(brandId)+"&select=brand_id,retailer_id,week_ending,sales,units,distribution&limit=100000",token),
        get("cpgist_retailers?select=id,name,channel,region,retailer_group,total_stores&limit=5000",token)
      ]);
      const result=getChannelBreakdown(rr,rm);
      return {channels:result,evidence:{source:"cpgist_brand_retailer_weekly + cpgist_retailers.channel",grain:"retailer week rolled to channel",rowCount:rr.length,periodStart:rr[0]?.week_ending??null,periodEnd:rr.at(-1)?.week_ending??null,periodCount:new Set(rr.map((x:any)=>x.week_ending)).size,filters:filtersFromArgs(a),generatedAt:new Date().toISOString()},warnings:result.length?[]:["Channel-level retailer sales are not populated."]};
    }
    case "get_margin_pnl": {
      const brandId=String(a.brandId||"").trim();
      const [rows,pm,rm]=await Promise.all([
        get("cpgist_product_weekly?brand_id=eq."+encodeURIComponent(brandId)+"&select=product_id,brand_id,retailer_id,week_ending,sales,units,gross_margin,margin_percent,is_actual&limit=100000",token),
        get("cpgist_products?brand_id=eq."+encodeURIComponent(brandId)+"&select=id,name,sku,subcategory&limit=5000",token),
        get("cpgist_retailers?select=id,name,channel,region&limit=5000",token)
      ]);
      const result=getMarginPnl(rows,pm,rm);
      return {...result,evidence:{source:"cpgist_product_weekly + cpgist_products + cpgist_retailers",grain:"SKU/retailer week",rowCount:rows.length,periodStart:rows[0]?.week_ending??null,periodEnd:rows.at(-1)?.week_ending??null,periodCount:new Set(rows.map((x:any)=>x.week_ending)).size,filters:filtersFromArgs(a),generatedAt:new Date().toISOString()},warnings:result.available?[]:["Margin-bearing SKU weekly data is not populated."]};
    }
    case "get_launch_performance": {
      const brandId=String(a.brandId||"").trim();
      const [pm,tr,sales]=await Promise.all([
        get("cpgist_products?brand_id=eq."+encodeURIComponent(brandId)+"&select=id,name,sku,launch_date&limit=5000",token),
        get("cpgist_trial_repeat?select=*&limit=100000",token),
        get("cpgist_product_weekly?brand_id=eq."+encodeURIComponent(brandId)+"&select=product_id,week_ending,sales,is_actual&limit=100000",token)
      ]);
      const result=getLaunchPerformance(pm,tr,sales);
      return {...result,evidence:{source:"cpgist_products.launch_date + cpgist_trial_repeat + cpgist_product_weekly",grain:"SKU launch evidence with source/derived launch date",rowCount:result.products.length,periodStart:result.products[0]?.launchDate??null,periodEnd:result.products.flatMap((x:any)=>x.weekly.map((w:any)=>w.week)).at(-1)??null,periodCount:result.products.reduce((m:number,x:any)=>Math.max(m,x.weekly.length),0),filters:filtersFromArgs(a),generatedAt:new Date().toISOString()},warnings:result.available?[result.limitation]:["No product sales/trial evidence is available for launch analysis."]};
    }
    case "get_synthetic_panel": {
      const brand=await resolveBrandContext(String(a.brandId||""),token);
      const rows=await get("cpgist_panel_household?brand=eq."+encodeURIComponent(String(brand.brandName||""))+"&select=*&limit=100000",token);
      const result=getSyntheticPanel(rows);
      return {...result,evidence:{source:"cpgist_panel_household",grain:"synthetic household week",rowCount:rows.length,periodStart:rows[0]?.week??null,periodEnd:rows.at(-1)?.week??null,periodCount:new Set(rows.map((x:any)=>x.week)).size,filters:filtersFromArgs(a),generatedAt:new Date().toISOString()},warnings:[result.label]};
    }
    case "get_macro_overlay": {
      const brand=await resolveBrandContext(String(a.brandId||""),token);
      const brandRegions=brand.brandName ? await get("cpgist_retailers?select=region&id=in.("+encodeURIComponent((await getAll("cpgist_product_weekly?brand_id=eq."+encodeURIComponent(String(a.brandId||""))+"&select=retailer_id&limit=100000",token,1000,20000)).map((x:any)=>String(x.retailer_id)).filter(Boolean).join(","))+")&limit=5000",token).catch(()=>[]) : [];
      const regionSet=new Set((brandRegions as any[]).map(x=>String(x.region||"")).filter(Boolean));
      const raw=await get("cpgist_macro_signals?select=*&limit=100000",token);
      const rows=regionSet.size?raw.filter((x:any)=>regionSet.has(String(x.region||""))):raw;
      const result=getMacroOverlay(rows);
      return {...result,evidence:{source:"cpgist_macro_signals aligned to selected brand retailer regions",grain:"region week overlay",rowCount:rows.length,periodStart:rows.map((x:any)=>x.week).filter(Boolean).sort()[0]??null,periodEnd:rows.map((x:any)=>x.week).filter(Boolean).sort().at(-1)??null,periodCount:new Set(rows.map((x:any)=>x.week)).size,filters:{...filtersFromArgs(a),regions:[...regionSet]},generatedAt:new Date().toISOString()},warnings:[result.label,"Macro signals are aligned by region and week; they are contextual overlays, not causal drivers of brand sales."]};
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

function abTestingGuidance(question: string) {
  const q = question.toLowerCase();
  const metric = /margin|profit/.test(q) ? "gross margin" : /unit/.test(q) ? "units" : /conversion|response/.test(q) ? "conversion/response rate" : /sales|revenue/.test(q) ? "sales" : "the selected KPI";
  return {
    available: true,
    type: "experimentation_framework",
    metric,
    causalRule: "A/B results support causal interpretation only when treatment assignment is randomized or otherwise designed as a valid experiment.",
    cpgUseCases: ["price","promotion","pack/SKU","assortment","display","retailer/store cluster"],
    requiredFields: ["experiment_id","control/test assignment","start_date","end_date","primary KPI","control observations","test observations","unit of randomization"],
    analysis: ["absolute difference","relative lift","sample size","statistical uncertainty when variance/count data supports it"],
    guardrails: [
      "Historical control-vs-test differences are observational, not automatically causal.",
      "Do not claim a winner from lift alone when experiment quality or uncertainty is insufficient.",
      "Use store/customer-level or experiment-level observations for formal significance testing where appropriate."
    ],
    questionContext: question
  };
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
  const productIntent=/sku|product|assortment|portfolio|item|size|pack|butter|milk|cheese|yogurt/.test(q);
  if (productIntent) add("product_sku_performance");
  if (brandId && /competitor|competitive|competition|compare|versus|vs/.test(q) && (productIntent || /region|regional|retailer|same area|same market|sales/.test(q))) add("product_competitor_diagnostic");
  if (brandId && categoryId && /retailer|account|walmart|kroger|distribution|whitespace|store|customer/.test(q)) add("retailer_opportunity");
  if (/price|pricing|promotion|promo|discount|elasticity|roi/.test(q)) add("promotion_diagnostic");
  if (brandId && /promo roi|promotion roi|incremental|trade spend|promotion lift|which promotion/.test(q)) add("get_promo_lift");
  if (brandId && /sku growth|sku momentum|product growth|sku decline|product decline/.test(q)) add("get_sku_growth");
  if (brandId && /category context|brand vs category|category share/.test(q)) add("get_category_context");
  if (brandId && /channel|e-commerce|grocery|mass|club|drug|convenience|specialty/.test(q)) add("get_channel_breakdown");
  if (brandId && /margin|profit|gross profit|margin at risk|p&l/.test(q)) add("get_margin_pnl");
  if (brandId && /new product|launch|trial|repeat|new sku|pacesetter/.test(q)) add("get_launch_performance");
  if (brandId && /penetration|purchase frequency|household|shopper panel/.test(q)) add("get_synthetic_panel");
  if (/inflation|macro|price index|show .*against inflation/.test(q)) add("get_macro_overlay");
  if (/competitor|competitive|competition|market movement/.test(q)) add("competitive_signals");
  if (/forecast|outlook|next 8|next 12|projection/.test(q)) add("forecast_sales");
  if (/anomal|spike|drop|unusual|outlier/.test(q)) add("detect_anomalies");
  if (brandId && categoryId && /share|market share|category context/.test(q)) add("get_market_share");
  if (/scenario|what if|simulate/.test(q)) add("run_scenario");
  if (/a\/b|ab test|a-b test|experiment|control group|test group|variant|randomi[sz]ed|incrementality/.test(q)) add("ab_testing_guidance");

  const evidence: any[] = [];
  for (const name of selected.slice(0, 7)) {
    try {
      const args: Args = { ...scope };
      if (categoryId && ["category_growth_plan","retailer_opportunity","get_market_share","product_competitor_diagnostic"].includes(name)) args.categoryId = categoryId;
      if (name === "product_competitor_diagnostic") args.productQuery = question;
      if (name === "ab_testing_guidance") { evidence.push({ tool: name, result: abTestingGuidance(question) }); continue; }
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
    const routingQuestion = incoming
      .filter((m: any) => m?.role === "user")
      .slice(-4)
      .map((m: any) => String(m?.content || ""))
      .join("\n");
    const { evidence, context, selected } = await collectEvidence(routingQuestion || String(latestUser), brandId, token);

    const evidenceJson = JSON.stringify(evidence);
    const messages = [
      {
        role: "system",
        content: "You are CPGist AI Analyst, an evidence-first CPG business analyst. The database/analytical layer has already calculated the metrics. Your job is to interpret those results precisely and communicate them like a professional CPG business review. Do not calculate replacement numbers, invent missing data, or claim causality from descriptive evidence. Treat diagnostic labels as hypotheses, never as proof. Distinguish observed facts, diagnostic interpretations, hypotheses, and actions. Never report a metric if the supplied evidence has a validation error or scope mismatch. Never infer margin without cost/margin data, never quantify whitespace as incremental opportunity unless explicitly sized by the analytical layer, and never describe a period as 13 weeks unless evidence.periodCount is 13. If evidence is unavailable, say so explicitly, but first use every relevant populated evidence layer. A missing SKU-to-SKU competitor field does not mean all competitive evidence is unavailable: use validated brand/category/retailer/region peer benchmarks when present and label the comparison grain. For product questions, answer the product's own sales, growth, distribution, price, promotion, regional and retailer performance first, then add competitor context where supported. Use brandName and category names when available. Never turn a limitation into a fabricated estimate.\n\nCapability catalog:\n" + capabilityCatalog + "\n\nScope context:\n" + JSON.stringify(context) + activeScope + "\n\nControlled evidence from this request:\n" + evidenceJson + "\n\nReturn ONLY a JSON object with exactly these fields: type, headline, executiveTakeaway, metrics, table, sections, warnings, evidence, decisionTrail, nextBestQuestion. metrics is an array of {label,value,change?,tone?}; table is null or {columns,rows}; sections is an array of {title,bullets}; warnings is an array; evidence is {source,period,periodCount,filters}; decisionTrail is an array of {type,text} using observed|diagnostic|action|limitation. Keep the answer concise but specific. Every quantitative claim must be traceable to the supplied evidence. For recommendations, reference the signal that triggered the recommendation. Do not claim that price, promotion, distribution or retailer mix caused sales movement unless the evidence explicitly establishes it. If the user asks about an A/B test or experiment, use the experimentation evidence when present. You may explain test design, control/test comparisons, lift, uncertainty and CPG use cases. Never turn historical differences into causal claims. If actual experiment-level observations are not present, clearly say that CPGist can design or interpret the experiment framework but cannot manufacture experimental evidence. If the user asks a question outside the supplied data, answer the supported portion and state the missing domain.\nSelected deterministic tools: " + selected.join(", ")
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
    const parseAnalyst = (value:any) => {
      if (value && typeof value === "object") return value;
      const text = String(value || "").trim();
      if (!text) return null;
      try { return JSON.parse(text); } catch {}
      const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
      if (fenced) { try { return JSON.parse(fenced); } catch {} }
      const first = text.indexOf("{"), last = text.lastIndexOf("}");
      if (first >= 0 && last > first) { try { return JSON.parse(text.slice(first,last+1)); } catch {} }
      return null;
    };
    const monthlyEvidence = evidence.find(x => x.tool === "monthly_business_review")?.result?.evidence;
    const validationIssues = evidence.flatMap(x => Array.isArray(x.result?.validation) ? x.result.validation : []);
    const analyst = parseAnalyst(raw) || {
      type: "BUSINESS REVIEW",
      headline: context.brandName ? context.brandName + " business review" : "CPG business review",
      executiveTakeaway: "The deterministic analytical layer returned the source evidence, but the language model did not return a readable structured narrative. The figures below remain source-anchored.",
      metrics: [],
      table: null,
      sections: [{title:"What the data supports",bullets:["Use the evidence and warnings below; no unsupported conclusion has been added."]}],
      warnings: ["The narrative model response could not be parsed; deterministic source evidence is still available."],
      evidence: {},
      decisionTrail: [{type:"limitation",text:"Structured narrative generation failed; no unsupported analytical conclusion was substituted."}],
      nextBestQuestion: "Which business driver should I investigate next?"
    };
    analyst.type = String(analyst.type || "BUSINESS REVIEW");
    analyst.headline = String(analyst.headline || (context.brandName ? context.brandName + " business review" : "CPG business review"));
    analyst.executiveTakeaway = String(analyst.executiveTakeaway || "The source evidence is available below.");
    analyst.metrics = Array.isArray(analyst.metrics) ? analyst.metrics : [];
    analyst.sections = Array.isArray(analyst.sections) ? analyst.sections : [];
    analyst.warnings = Array.isArray(analyst.warnings) ? analyst.warnings : [];
    analyst.decisionTrail = Array.isArray(analyst.decisionTrail) ? analyst.decisionTrail : [];
    analyst.table = analyst.table && typeof analyst.table === "object" ? analyst.table : null;
    analyst.nextBestQuestion = analyst.nextBestQuestion ? String(analyst.nextBestQuestion) : null;
    analyst.evidence = {
      source: monthlyEvidence?.source ?? analyst.evidence?.source ?? "CPGist analytical layer",
      period: monthlyEvidence?.periodStart && monthlyEvidence?.periodEnd
        ? String(monthlyEvidence.periodStart) + " → " + String(monthlyEvidence.periodEnd)
        : analyst.evidence?.period ?? "Observed source coverage",
      periodCount: Number(monthlyEvidence?.periodCount ?? analyst.evidence?.periodCount ?? 0),
      filters: JSON.stringify(monthlyEvidence?.filters ?? {})
    };
    analyst.warnings = [...new Set([
      ...analyst.warnings,
      ...evidence.flatMap(x => Array.isArray(x.result?.warnings) ? x.result.warnings : []),
      ...validationIssues.filter((x:any) => x.severity === "warning").map((x:any) => x.message)
    ])];
    const hardValidationErrors = validationIssues.filter((x:any) => x.severity === "error");
    if (hardValidationErrors.length) {
      analyst.warnings = [...new Set([...analyst.warnings, ...hardValidationErrors.map((x:any) => x.message)])];
      analyst.decisionTrail = analyst.decisionTrail.filter((x:any) => x.type !== "action");
    }

    return NextResponse.json({
      analyst,
      verification: { performed: false, toolCount: evidence.length, mode: "deterministic-evidence + resilient-structured-model-call" }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "AI Analyst request failed." }, { status: 500 });
  }
}
