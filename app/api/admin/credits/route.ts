import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function authorize(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const auth = req.headers.get("authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!url || !key || !serviceKey) return { error: NextResponse.json({ error: "Admin service is not configured." }, { status: 503 }) } as const;
  if (!token) return { error: NextResponse.json({ error: "Sign in is required." }, { status: 401 }) } as const;
  const root = url.replace(/\/$/, "");
  const userResponse = await fetch(root + "/auth/v1/user", { headers: { apikey: key, Authorization: "Bearer " + token }, cache: "no-store" });
  if (!userResponse.ok) return { error: NextResponse.json({ error: "Session expired. Please sign in again." }, { status: 401 }) } as const;
  const user = await userResponse.json();
  if (user?.app_metadata?.role !== "admin") return { error: NextResponse.json({ error: "Administrator permission required." }, { status: 403 }) } as const;
  return { root, key, serviceKey, token, user } as const;
}

export async function GET(req: Request) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;
  const headers = { apikey: auth.serviceKey, Authorization: "Bearer " + auth.serviceKey };
  const [settings, accounts, ledger] = await Promise.all([
    fetch(auth.root + "/rest/v1/cpgist_credit_settings?select=welcome_credits,welcome_grant_enabled,ai_analyst_question_cost,welcome_expiration_days,updated_at&id=eq.1", { headers, cache: "no-store" }),
    fetch(auth.root + "/rest/v1/cpgist_credit_accounts?select=user_id,balance,welcome_granted,welcome_granted_at,created_at,updated_at&order=updated_at.desc&limit=200", { headers, cache: "no-store" }),
    fetch(auth.root + "/rest/v1/cpgist_credit_ledger?select=id,user_id,transaction_type,amount,balance_after,operation_key,status,reason,created_at&order=created_at.desc&limit=200", { headers, cache: "no-store" })
  ]);
  if (!settings.ok || !accounts.ok || !ledger.ok) return NextResponse.json({ error: "Credit ledger is not initialized. Apply the CPGist credit-ledger migration first." }, { status: 503 });
  return NextResponse.json({ settings: (await settings.json())[0] ?? null, accounts: await accounts.json(), ledger: await ledger.json() }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: Request) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "A JSON settings body is required." }, { status: 400 }); }
  const patch: Record<string, unknown> = {};
  if (body.welcome_credits !== undefined) {
    if (!Number.isInteger(body.welcome_credits) || body.welcome_credits < 0 || body.welcome_credits > 100000) return NextResponse.json({ error: "welcome_credits must be an integer from 0 to 100000." }, { status: 400 });
    patch.welcome_credits = body.welcome_credits;
  }
  if (body.welcome_grant_enabled !== undefined) {
    if (typeof body.welcome_grant_enabled !== "boolean") return NextResponse.json({ error: "welcome_grant_enabled must be true or false." }, { status: 400 });
    patch.welcome_grant_enabled = body.welcome_grant_enabled;
  }
  if (body.ai_analyst_question_cost !== undefined) {
    if (!Number.isInteger(body.ai_analyst_question_cost) || body.ai_analyst_question_cost < 0 || body.ai_analyst_question_cost > 100000) return NextResponse.json({ error: "ai_analyst_question_cost must be an integer from 0 to 100000." }, { status: 400 });
    patch.ai_analyst_question_cost = body.ai_analyst_question_cost;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "No supported settings were supplied." }, { status: 400 });
  patch.updated_at = new Date().toISOString();
  const response = await fetch(auth.root + "/rest/v1/cpgist_credit_settings?id=eq.1", {
    method: "PATCH",
    headers: { apikey: auth.serviceKey, Authorization: "Bearer " + auth.serviceKey, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch), cache: "no-store"
  });
  if (!response.ok) return NextResponse.json({ error: "Unable to update credit settings." }, { status: 502 });
  return NextResponse.json({ settings: (await response.json())[0] ?? null });
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "A JSON adjustment body is required." }, { status: 400 }); }
  if (typeof body.user_id !== "string" || !Number.isInteger(body.amount) || body.amount === 0 || typeof body.reason !== "string" || body.reason.trim().length < 3) {
    return NextResponse.json({ error: "Provide user_id, a non-zero integer amount, and a reason." }, { status: 400 });
  }
  const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key : crypto.randomUUID();
  const response = await fetch(auth.root + "/rest/v1/rpc/cpgist_credit_admin_adjust", {
    method: "POST",
    headers: { apikey: auth.key, Authorization: "Bearer " + auth.token, "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: body.user_id, p_amount: body.amount, p_reason: body.reason.trim(), p_idempotency_key: idempotencyKey }),
    cache: "no-store"
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: result.message || "The adjustment was rejected. Confirm your admin session is refreshed." }, { status: response.status === 401 ? 401 : 403 });
  return NextResponse.json(result);
}
