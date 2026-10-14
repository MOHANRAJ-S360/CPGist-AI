import { createHmac, timingSafeEqual } from "node:crypto";

export type PaidPlan = "pro" | "growth" | "enterprise";
export type PublicPlan = { key: PaidPlan; name: string; price: string; planId: string; monthlyAiLimit: number };

function env(name: string) {
  return (process.env[name] || "").trim();
}

export function razorpayConfig() {
  const keyId = env("RAZORPAY_KEY_ID");
  const keySecret = env("RAZORPAY_KEY_SECRET");
  const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const publishableKey = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!keyId || !keySecret || !supabaseUrl || !publishableKey || !serviceKey) {
    throw new Error("Billing is not configured yet. Please try again later.");
  }
  return { keyId, keySecret, supabaseUrl, publishableKey, serviceKey };
}

export function planConfig(key: string): PublicPlan | null {
  const plans: Record<string, Omit<PublicPlan, "key">> = {
    pro: {
      name: "Pro",
      price: "$29/month",
      planId: env("RAZORPAY_PLAN_PRO_ID"),
      monthlyAiLimit: Number(env("CPGIST_PRO_MONTHLY_AI_LIMIT") || 0)
    },
    growth: {
      name: "Growth",
      price: "$99/month",
      planId: env("RAZORPAY_PLAN_GROWTH_ID"),
      monthlyAiLimit: Number(env("CPGIST_GROWTH_MONTHLY_AI_LIMIT") || 0)
    },
    enterprise: {
      name: "Enterprise",
      price: "$499+/month",
      planId: env("RAZORPAY_PLAN_ENTERPRISE_ID"),
      monthlyAiLimit: Number(env("CPGIST_ENTERPRISE_MONTHLY_AI_LIMIT") || 0)
    }
  };
  const plan = plans[key];
  if (!plan) return null;
  return { key: key as PaidPlan, ...plan };
}

export async function getSupabaseUser(accessToken: string) {
  const cfg = razorpayConfig();
  const response = await fetch(cfg.supabaseUrl + "/auth/v1/user", {
    headers: { apikey: cfg.publishableKey, Authorization: "Bearer " + accessToken },
    cache: "no-store"
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id && user?.email ? { id: String(user.id), email: String(user.email) } : null;
}

export async function adminRest(path: string, method: "GET" | "POST" | "PATCH", body?: unknown, prefer?: string) {
  const cfg = razorpayConfig();
  const response = await fetch(cfg.supabaseUrl + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: cfg.serviceKey,
      Authorization: "Bearer " + cfg.serviceKey,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store"
  });
  const text = await response.text();
  if (!response.ok) throw new Error("Billing storage request failed (" + response.status + ").");
  return text ? JSON.parse(text) : null;
}

export async function razorpayRequest(path: string, method: "GET" | "POST", body?: unknown) {
  const cfg = razorpayConfig();
  const auth = Buffer.from(cfg.keyId + ":" + cfg.keySecret).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/" + path.replace(/^\//, ""), {
    method,
    headers: {
      Authorization: "Basic " + auth,
      "Content-Type": "application/json"
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Razorpay API request failed with status", response.status);
    throw new Error("Razorpay could not process this request. Check the plan configuration and try again.");
  }
  return data;
}

export function verifySubscriptionSignature(paymentId: string, subscriptionId: string, signature: string) {
  const secret = env("RAZORPAY_KEY_SECRET");
  if (!secret || !paymentId || !subscriptionId || !signature) return false;
  const expected = createHmac("sha256", secret).update(paymentId + "|" + subscriptionId).digest();
  let received: Buffer;
  try { received = Buffer.from(signature, "hex"); } catch { return false; }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = env("RAZORPAY_WEBHOOK_SECRET");
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let received: Buffer;
  try { received = Buffer.from(signature, "hex"); } catch { return false; }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function toIsoFromEpoch(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}
