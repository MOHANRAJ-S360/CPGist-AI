"use client";

import { useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { supabaseBrowser } from "../../lib/supabase-browser";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, any>) => { open: () => void; on: (event: string, handler: (response: any) => void) => void };
  }
}

const plans = [
  { key: "free", name: "Free", price: "$0", cadence: "/ month", note: "For people evaluating CPGist.", features: ["Sample dashboard and synthetic demo data", "Limited analytics exploration", "3 successfully completed AI Analyst analyses"], action: "Current free tier" },
  { key: "pro", name: "Pro", price: "$29", cadence: "/ month", note: "For individual analysts, consultants and small brands.", features: ["Full dashboard and data explorer", "AI Analyst with monthly usage limits", "Brand, SKU, retailer and promotion analysis", "Distribution and availability gap insights", "Exportable reports, subject to plan limits"], action: "Upgrade to Pro", featured: true },
  { key: "growth", name: "Growth", price: "$99", cadence: "/ month", note: "For growing CPG brands and analytics teams.", features: ["Multiple users (team seats to be configured)", "Higher AI usage and data limits", "Saved analyses and recurring reports", "Advanced comparisons and collaboration"], action: "Choose Growth" },
  { key: "enterprise", name: "Enterprise", price: "$499+", cadence: "/ month", note: "For larger companies needing tailored analytics.", features: ["Custom data integrations", "Role-based access and governance", "Higher usage limits and support", "Custom deployment and service options"], action: "Contact sales" }
];

export default function PricingPage() {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function upgrade(planKey: string) {
    setError(""); setMessage("");
    if (planKey === "enterprise") {
      window.location.href = "mailto:cpgistai@gmail.com?subject=CPGist%20Enterprise%20plan";
      return;
    }
    if (!window.Razorpay) {
      setError("Secure checkout is loading. Please wait a moment and try again.");
      return;
    }
    setBusy(planKey);
    try {
      const { data: { session } } = await supabaseBrowser().auth.getSession();
      if (!session) { window.location.href = "/"; return; }
      const response = await fetch("/api/billing/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
        body: JSON.stringify({ planKey })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to start checkout.");
      const checkout = new window.Razorpay!({
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: "CPGist",
        description: data.plan.name + " monthly subscription",
        image: "/favicon.ico",
        prefill: { email: session.user.email || "" },
        theme: { color: "#242b67" },
        handler: async (result: any) => {
          try {
            const verified = await fetch("/api/billing/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
              body: JSON.stringify(result)
            });
            const check = await verified.json();
            if (!verified.ok) throw new Error(check.error || "Verification failed.");
            setMessage(check.active ? "Your subscription is active. Refresh the AI Analyst to continue." : check.message);
          } catch (e: any) {
            setError(e.message || "Payment was received, but verification needs a retry. Contact support before paying again.");
          } finally { setBusy(""); }
        },
        modal: { ondismiss: () => setBusy("") }
      });
      checkout.on("payment.failed", () => {
        setError("The payment attempt failed or was cancelled. No paid access was granted.");
        setBusy("");
      });
      checkout.open();
    } catch (e: any) {
      setError(e.message || "Unable to start checkout.");
      setBusy("");
    }
  }

  return <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-900">
    <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
    <div className="mx-auto max-w-7xl">
      <div className="mb-10 flex items-center justify-between gap-4">
        <Link href="/dashboard" className="font-semibold text-indigo-900">← Back to CPGist</Link>
        <span className="text-xs text-slate-500">Plans and billing</span>
      </div>
      <header className="mx-auto mb-10 max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[.22em] text-indigo-700">CPGist plans</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Choose the right level of CPG intelligence.</h1>
        <p className="mt-4 text-slate-600">Start free. Upgrade when your analysis needs grow. Prices are shown in USD; the actual checkout currency and taxes depend on the Razorpay plan configured for your account.</p>
      </header>
      {error && <div role="alert" className="mx-auto mb-5 max-w-3xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {message && <div role="status" className="mx-auto mb-5 max-w-3xl rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {plans.map(plan => <section key={plan.key} className={"flex flex-col rounded-2xl border bg-white p-6 shadow-sm " + (plan.featured ? "border-indigo-500 ring-2 ring-indigo-100" : "border-slate-200")}>
          {plan.featured && <span className="mb-3 w-fit rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">Recommended</span>}
          <h2 className="text-lg font-semibold">{plan.name}</h2>
          <div className="mt-4 flex items-baseline gap-1"><span className="text-4xl font-semibold">{plan.price}</span><span className="text-sm text-slate-500">{plan.cadence}</span></div>
          {plan.key === "pro" && <p className="mt-2 text-xs text-slate-500">Approximately ₹2,500/month; INR amount and taxes depend on exchange rates and your configured plan.</p>}
          <p className="mt-4 min-h-12 text-sm leading-6 text-slate-600">{plan.note}</p>
          <ul className="my-6 flex-1 space-y-3 text-sm text-slate-700">{plan.features.map(item => <li key={item} className="flex gap-2"><span className="font-bold text-emerald-600">✓</span><span>{item}</span></li>)}</ul>
          <button disabled={busy !== "" || plan.key === "free"} onClick={() => void upgrade(plan.key)} className={"rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 " + (plan.featured ? "bg-indigo-700 text-white hover:bg-indigo-800" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50")}>
            {busy === plan.key ? "Opening secure checkout…" : plan.key === "free" ? "Free tier included" : plan.action}
          </button>
        </section>)}
      </div>
      <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-5 text-slate-500">Subscriptions are activated only after server-side verification and a valid Razorpay webhook. Do not retry a payment if the status is uncertain; contact support first.</p>
    </div>
  </main>;
}
