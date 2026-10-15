"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase-browser";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function finishAuthentication() {
      try {
        const supabase = supabaseBrowser();
        const authError = searchParams.get("error_description") || searchParams.get("error");
        if (authError) throw new Error(authError.replace(/\+/g, " "));

        const code = searchParams.get("code");
        const tokenHash = searchParams.get("token_hash");
        const type = searchParams.get("type");

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (tokenHash && type) {
          const allowedType = type as "signup" | "recovery" | "email" | "invite" | "magiclink" | "email_change";
          const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: allowedType });
          if (verifyError) throw verifyError;
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session) throw new Error("Your sign-in could not be verified. Please return and try again.");

        if (!cancelled) {
          const requestedNext = searchParams.get("next") || "/dashboard";
          const safeNext = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";
          router.replace(safeNext);
          router.refresh();
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Authentication could not be completed.");
      }
    }

    void finishAuthentication();
    return () => { cancelled = true; };
  }, [router, searchParams]);

  return (
    <main className="auth-callback-page">
      <div className="auth-callback-card">
        <span className="login-mark">C</span>
        <p className="auth-callback-eyebrow">CPGIST SECURE ACCESS</p>
        <h1>{error ? "Sign-in needs another try" : "Finishing your sign-in"}</h1>
        <p>{error || "Verifying your account and preparing your workspace…"}</p>
        {error && <a className="auth-callback-link" href="/">Return to sign in</a>}
      </div>
    </main>
  );
}
