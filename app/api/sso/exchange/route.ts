import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const portalApi = (process.env.CPGIST_PORTAL_API_URL || "https://cpgist-api.onrender.com/api").trim().replace(/\/$/, "");
    const sharedSecret = process.env.CPGIST_SSO_SHARED_SECRET?.trim();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    // Report missing variable NAMES only. Never log or return secret values.
    const missing: string[] = [];
    if (!sharedSecret) missing.push("CPGIST_SSO_SHARED_SECRET");
    if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

    if (missing.length > 0) {
      console.error("CPGist SSO configuration missing:", missing.join(", "));
      return NextResponse.json({
        error: "SSO configuration is missing in the active CPGist AI deployment.",
        missing,
      }, { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } });
    }
    const body = await request.json().catch(() => ({}));
    const ticket = typeof body.ticket === "string" ? body.ticket : "";
    if (!ticket || ticket.length > 256) return NextResponse.json({ error: "A valid sign-in ticket is required." }, { status: 400 });

    const exchange = await fetch(`${portalApi}/auth/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cpgist-sso-secret": sharedSecret },
      body: JSON.stringify({ ticket }), cache: "no-store",
    });
    const identity = await exchange.json().catch(() => ({}));
    if (!exchange.ok || identity.email_verified !== true || typeof identity.email !== "string") {
      return NextResponse.json({ error: identity.detail || "The portal could not verify this sign-in. Return to the portal and try again." }, { status: exchange.status === 401 ? 401 : 403 });
    }

    const email = identity.email.trim().toLowerCase();
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    let userId: string | null = null;
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const match = data.users.find((user) => user.email?.toLowerCase() === email);
      if (match) userId = match.id;
      if (data.users.length < 1000) break;
    }

    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email, email_confirm: true,
        user_metadata: { full_name: typeof identity.name === "string" ? identity.name : "" },
      });
      if (error) throw error;
      userId = data.user.id;
    } else {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        email_confirm: true,
        user_metadata: { full_name: typeof identity.name === "string" ? identity.name : "" },
      });
      if (error) throw error;
    }

    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error) throw error;
    const tokenHash = data.properties?.hashed_token;
    if (!tokenHash) throw new Error("Supabase did not issue a one-time session token.");
    return NextResponse.json({ token_hash: tokenHash, type: "magiclink" }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("CPGist SSO exchange failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "CPGist could not finish secure sign-in. Return to the company portal and try again." }, { status: 500 });
  }
}
