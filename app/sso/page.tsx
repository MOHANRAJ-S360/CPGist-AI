"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../lib/supabase-browser";

export default function SsoPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Verifying your company portal session…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function finish() {
      try {
        const ticket = new URLSearchParams(window.location.search).get("ticket") || "";
        if (!ticket) throw new Error("This sign-in link is missing its ticket. Return to the company portal and try again.");
        window.history.replaceState({}, "", "/sso");
        const response = await fetch("/api/sso/exchange", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket }), cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "The company portal could not verify your session.");
        const { error } = await supabaseBrowser().auth.verifyOtp({ token_hash: payload.token_hash, type: "magiclink" });
        if (error) throw error;
        if (!cancelled) {
          setMessage("Signed in. Opening your CPGist AI workspace…");
          router.replace("/dashboard"); router.refresh();
        }
      } catch (error) {
        if (!cancelled) {
          setFailed(true);
          setMessage(error instanceof Error ? error.message : "Secure sign-in failed. Return to the company portal and try again.");
        }
      }
    }
    void finish();
    return () => { cancelled = true; };
  }, [router]);

  return <main className="login-page"><section className="login-card-wrap"><div className="login-card" role="status" aria-live="polite">
    <div className="login-card-head"><span className="login-security-label">CPGIST SECURE ACCESS</span><h2>Opening your workspace</h2><p>{message}</p></div>
    {failed && <a className="login-submit" href="https://cpgist.vercel.app/signin">Return to CPGist portal</a>}
  </div></section></main>;
}
