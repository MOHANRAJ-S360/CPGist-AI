import { NextResponse } from "next/server";
import { CPG_TOOLS } from "../../../lib/cpg-analytics";
import {
  analyzeDrivers,
  detectAnomalies,
  forecastSales,
  getDistribution,
  getMarketShare,
  getPrice,
  getSales,
  runScenario,
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
  if (category) q += "&category=eq." + encodeURIComponent(category);
  if (a.startDate) q += "&week_ending=gte." + encodeURIComponent(String(a.startDate));
  if (a.endDate) q += "&week_ending=lte." + encodeURIComponent(String(a.endDate));
  return { rows: await get(q, token), source: "syndicate_sales_weekly" };
}

async function tool(name: string, a: Args, token: string) {
  const filters = filtersFromArgs(a);
  const dataset = await queryDataset(a, token);

  switch (name) {
    case "get_sales": {
      const result = getSales(dataset.rows, filters);
      return { ...result.data, evidence: { ...result.evidence, source: dataset.source }, warnings: result.warnings };
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
      return { ...result.data, evidence: { ...result.evidence, source: dataset.source }, warnings: result.warnings };
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
      return { ...result.data, evidence: { ...result.evidence, source: dataset.source }, warnings: result.warnings };
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

    const messages = [
      {
        role: "system",
        content:
          "You are CPGist AI Analyst. You are an orchestration layer, not the analytics engine. Never invent metrics. For quantitative claims, use the controlled tools and cite the returned evidence in plain language: source, period and relevant filters. State warnings when a result is a baseline or simplified assumption. The connected dataset is the Syndicate CPG dataset. Market share is returned as a decimal; convert to percentage. Do not imply causal conclusions from descriptive data.",
      },
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

      if (!message?.tool_calls?.length) return NextResponse.json(data);

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

    return NextResponse.json({ error: "Analyst tool loop exceeded safety limit." }, { status: 500 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "AI Analyst request failed." }, { status: 500 });
  }
}
