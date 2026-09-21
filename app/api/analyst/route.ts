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

  let q = "cpgist_brand_weekly?select=brand_id,category,week_ending,sales,units,distribution,avg_price,promo_rate&limit=100000";
  if (brand) q += "&brand_id=eq." + encodeURIComponent(brand);
  if (category) q += "&category=ilike." + encodeURIComponent(category);
  if (a.startDate) q += "&week_ending=gte." + encodeURIComponent(String(a.startDate));
  if (a.endDate) q += "&week_ending=lte." + encodeURIComponent(String(a.endDate));
  const raw = await get(q, token);
  return { rows: raw.map((r:any) => ({
    brand_id: r.brand_id, category: r.category, week_ending: r.week_ending,
    dollar_sales: r.sales, units: r.units, acv_distribution: r.distribution,
    avg_price: r.avg_price, promo_observations: r.promo_rate, observations: 1
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
      const reviewRows = await queryDataset(a, token);
      const filters = filtersFromArgs(a);
      const health = businessHealthScan(reviewRows.rows, filters);
      const growth = categoryGrowthPlan(reviewRows.rows, filters);
      const latest = growth.data.brands.slice(0, 10);
      const brandIds = latest.map(x => x.brandId).join(",");
      const brandMaster = brandIds ? await get("cpgist_brands?select=id,name,category,parent_company&id=in.(" + encodeURIComponent(brandIds) + ")", token) : [];
      const names = Object.fromEntries(brandMaster.map((b:any)=>[String(b.id),b]));
      const products = a.brandId ? await get("cpgist_product_summary?select=product_id,brand_id,period_end,sales_13w,units_13w,avg_price_13w,distribution_13w,promo_rate_13w&brand_id=eq."+encodeURIComponent(String(a.brandId))+"&order=sales_13w.desc&limit=10", token) : [];
      const retailers = a.brandId ? await get("cpgist_brand_retailer_summary?select=brand_id,retailer_id,category,period_end,sales_13w,units_13w,avg_price_13w,distribution_13w,promo_rate_13w&brand_id=eq."+encodeURIComponent(String(a.brandId))+"&order=sales_13w.desc&limit=10", token) : [];
      const retailerIds = retailers.map((x:any)=>x.retailer_id).join(",");
      const retailerMaster = retailerIds ? await get("cpgist_retailers?select=id,name,channel,region,total_stores&id=in.("+encodeURIComponent(retailerIds)+")", token) : [];
      const retailerNames = Object.fromEntries(retailerMaster.map((x:any)=>[String(x.id),x]));
      return {
        executive: { status: health.data.status, salesGrowthPct: health.data.salesGrowthPct, latestSales: health.data.latestSales, priorSales: health.data.priorSales, latestUnits: health.data.latestUnits, latestPrice: health.data.latestPrice, anomalyCount: health.data.anomalyCount },
        brands: latest.map(x=>({...x,brandName:names[x.brandId]?.name ?? null,category:names[x.brandId]?.category ?? null})),
        products: products.map((x:any)=>({...x,productId:x.product_id})),
        retailers: retailers.map((x:any)=>({...x,retailerName:retailerNames[String(x.retailer_id)]?.name ?? null,channel:retailerNames[String(x.retailer_id)]?.channel ?? null,region:retailerNames[String(x.retailer_id)]?.region ?? null})),
        categoryDiagnostics: growth.data.diagnostics.map(x=>({...x,brandName:names[x.brandId]?.name ?? null})),
        evidence:{...health.evidence,source:reviewRows.source},
        warnings:[...health.warnings,...growth.warnings]
      };
    }

    case "product_sku_performance": {
      const brand = a.brandId ? "&brand_id=eq."+encodeURIComponent(String(a.brandId)) : "";
      const rows = await get("cpgist_product_summary?select=product_id,brand_id,period_end,sales_13w,units_13w,avg_price_13w,distribution_13w,promo_rate_13w&order=sales_13w.desc&limit=1000"+brand, token);
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
      const q="syndicate_competitor_signals?select=brand_id,category,retailer_id,region,signal_date,signal_type,magnitude_pct,description&order=signal_date.desc&limit=1000"+(clauses.length?"&"+clauses.join("&"):"");
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
    if (response.ok) return { response, data: await response.json() };
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const key = process.env.GROQ_API_KEY;
    if (!key) return NextResponse.json({ error: "GROQ_API_KEY is not configured in Vercel Production." }, { status: 503 });

    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Please sign in again before using AI Analyst." }, { status: 401 });

    const capabilityCatalog = capabilityContext();
    const activeScope = body?.scope?.brandId ? "\n\nActive analysis scope: brandId=" + String(body.scope.brandId) + ". Unless the user explicitly asks to change scope, pass this brandId to relevant analytical tools and keep the answer focused on this brand." : "";
    const toolEvidence: any[] = [];
    const messages = [
      {
        role: "system",
        content: "You are CPGist AI Analyst. You are an evidence-first CPG decision-support system. During tool selection, NEVER call a tool named json or any tool not listed in the request. The only callable tools are the analytical functions supplied in this request. Do not try to satisfy the final JSON formatting requirement by calling a tool. Treat natural-language CPG questions as flexible business requests: users may use informal wording, abbreviations, executive language, or combine several questions in one sentence. Map the request to the closest capabilities and controlled tools rather than requiring exact keywords. If the requested capability is not supported by the connected data, say exactly what is unavailable and answer the supported portion instead of inventing evidence. You orchestrate controlled analytical tools; you do not calculate metrics yourself.\n\nCapability catalog:\n" + capabilityCatalog + "\n\nDecision procedure: For category improvement, growth, turnaround, leadership, or brand-priority questions, call category_growth_plan FIRST. Then call additional tools only for unresolved questions such as retailer whitespace, retailer concentration, price, anomalies, forecasts, or scenarios. Never substitute generic FMCG advice for observed evidence. Every action recommendation must reference the specific observed signal that triggered it. Clearly distinguish observed facts, diagnostic signals, hypotheses, and planning assumptions. Do not claim causality from descriptive data.\n\nFor quantitative claims, use the controlled tools and preserve their returned values exactly.\nEvidence rules:\n- Never convert rowCount into a week/period count. Use evidence.periodCount.\n- Never claim the requested date range is fully covered when evidence.periodStart/evidence.periodEnd are narrower. State actual coverage.\n- Never invent, duplicate, or silently alter ranking entries.\n- When brandName is available, use it instead of brandId.\n- Treat validation issues and warnings as authoritative.\n- Do not make causal claims from descriptive data.\n- For scenarios, preserve scenarioSales exactly and explain the price × volume × distribution mechanics and assumptions.\n\nYour final response must be a JSON object with exactly these fields:\n{\n  \"type\": \"summary\" | \"ranking\" | \"scenario\" | \"trend\" | \"diagnostic\" | \"comparison\" | \"forecast\" | \"distribution\" | \"anomaly\",\n  \"headline\": \"short business headline\",\n  \"executiveTakeaway\": \"1-3 sentence answer directly answering the user\",\n  \"metrics\": [{\"label\":\"...\", \"value\":\"...\", \"change\":\"optional\", \"tone\":\"positive|negative|neutral\"}],\n  \"table\": {\"columns\":[\"...\"], \"rows\":[[\"...\"]]} | null,\n  \"sections\": [{\"title\":\"...\", \"bullets\":[\"...\"]}],\n  \"warnings\": [\"...\"],\n  \"evidence\": {\"source\":\"...\", \"period\":\"...\", \"periodCount\":0, \"filters\":\"...\"},\n  \"decisionTrail\": [{\"type\":\"observed|diagnostic|action|limitation\",\"text\":\"...\"}],\n  \"nextBestQuestion\": \"optional follow-up question or null\"\n}\nUse null for table when no table is useful. Include a short decisionTrail grounded only in tool evidence: observed facts, diagnostic interpretation, concrete action, and limitations. Include nextBestQuestion only when a useful unresolved question remains; otherwise use null. Keep the response concise and professional. For category-growth questions, include a brand action table when category_growth_plan returned brand diagnostics. For cross-category questions, use cross_category_portfolio FIRST; never claim an exact brand spans categories unless the tool returns it. If exactMultiCategoryBrands is empty, clearly distinguish parent-company portfolio breadth from exact brand breadth. If a brand is identified as needing distribution action, call retailer_opportunity before making retailer-specific recommendations. Do not output Markdown, code fences, or any fields outside this schema." + activeScope      },
      ...(body.messages || []),
    ];

    for (let round = 0; round < 4; round++) {
      const { response, data } = await groqChat(key, {
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        messages,
        temperature: 0.1,
        tools: CPG_TOOLS.map((t: any) => ({ type: "function", function: t })),
        tool_choice: "auto",
        parallel_tool_calls: false,
        disable_tool_validation: true,
        reasoning_format: "hidden",
      });
      if (!response.ok) return NextResponse.json({ error: data?.error?.message || data?.message || "AI provider request failed.", providerStatus: response.status }, { status: response.status });

      const message = data.choices?.[0]?.message;
      if (!message) break;

      if (!message?.tool_calls?.length) {
        messages.push(message);
        break;
      }

      // Groq can occasionally emit an unsupported tool name (for example "json")
      // when a reasoning model is asked for structured output. Keep the turn valid,
      // return a tool-level error for that call, and let the model recover instead of
      // failing the whole request with a tool validation 400.
      messages.push(message);
      for (const call of message.tool_calls) {
        try {
          const knownTool = CPG_TOOLS.some((t: any) => t.name === call.function.name);
          if (!knownTool) {
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: call.function.name,
              content: JSON.stringify({ error: "Unsupported tool name. Use only the supplied CPGist analytical tools.", is_error: true }),
            });
            continue;
          }
          const result = await tool(call.function.name, JSON.parse(call.function.arguments || "{}"), token);
          toolEvidence.push({ tool: call.function.name, result });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify(result),
          });
        } catch (error: any) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify({ error: error?.message || "Analytical tool failed." }),
          });
        }
      }
    }

    const { response: finalResponse, data: finalData } = await groqChat(key, {
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: "You are CPGist AI Analyst. Return only the required JSON object. Base every quantitative claim only on the tool results above. Never invent metrics. If a capability is unavailable, state the limitation. Keep the answer concise and professional.\n\nRequired fields: type, headline, executiveTakeaway, metrics, table, sections, warnings, evidence, decisionTrail, nextBestQuestion." },
        ...messages.slice(1),
        { role: "user", content: "Return the final answer now as the required JSON object. Do not call tools. Use only observed tool evidence." }
      ],
      temperature: 0.05,
      response_format: { type: "json_object" },
      reasoning_format: "hidden"
    });
    if (!finalResponse.ok) return NextResponse.json({ error: finalData?.error?.message || finalData?.message || "AI Analyst final response failed.", providerStatus: finalResponse.status }, { status: finalResponse.status });
    const raw = finalData.choices?.[0]?.message?.content;
    try {
      let analyst = JSON.parse(raw || "{}");
      if (!analyst.headline || !analyst.executiveTakeaway || !Array.isArray(analyst.metrics) || !Array.isArray(analyst.sections) || !Array.isArray(analyst.warnings) || !Array.isArray(analyst.decisionTrail)) {
        throw new Error("Invalid structured analyst response.");
      }

      // Deterministic evidence gate: every answer must expose the actual analytical
      // coverage returned by the controlled tools. This prevents the LLM from
      // silently widening a requested period or inventing a source.
      const evidenceRows = toolEvidence.map(x => x.result?.evidence).filter(Boolean);
      const latestEvidence = evidenceRows.at(-1);
      if (latestEvidence) {
        analyst.evidence = {
          source: latestEvidence.source ?? analyst.evidence?.source ?? "CPGist analytical layer",
          period: latestEvidence.periodStart && latestEvidence.periodEnd
            ? String(latestEvidence.periodStart) + " → " + String(latestEvidence.periodEnd)
            : analyst.evidence?.period ?? "Observed source coverage",
          periodCount: Number(latestEvidence.periodCount ?? analyst.evidence?.periodCount ?? 0),
          filters: JSON.stringify(latestEvidence.filters ?? {})
        };
      }
      analyst.warnings = [...new Set([...(analyst.warnings || []), ...toolEvidence.flatMap(x => Array.isArray(x.result?.warnings) ? x.result.warnings : [])])];

      // Final verification pass: a separate low-temperature model call checks the
      // drafted answer against the exact tool evidence and returns a corrected object.
      // It is intentionally forbidden from introducing new analysis.
      const verifyPayload = JSON.stringify({ draft: analyst, toolEvidence });
      const { response: verifyResponse, data: verifyData } = await groqChat(key, {
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        messages: [
          {
            role: "system",
            content: "You are the CPGist answer verifier. Return only a JSON object with the exact same schema as the draft. Compare every quantitative claim, ranking, date range, and source against toolEvidence. Correct unsupported numbers, rankings, periods, names, or causal wording. Preserve valid content. Never add facts not present in toolEvidence. If evidence is insufficient, add a concise warning and use a limitation instead of guessing. Do not perform new calculations. Do not call tools."
          },
          { role: "user", content: verifyPayload }
        ],
        temperature: 0,
        response_format: { type: "json_object" },
        reasoning_format: "hidden"
      });
      if (verifyResponse.ok) {
        try {
          const verified = JSON.parse(verifyData.choices?.[0]?.message?.content || "{}");
          if (verified?.headline && verified?.executiveTakeaway && Array.isArray(verified.metrics) && Array.isArray(verified.sections)) {
            analyst = verified;
          }
        } catch {}
      }

      return NextResponse.json({ analyst, verification: { performed: true, toolCount: toolEvidence.length } });
    } catch {
      return NextResponse.json({ error: "The analyst produced an invalid structured response. Please retry." }, { status: 502 });
    }

  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "AI Analyst request failed." }, { status: 500 });
  }
}
