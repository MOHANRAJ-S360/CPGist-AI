import { NextResponse } from "next/server";
import { CPG_TOOLS } from "../../../lib/cpg-analytics";
import { capabilityContext } from "../../../lib/cpg-intelligence/capabilities";
import {
  analyzeDrivers,
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

  if (mode === "retailer" || (retailer && !brand && !category)) {
    let q = "syndicate_retailer_weekly?select=week_ending,retailer_id,dollar_sales,units,acv_distribution&limit=30000";
    q += "&retailer_id=eq." + encodeURIComponent(retailer);
    if (a.startDate) q += "&week_ending=gte." + encodeURIComponent(String(a.startDate));
    if (a.endDate) q += "&week_ending=lte." + encodeURIComponent(String(a.endDate));
    return { rows: await get(q, token), source: "syndicate_retailer_weekly" };
  }

  let q = "syndicate_sales_weekly?select=brand_id,category,week_ending,dollar_sales,units,acv_distribution,promo_observations,avg_discount_depth_pct,observations&limit=30000";
  if (brand) q += "&brand_id=eq." + encodeURIComponent(brand);
  if (category) q += "&category=ilike." + encodeURIComponent(category);
  if (a.startDate) q += "&week_ending=gte." + encodeURIComponent(String(a.startDate));
  if (a.endDate) q += "&week_ending=lte." + encodeURIComponent(String(a.endDate));
  return { rows: await get(q, token), source: "syndicate_sales_weekly" };
}

async function tool(name: string, a: Args, token: string) {
  const filters = filtersFromArgs(a);
  const dataset = await queryDataset(a, token);

  switch (name) {
    case "data_readiness": {
      const tables = ["syndicate_brands","syndicate_products","syndicate_sales_weekly","syndicate_retailer_weekly","syndicate_brand_retailer","syndicate_signal_notes","syndicate_competitor_signals"];
      const counts: Record<string, number> = {};
      for (const table of tables) {
        try {
          const response = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/" + table + "?select=*", { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "", Authorization: "Bearer " + token, Prefer: "count=exact" }, cache: "no-store" });
          if (!response.ok) throw new Error("readiness check failed");
          const range = response.headers.get("content-range");
          counts[table] = range && range.includes("/") ? Number(range.split("/")[1]) || 0 : (await response.json()).length;
        } catch { counts[table] = 0; }
      }
      return { domains: { sales: counts.syndicate_sales_weekly > 0, retailerOpportunity: counts.syndicate_brand_retailer > 0, products: counts.syndicate_products > 0, competition: counts.syndicate_competitor_signals > 0, signals: counts.syndicate_signal_notes > 0 }, counts, warnings: counts.syndicate_brand_retailer === 0 ? ["Retailer opportunity aggregation is not populated yet; re-import the Syndicate ZIP to enable retailer whitespace analysis."] : [] };
    }

    case "business_health_scan": {
      const result = businessHealthScan(dataset.rows, filters);
      return { ...result.data, evidence: { ...result.evidence, source: dataset.source }, warnings: result.warnings };
    }

    case "cross_category_portfolio": {
      const [brands, salesRows] = await Promise.all([
        get("syndicate_brands?select=id,name,category,parent_company&limit=1000", token),
        get("syndicate_sales_weekly?select=brand_id,dollar_sales&limit=12000", token)
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
      const retailerRows = await get("syndicate_brand_retailer?select=brand_id,retailer_id,category,sales,units,distribution,discount_depth_pct,observations&category=ilike." + encodedCategory + "&limit=10000", token);
      const result = retailerOpportunity(retailerRows, brandId, category);
      const ids = result.data.retailers.map(x => x.retailerId).join(",");
      const retailers = ids ? await get("syndicate_retailers?select=id,name,channel,region,total_stores&id=in.(" + encodeURIComponent(ids) + ")", token) : [];
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

    case "category_growth_plan": {
      const categoryName = String(a.categoryId || "").trim();
      if (!categoryName) return { error: "category_growth_plan requires categoryId." };
      const categoryDataset = await queryDataset({ ...a, brandId: undefined, categoryId: categoryName }, token);
      const result = categoryGrowthPlan(categoryDataset.rows, filtersFromArgs(a));
      const issues = validateAnalyticalResult(result);
      const ids = result.data.brands.map(x=>x.brandId).join(",");
      const brands = ids ? await get("syndicate_brands?select=id,name&id=in.(" + encodeURIComponent(ids) + ")", token) : [];
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
        const brands = await get("syndicate_brands?select=id,name&id=in.(" + encodeURIComponent(ids) + ")", token);
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
    const messages = [
      {
        role: "system",
        content: "You are CPGist AI Analyst. You are an evidence-first CPG decision-support system. Treat natural-language CPG questions as flexible business requests: users may use informal wording, abbreviations, executive language, or combine several questions in one sentence. Map the request to the closest capabilities and controlled tools rather than requiring exact keywords. If the requested capability is not supported by the connected data, say exactly what is unavailable and answer the supported portion instead of inventing evidence. You orchestrate controlled analytical tools; you do not calculate metrics yourself.\n\nCapability catalog:\n" + capabilityCatalog + "\n\nDecision procedure: For category improvement, growth, turnaround, leadership, or brand-priority questions, call category_growth_plan FIRST. Then call additional tools only for unresolved questions such as retailer whitespace, retailer concentration, price, anomalies, forecasts, or scenarios. Never substitute generic FMCG advice for observed evidence. Every action recommendation must reference the specific observed signal that triggered it. Clearly distinguish observed facts, diagnostic signals, hypotheses, and planning assumptions. Do not claim causality from descriptive data.\n\nFor quantitative claims, use the controlled tools and preserve their returned values exactly.\nEvidence rules:\n- Never convert rowCount into a week/period count. Use evidence.periodCount.\n- Never claim the requested date range is fully covered when evidence.periodStart/evidence.periodEnd are narrower. State actual coverage.\n- Never invent, duplicate, or silently alter ranking entries.\n- When brandName is available, use it instead of brandId.\n- Treat validation issues and warnings as authoritative.\n- Do not make causal claims from descriptive data.\n- For scenarios, preserve scenarioSales exactly and explain the price × volume × distribution mechanics and assumptions.\n\nYour final response must be a JSON object with exactly these fields:\n{\n  \"type\": \"summary\" | \"ranking\" | \"scenario\" | \"trend\" | \"diagnostic\" | \"comparison\" | \"forecast\" | \"distribution\" | \"anomaly\",\n  \"headline\": \"short business headline\",\n  \"executiveTakeaway\": \"1-3 sentence answer directly answering the user\",\n  \"metrics\": [{\"label\":\"...\", \"value\":\"...\", \"change\":\"optional\", \"tone\":\"positive|negative|neutral\"}],\n  \"table\": {\"columns\":[\"...\"], \"rows\":[[\"...\"]]} | null,\n  \"sections\": [{\"title\":\"...\", \"bullets\":[\"...\"]}],\n  \"warnings\": [\"...\"],\n  \"evidence\": {\"source\":\"...\", \"period\":\"...\", \"periodCount\":0, \"filters\":\"...\"},\n  \"decisionTrail\": [{\"type\":\"observed|diagnostic|action|limitation\",\"text\":\"...\"}],\n  \"nextBestQuestion\": \"optional follow-up question or null\"\n}\nUse null for table when no table is useful. Include a short decisionTrail grounded only in tool evidence: observed facts, diagnostic interpretation, concrete action, and limitations. Include nextBestQuestion only when a useful unresolved question remains; otherwise use null. Keep the response concise and professional. For category-growth questions, include a brand action table when category_growth_plan returned brand diagnostics. For cross-category questions, use cross_category_portfolio FIRST; never claim an exact brand spans categories unless the tool returns it. If exactMultiCategoryBrands is empty, clearly distinguish parent-company portfolio breadth from exact brand breadth. If a brand is identified as needing distribution action, call retailer_opportunity before making retailer-specific recommendations. Do not output Markdown, code fences, or any fields outside this schema." + activeScope      },
      ...(body.messages || []),
    ];

    for (let round = 0; round < 4; round++) {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
          messages,
          temperature: 0.1,
          tools: CPG_TOOLS.map((t: any) => ({ type: "function", function: t })),
          tool_choice: "auto",
        }),
      });

      const data = await response.json();
      if (!response.ok) return NextResponse.json(data, { status: response.status });

      const message = data.choices?.[0]?.message;
      messages.push(message);

      if (!message?.tool_calls?.length) break;

      for (const call of message.tool_calls) {
        try {
          const result = await tool(call.function.name, JSON.parse(call.function.arguments || "{}"), token);
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

    const finalResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: "You are CPGist AI Analyst. You are an evidence-first CPG decision-support system. Treat natural-language CPG questions as flexible business requests: users may use informal wording, abbreviations, executive language, or combine several questions in one sentence. Map the request to the closest capabilities and controlled tools rather than requiring exact keywords. If the requested capability is not supported by the connected data, say exactly what is unavailable and answer the supported portion instead of inventing evidence. You orchestrate controlled analytical tools; you do not calculate metrics yourself.\n\nCapability catalog:\n" + capabilityCatalog + "\n\nDecision procedure: For category improvement, growth, turnaround, leadership, or brand-priority questions, call category_growth_plan FIRST. Then call additional tools only for unresolved questions such as retailer concentration, price, anomalies, forecasts, or scenarios. Never substitute generic FMCG advice for observed evidence. Every action recommendation must reference the specific observed signal that triggered it. Clearly distinguish observed facts, diagnostic signals, hypotheses, and planning assumptions. Do not claim causality from descriptive data.\n\nFor quantitative claims, use the controlled tools and preserve their returned values exactly.\nEvidence rules:\n- Never convert rowCount into a week/period count. Use evidence.periodCount.\n- Never claim the requested date range is fully covered when evidence.periodStart/evidence.periodEnd are narrower. State actual coverage.\n- Never invent, duplicate, or silently alter ranking entries.\n- When brandName is available, use it instead of brandId.\n- Treat validation issues and warnings as authoritative.\n- Do not make causal claims from descriptive data.\n- For scenarios, preserve scenarioSales exactly and explain the price × volume × distribution mechanics and assumptions.\n\nYour final response must be a JSON object with exactly these fields:\n{\n  \"type\": \"summary\" | \"ranking\" | \"scenario\" | \"trend\" | \"diagnostic\" | \"comparison\" | \"forecast\" | \"distribution\" | \"anomaly\",\n  \"headline\": \"short business headline\",\n  \"executiveTakeaway\": \"1-3 sentence answer directly answering the user\",\n  \"metrics\": [{\"label\":\"...\", \"value\":\"...\", \"change\":\"optional\", \"tone\":\"positive|negative|neutral\"}],\n  \"table\": {\"columns\":[\"...\"], \"rows\":[[\"...\"]]} | null,\n  \"sections\": [{\"title\":\"...\", \"bullets\":[\"...\"]}],\n  \"warnings\": [\"...\"],\n  \"evidence\": {\"source\":\"...\", \"period\":\"...\", \"periodCount\":0, \"filters\":\"...\"},\n  \"decisionTrail\": [{\"type\":\"observed|diagnostic|action|limitation\",\"text\":\"...\"}],\n  \"nextBestQuestion\": \"optional follow-up question or null\"\n}\nUse null for table when no table is useful. Include a short decisionTrail grounded only in tool evidence: observed facts, diagnostic interpretation, concrete action, and limitations. Include nextBestQuestion only when a useful unresolved question remains; otherwise use null. Keep the response concise and professional. Do not output Markdown, code fences, or any fields outside this schema." },
          ...messages.slice(1),
          { role: "user", content: "Return the final answer now as the required JSON object. Do not call tools. Base every quantitative claim only on the tool results above. If the user asked for a capability marked planned or partial, state the data limitation explicitly rather than filling the gap with generic CPG claims." }
        ],
        temperature: 0.05,
        response_format: { type: "json_object" }
      }),
    });
    const finalData = await finalResponse.json();
    if (!finalResponse.ok) return NextResponse.json(finalData, { status: finalResponse.status });
    const raw = finalData.choices?.[0]?.message?.content;
    try {
      const analyst = JSON.parse(raw || "{}");
      if (!analyst.headline || !analyst.executiveTakeaway || !Array.isArray(analyst.metrics) || !Array.isArray(analyst.sections) || !Array.isArray(analyst.warnings) || !Array.isArray(analyst.decisionTrail)) {
        throw new Error("Invalid structured analyst response.");
      }
      return NextResponse.json({ analyst });
    } catch {
      return NextResponse.json({ error: "The analyst produced an invalid structured response. Please retry." }, { status: 502 });
    }

  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "AI Analyst request failed." }, { status: 500 });
  }
}
