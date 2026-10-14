import { NextResponse } from "next/server";

export type AuthenticatedSupabaseUser = {
  user: { id: string; email?: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> };
  token: string;
};

export async function requireSupabaseUser(request: Request): Promise<AuthenticatedSupabaseUser | { response: NextResponse }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { response: NextResponse.json({ error: "Authentication service is not configured." }, { status: 503 }) };
  const auth = request.headers.get("authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { response: NextResponse.json({ error: "Sign in to access this resource." }, { status: 401 }) };
  const response = await fetch(url.replace(/\/$/, "") + "/auth/v1/user", {
    headers: { apikey: key, Authorization: "Bearer " + token },
    cache: "no-store"
  });
  if (!response.ok) return { response: NextResponse.json({ error: "Your session is invalid or expired. Please sign in again." }, { status: 401 }) };
  const user = await response.json();
  if (!user?.id) return { response: NextResponse.json({ error: "Authentication could not be verified." }, { status: 401 }) };
  return { user, token };
}
