import type { AnalyticalResult, Evidence, IntelligenceQuery, IntelligenceRow, SalesPoint } from "./types";

const n = (value: unknown) => {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
};

const sortedPeriods = (rows: IntelligenceRow[]) =>
  [...new Set(rows.map(r => r.week_ending).filter(Boolean))].sort();

function evidence(rows: IntelligenceRow[], filters: IntelligenceQuery, source = "syndicate_weekly") : Evidence {
  const periods = sortedPeriods(rows);
  return {
    source,
    grain: "brand/category/retailer week",
    rowCount: rows.length,
    periodStart: periods[0] ?? null,
    periodEnd: periods.at(-1) ?? null,
    periodCount: periods.length,
    filters,
    generatedAt: new Date().toISOString(),
  };
}

function base<T>(data: T, rows: IntelligenceRow[], filters: IntelligenceQuery, warnings: string[] = []): AnalyticalResult<T> {
  return { data, evidence: evidence(rows, filters), warnings };
}

export function getSales(rows: IntelligenceRow[], filters: IntelligenceQuery): AnalyticalResult<{ periods: SalesPoint[]; totalSales: number; totalUnits: number }> {
  const map = new Map<string, SalesPoint>();
  for (const r of rows) {
    const point = map.get(r.week_ending) ?? { period: r.week_ending, sales: 0, units: 0 };
    point.sales += n(r.dollar_sales);
    point.units += n(r.units);
    map.set(r.week_ending, point);
  }
  const periods = [...map.values()].sort((a,b) => a.period.localeCompare(b.period));
  return base(
    { periods, totalSales: periods.reduce((s,p) => s+p.sales, 0), totalUnits: periods.reduce((s,p) => s+p.units, 0) },
    rows,
    filters
  );
}

export function getDistribution(rows: IntelligenceRow[], filters: IntelligenceQuery): AnalyticalResult<{ averageDistribution: number | null; weightedDistribution: number | null; observations: number }> {
  let weighted = 0;
  let weight = 0;
  for (const r of rows) {
    const d = n(r.acv_distribution);
    const w = Math.max(n(r.dollar_sales), 0);
    weighted += d * (w || 1);
    weight += w || 1;
  }
  const avg = rows.length ? rows.reduce((s,r) => s+n(r.acv_distribution), 0) / rows.length : null;
  return base(
    { averageDistribution: avg, weightedDistribution: weight ? weighted / weight : null, observations: rows.length },
    rows,
    filters
  );
}

export function getPrice(rows: IntelligenceRow[], filters: IntelligenceQuery): AnalyticalResult<{ averagePrice: number | null; totalSales: number; totalUnits: number }> {
  const totalSales = rows.reduce((s,r) => s+n(r.dollar_sales), 0);
  const totalUnits = rows.reduce((s,r) => s+n(r.units), 0);
  return base({ averagePrice: totalUnits ? totalSales/totalUnits : null, totalSales, totalUnits }, rows, filters);
}

export function getMarketShare(
  brandRows: IntelligenceRow[],
  categoryRows: IntelligenceRow[],
  filters: IntelligenceQuery
): AnalyticalResult<{ marketShare: number | null; brandSales: number; categorySales: number }> {
  const brandSales = brandRows.reduce((s,r) => s+n(r.dollar_sales), 0);
  const categorySales = categoryRows.reduce((s,r) => s+n(r.dollar_sales), 0);
  const warnings = categorySales === 0 ? ["No category sales were available for the requested slice."] : [];
  return base(
    { marketShare: categorySales ? brandSales/categorySales : null, brandSales, categorySales },
    brandRows,
    filters,
    warnings
  );
}

export function analyzeDrivers(rows: IntelligenceRow[], filters: IntelligenceQuery): AnalyticalResult<{
  byBrand: Array<{ brandId: string; sales: number; shareOfSlice: number }>;
  byCategory: Array<{ category: string; sales: number; shareOfSlice: number }>;
  byRetailer: Array<{ retailerId: string; sales: number; shareOfSlice: number }>;
}> {
  const total = rows.reduce((s,r)=>s+n(r.dollar_sales),0);
  const aggregate = (key: (r:IntelligenceRow)=>string) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = key(r);
      if (!k || k === "undefined") continue;
      m.set(k, (m.get(k) ?? 0) + n(r.dollar_sales));
    }
    return [...m.entries()].map(([id,sales])=>({id,sales,shareOfSlice: total ? sales/total : 0}))
      .sort((a,b)=>b.sales-a.sales);
  };
  return base({
    byBrand: aggregate(r=>String(r.brand_id)).map(x=>({brandId:x.id,sales:x.sales,shareOfSlice:x.shareOfSlice})),
    byCategory: aggregate(r=>String(r.category)).map(x=>({category:x.id,sales:x.sales,shareOfSlice:x.shareOfSlice})),
    byRetailer: aggregate(r=>String(r.retailer_id)).map(x=>({retailerId:x.id,sales:x.sales,shareOfSlice:x.shareOfSlice}))
  }, rows, filters);
}


export function categoryGrowthPlan(rows: IntelligenceRow[], filters: IntelligenceQuery): AnalyticalResult<{
  categorySales: number;
  brands: Array<{
    brandId: string; sales: number; share: number; recentSales: number; priorSales: number;
    growthPct: number | null; recentDistribution: number | null; priorDistribution: number | null;
    distributionChangePts: number | null; recentDiscountDepthPct: number | null;
    priorDiscountDepthPct: number | null; discountChangePts: number | null;
    actionSignal: "accelerate_distribution" | "investigate_productivity" | "recover_distribution" | "stabilize" | "defend_scale";
  }>;
  diagnostics: Array<{brandId: string; signal: string; evidence: string}>;
}> {
  const periods = sortedPeriods(rows);
  const recentSet = new Set(periods.slice(-13));
  const priorSet = new Set(periods.slice(-26, -13));
  const byBrand = new Map<string, IntelligenceRow[]>();
  for (const r of rows) {
    const id = String(r.brand_id ?? "");
    if (!id) continue;
    const list = byBrand.get(id) ?? [];
    list.push(r);
    byBrand.set(id, list);
  }
  const categorySales = rows.reduce((s,r)=>s+n(r.dollar_sales),0);
  const brands = [...byBrand.entries()].map(([brandId, rs]) => {
    const totalSales = rs.reduce((s,r)=>s+n(r.dollar_sales),0);
    const recentRows = rs.filter(r=>recentSet.has(r.week_ending));
    const priorRows = rs.filter(r=>priorSet.has(r.week_ending));
    const recentSales = recentRows.reduce((s,r)=>s+n(r.dollar_sales),0);
    const priorSales = priorRows.reduce((s,r)=>s+n(r.dollar_sales),0);
    const avg = (xs:IntelligenceRow[], key:"acv_distribution"|"avg_discount_depth_pct") =>
      xs.length ? xs.reduce((s,r)=>s+n(r[key]),0)/xs.length : null;
    const rd=avg(recentRows,"acv_distribution"), pd=avg(priorRows,"acv_distribution");
    const rdisc=avg(recentRows,"avg_discount_depth_pct"), pdisc=avg(priorRows,"avg_discount_depth_pct");
    const growthPct = priorSales ? (recentSales/priorSales-1)*100 : null;
    const distributionChangePts = rd !== null && pd !== null ? rd-pd : null;
    const discountChangePts = rdisc !== null && pdisc !== null ? rdisc-pdisc : null;
    let actionSignal: "accelerate_distribution"|"investigate_productivity"|"recover_distribution"|"stabilize"|"defend_scale";
    if (growthPct !== null && growthPct > 2 && distributionChangePts !== null && distributionChangePts < 0.25) actionSignal="accelerate_distribution";
    else if (growthPct !== null && growthPct < -1 && distributionChangePts !== null && distributionChangePts >= 0) actionSignal="investigate_productivity";
    else if (growthPct !== null && growthPct < 0 && distributionChangePts !== null && distributionChangePts < 0) actionSignal="recover_distribution";
    else if (growthPct !== null && growthPct <= 0) actionSignal="stabilize";
    else if (categorySales && totalSales/categorySales >= 0.15) actionSignal="defend_scale";
    else actionSignal="stabilize";
    return {brandId,sales:totalSales,share:categorySales?totalSales/categorySales:0,recentSales,priorSales,growthPct,recentDistribution:rd,priorDistribution:pd,distributionChangePts,recentDiscountDepthPct:rdisc,priorDiscountDepthPct:pdisc,discountChangePts,actionSignal};
  }).sort((a,b)=>b.sales-a.sales);
  const diagnostics = brands.flatMap(b => {
    const out:Array<{brandId:string;signal:string;evidence:string}>=[];
    if (b.actionSignal==="accelerate_distribution") out.push({brandId:b.brandId,signal:"growth_with_limited_distribution_change",evidence:"Recent sales growth "+b.growthPct?.toFixed(1)+"% with distribution change "+b.distributionChangePts?.toFixed(2)+" pts."});
    if (b.actionSignal==="investigate_productivity") out.push({brandId:b.brandId,signal:"distribution_not_converting",evidence:"Recent sales growth "+b.growthPct?.toFixed(1)+"% despite distribution change "+b.distributionChangePts?.toFixed(2)+" pts."});
    if (b.actionSignal==="recover_distribution") out.push({brandId:b.brandId,signal:"sales_and_distribution_declining",evidence:"Recent sales growth "+b.growthPct?.toFixed(1)+"% and distribution change "+b.distributionChangePts?.toFixed(2)+" pts."});
    return out;
  });
  const warnings:string[]=[];
  if (periods.length < 26) warnings.push("Fewer than 26 observed weeks are available; the 13-week comparison is incomplete.");
  return base({categorySales,brands,diagnostics},rows,filters,warnings);
}


export type RetailerOpportunityRow = {
  brand_id: string | number;
  retailer_id: string | number;
  category: string;
  sales: number | string;
  units: number | string;
  distribution?: number | string | null;
  discount_depth_pct?: number | string | null;
  observations?: number | string | null;
};

export function retailerOpportunity(
  rows: RetailerOpportunityRow[],
  brandId: string,
  category: string
): AnalyticalResult<{
  category: string;
  brandId: string;
  categoryBrandSharePct: number;
  retailers: Array<{
    retailerId: string;
    brandSales: number;
    categorySales: number;
    brandSharePct: number;
    whitespacePts: number;
    distribution: number | null;
    actionSignal: "whitespace" | "defend" | "limited_signal";
  }>;
}> {
  const scoped = rows.filter(r => String(r.category).toLowerCase() === category.toLowerCase());
  const byRetailer = new Map<string, { brandSales: number; categorySales: number; distributionWeighted: number; distributionWeight: number }>();
  let totalBrandSales = 0;
  let totalCategorySales = 0;

  for (const r of scoped) {
    const retailerId = String(r.retailer_id);
    const sales = n(r.sales);
    const current = byRetailer.get(retailerId) ?? { brandSales: 0, categorySales: 0, distributionWeighted: 0, distributionWeight: 0 };
    current.categorySales += sales;
    if (String(r.brand_id) === String(brandId)) {
      current.brandSales += sales;
      const d = n(r.distribution);
      current.distributionWeighted += d * Math.max(sales, 1);
      current.distributionWeight += Math.max(sales, 1);
      totalBrandSales += sales;
    }
    byRetailer.set(retailerId, current);
    totalCategorySales += sales;
  }

  const categoryBrandShare = totalCategorySales ? totalBrandSales / totalCategorySales : 0;
  const retailers = [...byRetailer.entries()]
    .map(([retailerId, x]) => {
      const share = x.categorySales ? x.brandSales / x.categorySales : 0;
      const whitespacePts = (categoryBrandShare - share) * 100;
      const actionSignal: "whitespace" | "defend" | "limited_signal" = whitespacePts >= 2 ? "whitespace" : whitespacePts <= -2 ? "defend" : "limited_signal";
      return {
        retailerId,
        brandSales: x.brandSales,
        categorySales: x.categorySales,
        brandSharePct: share * 100,
        whitespacePts,
        distribution: x.distributionWeight ? x.distributionWeighted / x.distributionWeight : null,
        actionSignal
      };
    })
    .sort((a,b) => b.whitespacePts - a.whitespacePts);

  const warnings: string[] = [];
  if (!scoped.length) warnings.push("No retailer opportunity rows are loaded for the requested category. Re-import the Syndicate ZIP after enabling retailer opportunity aggregation.");
  return {
    data: { category, brandId, categoryBrandSharePct: categoryBrandShare * 100, retailers },
    evidence: {
      source: "syndicate_brand_retailer",
      grain: "brand/retailer/category all-time aggregate",
      rowCount: scoped.length,
      periodStart: null,
      periodEnd: null,
      periodCount: 0,
      filters: { brandId, categoryId: category },
      generatedAt: new Date().toISOString()
    },
    warnings
  };
}

export function detectAnomalies(rows: IntelligenceRow[], filters: IntelligenceQuery): AnalyticalResult<{
  anomalies: Array<{ period: string; sales: number; zScore: number }>;
  baselineMean: number;
  baselineStdDev: number;
}> {
  const sales = getSales(rows, filters).data.periods;
  if (sales.length < 4) {
    return base({ anomalies: [], baselineMean: 0, baselineStdDev: 0 }, rows, filters, ["At least four periods are recommended for anomaly detection."]);
  }
  const mean = sales.reduce((s,p)=>s+p.sales,0)/sales.length;
  const sd = Math.sqrt(sales.reduce((s,p)=>s+(p.sales-mean)**2,0)/sales.length);
  const anomalies = sd ? sales.filter(p=>Math.abs((p.sales-mean)/sd)>=2).map(p=>({period:p.period,sales:p.sales,zScore:(p.sales-mean)/sd})) : [];
  return base({ anomalies, baselineMean: mean, baselineStdDev: sd }, rows, filters);
}

export function forecastSales(rows: IntelligenceRow[], filters: IntelligenceQuery, horizon = 4): AnalyticalResult<{
  method: "linear_trend";
  forecast: Array<{ periodOffset: number; sales: number }>;
  slope: number;
}> {
  const points = getSales(rows, filters).data.periods;
  const h = Math.max(1, Math.min(26, Math.floor(Number(horizon)||4)));
  if (points.length < 2) {
    return base({ method:"linear_trend", forecast:[], slope:0 }, rows, filters, ["At least two periods are required for a trend forecast."]);
  }
  const nPoints = points.length;
  const ym = points.reduce((s,p)=>s+p.sales,0)/nPoints;
  const xm = (nPoints-1)/2;
  let num=0, den=0;
  points.forEach((p,x)=>{ num += (x-xm)*(p.sales-ym); den += (x-xm)**2; });
  const slope = den ? num/den : 0;
  const intercept = ym - slope*xm;
  const forecast = Array.from({length:h},(_,i)=>({periodOffset:i+1,sales:Math.max(0,intercept+slope*(nPoints+i))}));
  return base({method:"linear_trend",forecast,slope}, rows, filters, ["This is a baseline trend forecast; it does not model promotion, seasonality, price elasticity, or external drivers."]);
}

export function runScenario(
  rows: IntelligenceRow[],
  filters: IntelligenceQuery,
  priceChangePct = 0,
  distributionChangePts = 0
): AnalyticalResult<{
  baselineSales: number;
  scenarioSales: number;
  incrementalSales: number;
  assumptions: { priceElasticity: number; distributionSalesLiftPerPoint: number };
}> {
  const baselineSales = rows.reduce((s,r)=>s+n(r.dollar_sales),0);
  const pc = Number(priceChangePct)/100;
  const dp = Number(distributionChangePts);
  const priceElasticity = -1;
  const distributionSalesLiftPerPoint = 0.01;
  // Revenue = price × volume. Elasticity determines the volume response to price;
  // the price change itself must also be applied to revenue.
  const priceFactor = 1 + pc;
  const volumeFactor = 1 + priceElasticity * pc;
  const distributionFactor = 1 + distributionSalesLiftPerPoint * dp;
  const scenarioSales = Math.max(0, baselineSales * priceFactor * volumeFactor * distributionFactor);
  return base({
    baselineSales,
    scenarioSales,
    incrementalSales: scenarioSales-baselineSales,
    assumptions:{priceElasticity,distributionSalesLiftPerPoint}
  }, rows, filters, [
    "Scenario elasticity is a transparent baseline assumption, not a model-estimated causal elasticity.",
    "Distribution lift is a simplified planning assumption and should be replaced by learned elasticity when sufficient data is available."
  ]);
}
