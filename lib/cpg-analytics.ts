export type CPGQuery = {
  brandId?: string;
  categoryId?: string;
  retailerId?: string;
  startDate?: string;
  endDate?: string;
};

const nullableString = (description: string) => ({ type: ["string", "null"], description });
const params = {
  type: "object",
  properties: {
    brandId: nullableString("Brand identifier for the requested slice. Omit or use null when not filtering by brand."),
    categoryId: nullableString("Category identifier/name for the requested slice. Omit or use null when not filtering by category."),
    retailerId: nullableString("Retailer identifier for retailer-level analysis. Omit or use null when not filtering by retailer."),
    startDate: nullableString("Inclusive ISO date. Omit or use null when not filtering by start date."),
    endDate: nullableString("Inclusive ISO date. Omit or use null when not filtering by end date."),
  },
  additionalProperties: false,
} as const;

export const CPG_TOOLS = [
  {
    name: "category_growth_plan",
    description: "Diagnose category and brand momentum over recent 13-week versus prior 13-week periods, including distribution signals and explicit action signals. Use first for category growth, turnaround and improvement questions.",
    parameters: params,
  },
  {
    name: "monthly_business_review",
    description: "Build an automatic monthly CPG business review using the latest 13 weeks: executive summary, category/brand momentum, price/promotion, distribution, retailer/SKU opportunities, risks and next questions.",
    parameters: params,
  },
  {
    name: "product_sku_performance",
    description: "Analyze product/SKU productivity using the populated CPGist product summary. Use for SKU, assortment, pack, size and product-mix questions.",
    parameters: params,
  },
  {
    name: "competitive_signals",
    description: "Analyze populated competitive signals for the selected scope. Treat signals as observed context, not causal proof.",
    parameters: params,
  },
  {
    name: "promotion_diagnostic",
    description: "Run dedicated Price & Promotion Analytics: 13W vs prior-13W sales, units, realized price and promo rate; weekly commercial-lever trends; and descriptive high-promo versus low-promo diagnostics. Never treat these comparisons as causal promotion effectiveness.",
    parameters: params,
  },

  {
    name: "get_promo_lift",
    description: "Calculate promotion-event incremental sales/units, incremental margin and ROI by joining promotion events, baseline sales, SKU weekly sales with gross margin and trade spend. Actual and projected events remain labeled by is_actual.",
    parameters: params,
  },
  {
    name: "get_sku_growth",
    description: "Calculate SKU period-over-period growth using only same-status actual-vs-actual or synthetic-vs-synthetic weeks. Never compare an actual week with a synthetic week.",
    parameters: params,
  },
  {
    name: "get_category_context",
    description: "Calculate observed category sales/growth, brand share and brand growth versus category growth from category_aggregates. Label the result as observed category, not total market.",
    parameters: params,
  },
  {
    name: "get_channel_breakdown",
    description: "Roll brand-retailer performance up by retailer channel using the retailer master channel field.",
    parameters: params,
  },
  {
    name: "get_margin_pnl",
    description: "Calculate gross-margin dollars and margin percentage by SKU and retailer, including a margin-at-risk view for high-sales, thin-margin items.",
    parameters: params,
  },
  {
    name: "get_launch_performance",
    description: "Analyze launched products using launch_date and trial_repeat: trial rate, repeat rate and cumulative sales since launch.",
    parameters: params,
  },
  {
    name: "get_synthetic_panel",
    description: "Calculate household penetration and purchase frequency from the synthetic household layer. Every result must be labeled 'Synthetic panel (illustrative only, not real household data)'.",
    parameters: params,
  },
  {
    name: "get_macro_overlay",
    description: "Return the illustrative synthetic macro series for overlays such as 'show sales against inflation'. Label it as not tied to real economic data.",
    parameters: params,
  },
  {
    name: "data_readiness",
    description: "Check which CPG data domains are currently populated before answering a question. Use this when the requested analysis may depend on pricing, promotion, retailer opportunity, product/SKU, inventory, profitability, geography, competition, or shopper data.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },

  {
    name: "business_health_scan",
    description: "Run a compact evidence-first health scan for vague executive questions such as 'how are we doing', 'what changed', 'what is wrong', or 'give me a business pulse'. It combines recent sales, units, realized price, distribution and anomaly signals without making causal claims.",
    parameters: { ...params, additionalProperties: false },
  },

  {
    name: "cross_category_portfolio",
    description: "Analyze whether the same exact brand spans multiple categories, and separately identify parent companies with brands across multiple categories. Use this FIRST for questions about brands common across categories, cross-category brand performance, or multi-category portfolios.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
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
    name: "week_over_week_brands",
    description: "Compare every brand's latest observed week with the immediately prior observed week. Use this for questions such as which brands improved, declined, gained sales, lost sales, or changed versus last week. Returns every brand in the selected scope, not just the top 10.",
    parameters: params,
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
