export type CPGQuery={brandId?:string;categoryId?:string;retailerId?:string;startDate?:string;endDate?:string};
export const CPG_TOOLS=[
{name:"get_sales",description:"Retrieve sales and units for a CPG slice.",parameters:{type:"object",properties:{brandId:{type:"string"},categoryId:{type:"string"},retailerId:{type:"string"},startDate:{type:"string"},endDate:{type:"string"}},additionalProperties:false}},
{name:"get_distribution",description:"Retrieve weighted distribution for a CPG slice.",parameters:{type:"object",properties:{brandId:{type:"string"},retailerId:{type:"string"},startDate:{type:"string"},endDate:{type:"string"}},additionalProperties:false}},
{name:"get_price",description:"Retrieve average unit price for a CPG slice.",parameters:{type:"object",properties:{brandId:{type:"string"},startDate:{type:"string"},endDate:{type:"string"}},additionalProperties:false}},
{name:"get_market_share",description:"Calculate brand share of category sales.",parameters:{type:"object",properties:{brandId:{type:"string"},categoryId:{type:"string"},startDate:{type:"string"},endDate:{type:"string"}},additionalProperties:false}}
] as const;

export function buildSalesQuery(q:CPGQuery){
 const filters:string[]=[];
 if(q.brandId) filters.push("brand_id = $brandId");
 if(q.categoryId) filters.push("category_id = $categoryId");
 if(q.retailerId) filters.push("retailer_id = $retailerId");
 if(q.startDate) filters.push("period >= $startDate");
 if(q.endDate) filters.push("period <= $endDate");
 return "select period, sum(sales_value) as sales, sum(units) as units from public.sales_facts"+(filters.length?" where "+filters.join(" and "):"")+" group by period order by period";
}