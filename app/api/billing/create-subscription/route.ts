import { NextResponse } from "next/server";
import { adminRest, getSupabaseUser, planConfig, razorpayConfig, razorpayRequest } from "../../../../../lib/razorpay-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Please sign in before upgrading." }, { status: 401 });
    const user = await getSupabaseUser(token);
    if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const key = String(body?.planKey || "");
    if (key === "enterprise") return NextResponse.json({ error: "Enterprise plans require a tailored sales agreement. Please contact sales." }, { status: 400 });
    const plan = planConfig(key);
    if (!plan || !plan.planId) return NextResponse.json({ error: "This Razorpay plan is not configured yet." }, { status: 503 });
    if (!Number.isInteger(plan.monthlyAiLimit) || plan.monthlyAiLimit < 1) {
      return NextResponse.json({ error: "The monthly AI usage limit for this plan must be configured before checkout can be enabled." }, { status: 503 });
    }
    const cfg = razorpayConfig();
    const subscription = await razorpayRequest("subscriptions", "POST", {
      plan_id: plan.planId,
      total_count: 100,
      quantity: 1,
      customer_notify: 1,
      notes: { cpgist_user_id: user.id, cpgist_plan_key: plan.key }
    });
    if (!subscription?.id) throw new Error("Razorpay did not return a subscription ID.");

    await adminRest("cpgist_ai_subscriptions", "POST", [{
      user_id: user.id,
      plan_key: plan.key,
      razorpay_subscription_id: String(subscription.id),
      status: String(subscription.status || "created"),
      monthly_ai_limit: plan.monthlyAiLimit,
      current_start: null,
      current_end: null
    }], "return=minimal");

    return NextResponse.json({
      subscriptionId: String(subscription.id),
      keyId: cfg.keyId,
      plan: { key: plan.key, name: plan.name, price: plan.price }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("Subscription creation failed:", error?.message || "unknown error");
    return NextResponse.json({ error: error?.message || "Unable to start checkout." }, { status: 503 });
  }
}
