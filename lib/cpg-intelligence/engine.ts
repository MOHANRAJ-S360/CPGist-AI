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
  const priceVolumeFactor = 1 + priceElasticity * pc;
  const distributionFactor = 1 + distributionSalesLiftPerPoint * dp;
  const scenarioSales = Math.max(0, baselineSales * priceVolumeFactor * distributionFactor);
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
