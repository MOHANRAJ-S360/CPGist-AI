type UsageState = { completed: number; limit: number; remaining: number; allowed?: boolean };

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment is not configured.");
  return { url: url.replace(/\/$/, ""), key };
}

export async function callUsageRpc(token: string, name: "reserve" | "complete" | "release" | "status"): Promise<UsageState> {
  if (!token) throw new Error("Authentication required.");
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/cpgist_ai_usage_${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: "{}",
    cache: "no-store"
  });
  if (!response.ok) {
    // Keep database/provider diagnostics in server logs only; never expose RPC details to clients.
    throw new Error("Unable to verify AI usage right now. Please retry shortly.");
  }
  return await response.json() as UsageState;
}
