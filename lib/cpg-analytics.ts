export type CPGQuery = {
  brandId?: string;
  categoryId?: string;
  retailerId?: string;
  startDate?: string;
  endDate?: string;
};

const params = {
  type: "object",
  properties: {
    brandId: { type: "string", description: "Brand identifier for the requested slice." },
    categoryId: { type: "string", description: "Category identifier/name for the requested slice." },
    retailerId: { type: "string", description: "Retailer identifier for retailer-level analysis." },
    startDate: { type: "string", description: "Inclusive ISO date." },
    endDate: { type: "string", description: "Inclusive ISO date." },
  },
  additionalProperties: false,
} as const;

export const CPG_TOOLS = [
  {
    name: "retailer_opportunity",
    description: "Identify retailer-level whitespace for a specific brand within a category by comparing the brand's observed share at each retailer with its overall category share. This is a descriptive opportunity diagnostic, not a causal forecast.",
    parameters: {
      type: "object",
      properties: {
        brandId: { type: "string", description: "Required brand identifier." },
        categoryId: { type: "string", description: "Required category name." },
      },
      required: ["brandId", "categoryId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_sales",
    description: "Retrieve weekly dollar sales and units for a CPG slice. Returns the time series, totals, evidence source, date range and warnings.",
    parameters: params,
  },
  {
    name: "get_distribution",
    description: "Retrieve average and sales-weighted ACV distribution for a CPG slice, with evidence.",
    parameters: params,
  },
  {
    name: "get_price",
    description: "Calculate realized average price as dollar sales divided by units for the requested slice.",
    parameters: params,
  },
  {
    name: "get_market_share",
    description: "Calculate brand dollar share of category sales. Requires brandId and should normally include categoryId for a precise category definition.",
    parameters: params,
  },
  {
    name: "analyze_drivers",
    description: "Break the observed sales slice down by brand, category and retailer to identify where sales concentration comes from. This is descriptive contribution analysis, not causal attribution.",
    parameters: params,
  },
  {
    name: "detect_anomalies",
    description: "Detect unusual weekly sales periods using a z-score against the observed weekly sales series. Returns baseline statistics and evidence.",
    parameters: params,
  },
  {
    name: "forecast_sales",
    description: "Produce a baseline weekly sales trend forecast for 1-26 future periods. This is not a causal or seasonality-aware forecast.",
    parameters: {
      type: "object",
      properties: { ...params.properties, horizon: { type: "number", description: "Future periods, 1-26." } },
      additionalProperties: false,
    },
  },
  {
    name: "run_scenario",
    description: "Estimate sales impact from price and distribution changes using transparent planning assumptions. The result explicitly reports assumptions and warnings; it is not a learned causal model.",
    parameters: {
      type: "object",
      properties: {
        ...params.properties,
        priceChangePct: { type: "number", description: "Price change percentage, e.g. 5 for +5%." },
        distributionChangePts: { type: "number", description: "Distribution change in percentage points." },
      },
      additionalProperties: false,
    },
  },
] as const;

export function buildSalesQuery(q: CPGQuery) {
  const filters: string[] = [];
  if (q.brandId) filters.push("brand_id = $brandId");
  if (q.categoryId) filters.push("category_id = $categoryId");
  if (q.retailerId) filters.push("retailer_id = $retailerId");
  if (q.startDate) filters.push("period >= $startDate");
  if (q.endDate) filters.push("period <= $endDate");

  return (
    "select period, sum(sales_value) as sales, sum(units) as units from public.sales_facts" +
    (filters.length ? " where " + filters.join(" and ") : "") +
    " group by period order by period"
  );
}
