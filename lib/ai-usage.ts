type UsageState = {
  completed?: number;
  limit?: number;
  remaining: number;
  balance?: number;
  cost?: number;
  allowed?: boolean;
  insufficient?: boolean;
  duplicate?: boolean;
  code?: string;
  status?: string;
};

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment is not configured.");
  return { url: url.replace(/\/$/, ""), key };
}

export async function callUsageRpc(
  token: string,
  name: "reserve" | "complete" | "release" | "status",
  idempotencyKey?: string
): Promise<UsageState> {
  if (!token) throw new Error("Authentication required.");
  const { url, key } = supabaseConfig();
  const rpcName = name === "release" ? "cpgist_credit_refund" :
    name === "reserve" ? "cpgist_credit_reserve" :
    name === "complete" ? "cpgist_credit_complete" : "cpgist_credit_status";
  if ((name === "reserve" || name === "complete" || name === "release") && !idempotencyKey) {
    throw new Error("A credit operation idempotency key is required.");
  }
  const body = name === "reserve"
    ? { p_operation_key: "AI_ANALYST_QUESTION", p_idempotency_key: idempotencyKey }
    : name === "complete"
      ? { p_idempotency_key: idempotencyKey }
      : name === "release"
        ? { p_idempotency_key: idempotencyKey, p_reason: "ai_analyst_failed" }
        : {};
  const response = await fetch(`${url}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Credit tracking failed (${response.status}): ${message.slice(0, 300)}`);
  }
  const data = await response.json() as UsageState;
  if (data.balance == null && data.remaining != null) data.balance = data.remaining;
  if (data.remaining == null && data.balance != null) data.remaining = data.balance;
  return data;
}
