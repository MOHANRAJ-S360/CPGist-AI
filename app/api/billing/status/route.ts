import { NextResponse } from "next/server";
import { planConfig } from "../../../../lib/razorpay-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const globalEnabled = process.env.BILLING_CHECKOUT_ENABLED === "true" && process.env.BILLING_TESTS_PASSED === "true";
  const sharedReady = Boolean(
    process.env.RAZORPAY_KEY_ID?.trim() &&
    process.env.RAZORPAY_KEY_SECRET?.trim() &&
    process.env.RAZORPAY_WEBHOOK_SECRET?.trim() &&
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() &&
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
  const ready = (key: "pro" | "growth") => {
    const plan = planConfig(key);
    return globalEnabled && sharedReady && Boolean(
      plan?.planId &&
      Number.isInteger(plan.monthlyAiLimit) &&
      plan.monthlyAiLimit > 0
    );
  };

  return NextResponse.json(
    { checkoutEnabled: globalEnabled, plans: { pro: ready("pro"), growth: ready("growth") } },
    { headers: { "Cache-Control": "no-store" } }
  );
}
