export type CPGQuery={brandId?:string;categoryId?:string;retailerId?:string;startDate?:string;endDate?:string};
const params={type:"object",properties:{brandId:{type:"string"},categoryId:{type:"string"},retailerId:{type:"string"},startDate:{type:"string"},endDate:{type:"string"}},additionalProperties:false} as const;
export const CPG_TOOLS=[
{name:"get_sales",description:"Retrieve sales and units for a CPG slice.",parameters:params},
{name:"get_distribution",description:"Retrieve weighted distribution for a CPG slice.",parameters:params},
{name:"get_price",description:"Retrieve average unit price for a CPG slice.",parameters:params},
{name:"get_market_share",description:"Calculate brand share of category sales.",parameters:params},
{name:"analyze_drivers",description:"Identify sales growth drivers by brand, category, retailer and period.",parameters:params},
{name:"detect_anomalies",description:"Detect unusual sales periods using a z-score against the observed sales series.",parameters:params},
{name:"forecast_sales",description:"Forecast the next periods using a linear trend over observed aggregated sales.",parameters:{type:"object",properties:{...params.properties,horizon:{type:"number"}},additionalProperties:false}},
{name:"run_scenario",description:"Estimate revenue impact of a price or distribution scenario from observed sales and units.",parameters:{type:"object",properties:{...params.properties,priceChangePct:{type:"number"},distributionChangePts:{type:"number"}},additionalProperties:false}}
] as const;
export function buildSalesQuery(q:CPGQuery){const f:string[]=[];if(q.brandId)f.push("brand_id = $brandId");if(q.categoryId)f.push("category_id = $categoryId");if(q.retailerId)f.push("retailer_id = $retailerId");if(q.startDate)f.push("period >= $startDate");if(q.endDate)f.push("period <= $endDate");return "select period, sum(sales_value) as sales, sum(units) as units from public.sales_facts"+(f.length?" where "+f.join(" and "):"")+" group by period order by period";}
