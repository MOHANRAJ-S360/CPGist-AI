import { NextResponse } from "next/server";
import { adminRest, getSupabaseUser, razorpayRequest, toIsoFromEpoch, verifySubscriptionSignature } from "../../../../lib/razorpay-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const user = await getSupabaseUser(token);
    if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

    const body = await req.json();
    const paymentId = String(body?.razorpay_payment_id || "");
    const subscriptionId = String(body?.razorpay_subscription_id || "");
    const signature = String(body?.razorpay_signature || "");
    if (!verifySubscriptionSignature(paymentId, subscriptionId, signature)) {
      return NextResponse.json({ error: "Payment signature could not be verified." }, { status: 400 });
    }

    const rows = await adminRest(
      "cpgist_ai_subscriptions?select=id,user_id,razorpay_subscription_id&user_id=eq." +
      encodeURIComponent(user.id) + "&razorpay_subscription_id=eq." + encodeURIComponent(subscriptionId),
      "GET"
    );
    if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: "Subscription does not belong to this account." }, { status: 403 });

    // Confirm the actual subscription status directly with Razorpay. Checkout callback alone never grants access.
    const remote = await razorpayRequest("subscriptions/" + encodeURIComponent(subscriptionId), "GET");
    const statusMap: Record<string, string> = {
      created: "created", authenticated: "authenticated", active: "active", pending: "pending",
      halted: "halted", paused: "paused", cancelled: "cancelled", completed: "completed", expired: "expired"
    };
    const status = statusMap[String(remote?.status)] || "pending";
    await adminRest(
      "cpgist_ai_subscriptions?razorpay_subscription_id=eq." + encodeURIComponent(subscriptionId) +
      "&user_id=eq." + encodeURIComponent(user.id),
      "PATCH",
      { status, current_start: toIsoFromEpoch(remote?.current_start), current_end: toIsoFromEpoch(remote?.current_end), updated_at: new Date().toISOString() },
      "return=minimal"
    );
    return NextResponse.json({
      verified: true,
      active: status === "active",
      message: status === "active" ? "Subscription active." : "Payment authorization received. Access will activate when Razorpay confirms the subscription."
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("Subscription verification failed:", error?.message || "unknown error");
    return NextResponse.json({ error: "Unable to verify the subscription right now. Please retry." }, { status: 503 });
  }
}
