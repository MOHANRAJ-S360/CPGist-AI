import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { adminRest, toIsoFromEpoch, verifyWebhookSignature } from "../../../../../lib/razorpay-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  try {
    const event = JSON.parse(rawBody);
    const eventName = String(event?.event || "");
    const subscription = event?.payload?.subscription?.entity;
    if (!subscription?.id) return NextResponse.json({ received: true });
    const eventId = req.headers.get("x-razorpay-event-id") || createHash("sha256").update(rawBody).digest("hex");
    const inserted = await adminRest("cpgist_razorpay_webhook_events?on_conflict=event_id", "POST", [{
      event_id: eventId, event_name: eventName
    }], "resolution=ignore-duplicates,return=representation");
    if (!Array.isArray(inserted) || inserted.length === 0) return NextResponse.json({ received: true, duplicate: true });

    const statusMap: Record<string, string> = {
      "subscription.activated": "active",
      "subscription.charged": "active",
      "subscription.authenticated": "authenticated",
      "subscription.pending": "pending",
      "subscription.halted": "halted",
      "subscription.paused": "paused",
      "subscription.resumed": "active",
      "subscription.cancelled": "cancelled",
      "subscription.completed": "completed"
    };
    const status = statusMap[eventName];
    if (!status) return NextResponse.json({ received: true, ignored: true });

    await adminRest("cpgist_ai_subscriptions?razorpay_subscription_id=eq." + encodeURIComponent(String(subscription.id)), "PATCH", {
      status,
      current_start: toIsoFromEpoch(subscription.current_start),
      current_end: toIsoFromEpoch(subscription.current_end),
      updated_at: new Date().toISOString()
    }, "return=minimal");
    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Razorpay webhook processing failed:", error?.message || "unknown error");
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
