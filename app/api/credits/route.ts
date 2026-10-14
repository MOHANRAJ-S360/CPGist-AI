import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const auth = req.headers.get("authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!url || !key) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  if (!token) return NextResponse.json({ error: "Sign in to view credits." }, { status: 401 });
  const root = url.replace(/\/$/, "");
  const headers = { apikey: key, Authorization: "Bearer " + token };
  const userCheck = await fetch(root + "/auth/v1/user", { headers, cache: "no-store" });
  if (!userCheck.ok) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  const [statusResponse, ledgerResponse, operationsResponse] = await Promise.all([
    fetch(root + "/rest/v1/rpc/cpgist_credit_status", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}", cache: "no-store" }),
    fetch(root + "/rest/v1/cpgist_credit_ledger?select=id,transaction_type,amount,balance_after,operation_key,status,reason,created_at&order=created_at.desc&limit=100", { headers, cache: "no-store" }),
    fetch(root + "/rest/v1/cpgist_credit_operations?select=id,operation_key,credits,status,created_at,completed_at,refunded_at,failure_reason&order=created_at.desc&limit=100", { headers, cache: "no-store" })
  ]);
  if (!statusResponse.ok) return NextResponse.json({ error: "Credit balance is not available yet. The credit-ledger migration may not have been applied." }, { status: 503 });
  if (!ledgerResponse.ok || !operationsResponse.ok) return NextResponse.json({ error: "Credit history is not available yet." }, { status: 503 });
  const [balance, transactions, operations] = await Promise.all([statusResponse.json(), ledgerResponse.json(), operationsResponse.json()]);
  return NextResponse.json({ balance, transactions, operations }, { headers: { "Cache-Control": "no-store" } });
}
