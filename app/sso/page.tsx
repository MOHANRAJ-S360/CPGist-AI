"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../lib/supabase-browser";

export default function SingleSignOnCallback() {
  const router = useRouter();
  const [message, setMessage] = useState("Securely connecting your CPGist account…");

  useEffect(() => {
    let active = true;

    async function finishSignIn() {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const tokenHash = params.get("token_hash");
      const type = params.get("type");

      // Remove the one-time credential from the visible URL/history before any
      // network call. The token is delivered in the fragment, not an HTTP request.
      window.history.replaceState(null, "", "/sso");

      if (!tokenHash || (type !== "magiclink" && type !== "signup")) {
        if (active) setMessage("This sign-in link is missing or expired. Return to CPGist and open AI Analyst again.");
        return;
      }

      try {
        const { error } = await supabaseBrowser().auth.verifyOtp({
          token_hash: tokenHash,
          type,
        });
        if (error) throw error;
        if (active) router.replace("/dashboard");
      } catch {
        if (active) setMessage("We couldn't verify this sign-in. The link may have expired or already been used. Return to CPGist and try again.");
      }
    }

    void finishSignIn();
    return () => { active = false; };
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-6 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-400/10 text-teal-300">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.9 7.8 7 10 4.1-2.2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>
        </div>
        <h1 className="text-xl font-semibold">CPGist AI Analyst</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300" role="status">{message}</p>
      </section>
    </main>
  );
}
