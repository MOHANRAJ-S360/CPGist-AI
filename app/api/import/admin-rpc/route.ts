import { NextResponse } from "next/server";
import { requireSupabaseUser } from "../../../../lib/require-supabase-user";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const authResult = await requireSupabaseUser(req);
  if ("response" in authResult) return authResult.response;
  if (authResult.user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Only a CPGist administrator can replace or rebuild the shared demo dataset." }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "A JSON action is required." }, { status: 400 }); }
  const rpc = body?.action === "reset" ? "cpgist_reset_import_dataset" :
    body?.action === "rebuild_competitor_weekly" ? "cpgist_rebuild_competitor_weekly" : null;
  if (!rpc) return NextResponse.json({ error: "Unsupported import administration action." }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Server database configuration is missing." }, { status: 503 });
  const response = await fetch(url.replace(/\/$/, "") + "/rest/v1/rpc/" + rpc, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store"
  });
  if (!response.ok) return NextResponse.json({ error: "The dataset operation failed. No import was completed." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
