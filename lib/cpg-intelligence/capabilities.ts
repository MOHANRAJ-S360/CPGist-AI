export type AnalystCapability = {
  id: string;
  label: string;
  questionPatterns: string[];
  tools: string[];
  dataRequirements: string[];
  status: "available" | "partial" | "planned";
};

export const ANALYST_CAPABILITIES: AnalystCapability[] = [
  {
    id: "executive_performance",
    label: "Executive performance",
    questionPatterns: ["how are we doing", "what happened", "performance", "overview", "executive summary", "business review"],
    tools: ["get_sales", "get_market_share", "get_distribution", "get_price", "analyze_drivers"],
    dataRequirements: ["weekly sales", "brand/category hierarchy"],
    status: "available",
  },
  {
    id: "growth",
    label: "Growth and turnaround",
    questionPatterns: ["grow", "growth", "turnaround", "improve", "recover", "accelerate", "declining"],
    tools: ["category_growth_plan", "get_sales", "get_market_share", "get_distribution", "analyze_drivers"],
    dataRequirements: ["weekly sales", "brand/category hierarchy"],
    status: "available",
  },
  {
    id: "share",
    label: "Market share",
    questionPatterns: ["share", "gain share", "lose share", "share movement", "competitive position"],
    tools: ["get_market_share", "analyze_drivers"],
    dataRequirements: ["brand sales", "category sales"],
    status: "available",
  },
  {
    id: "distribution",
    label: "Distribution and whitespace",
    questionPatterns: ["distribution", "acv", "coverage", "white space", "whitespace", "where are we missing", "retailer gap"],
    tools: ["get_distribution", "retailer_opportunity"],
    dataRequirements: ["ACV distribution", "brand-retailer aggregate"],
    status: "available",
  },
  {
    id: "retailer",
    label: "Retailer and account performance",
    questionPatterns: ["retailer", "banner", "account", "customer", "chain", "where are we winning"],
    tools: ["get_sales", "get_distribution", "retailer_opportunity", "analyze_drivers"],
    dataRequirements: ["retailer sales", "retailer hierarchy", "brand-retailer aggregate for whitespace"],
    status: "available",
  },
  {
    id: "pricing",
    label: "Pricing",
    questionPatterns: ["price", "pricing", "average price", "premium", "discount", "price increase", "price cut"],
    tools: ["get_price", "run_scenario", "get_sales"],
    dataRequirements: ["sales", "units", "price"],
    status: "available",
  },
  {
    id: "promotion",
    label: "Promotion",
    questionPatterns: ["promotion", "promo", "discount", "deal", "trade spend", "promotional"],
    tools: ["promotion_diagnostic", "get_sales", "get_price"],
    dataRequirements: ["promo observations", "sales", "units", "price"],
    status: "available",
  },
  {
    id: "forecast",
    label: "Forecasting",
    questionPatterns: ["forecast", "next weeks", "next month", "outlook", "project", "predict"],
    tools: ["forecast_sales", "detect_anomalies"],
    dataRequirements: ["continuous weekly history"],
    status: "available",
  },
  {
    id: "scenario",
    label: "What-if scenarios",
    questionPatterns: ["what if", "scenario", "impact of", "increase price", "decrease price", "distribution points"],
    tools: ["run_scenario"],
    dataRequirements: ["baseline sales"],
    status: "partial",
  },
  {
    id: "anomaly",
    label: "Anomaly and risk monitoring",
    questionPatterns: ["anomaly", "unusual", "spike", "drop", "sudden", "risk", "alert"],
    tools: ["detect_anomalies", "get_sales"],
    dataRequirements: ["weekly sales history"],
    status: "available",
  },
  {
    id: "category",
    label: "Category management",
    questionPatterns: ["category", "category growth", "category leader", "category strategy", "category opportunity"],
    tools: ["category_growth_plan", "analyze_drivers", "get_market_share"],
    dataRequirements: ["brand/category hierarchy", "weekly sales"],
    status: "available",
  },
  {
    id: "portfolio",
    label: "Portfolio and cross-category",
    questionPatterns: ["portfolio", "across categories", "multiple categories", "common brand", "same brand", "parent company"],
    tools: ["cross_category_portfolio"],
    dataRequirements: ["brand master", "parent company", "brand/category mapping", "sales"],
    status: "available",
  },
  {
    id: "product",
    label: "Product and SKU analytics",
    questionPatterns: ["sku", "product", "pack", "size", "item", "assortment", "product mix"],
    tools: ["product_sku_performance"],
    dataRequirements: ["product master", "13-week product summary"],
    status: "available",
  },
  {
    id: "geography",
    label: "Region and geography",
    questionPatterns: ["region", "state", "city", "geography", "territory", "market"],
    tools: [],
    dataRequirements: ["region-level sales and distribution"],
    status: "planned",
  },
  {
    id: "competition",
    label: "Competitive intelligence",
    questionPatterns: ["competitor", "competitive", "rival", "competitors", "competitive signal"],
    tools: ["competitive_signals"],
    dataRequirements: ["competitive signal feed"],
    status: "available",
  },
  {
    id: "inventory",
    label: "Inventory and availability",
    questionPatterns: ["inventory", "stock", "out of stock", "oos", "availability", "stockout"],
    tools: [],
    dataRequirements: ["inventory or availability feed"],
    status: "planned",
  },
  {
    id: "profitability",
    label: "Profitability and margin",
    questionPatterns: ["margin", "profit", "gross profit", "contribution", "roi", "return"],
    tools: ["promotion_diagnostic"],
    dataRequirements: ["sales", "baseline sales", "gross margin", "trade spend"],
    status: "partial",
  },
  {
    id: "consumer",
    label: "Shopper and consumer insights",
    questionPatterns: ["shopper", "consumer", "household", "penetration", "repeat", "loyalty", "basket"],
    tools: [],
    dataRequirements: ["panel, loyalty, or transaction-level shopper data"],
    status: "planned",
  },
];

export function capabilityContext(): string {
  return ANALYST_CAPABILITIES.map(c => {
    const tools = c.tools.length ? c.tools.join(", ") : "none yet";
    return `- ${c.label} [${c.status}]: ${c.questionPatterns.join(", ")} | tools: ${tools} | data: ${c.dataRequirements.join("; ")}`;
  }).join("\n");
}
