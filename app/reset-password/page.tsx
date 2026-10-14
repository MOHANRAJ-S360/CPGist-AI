"use client";
import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { LockKeyhole, Eye, EyeOff, ArrowRight } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password,setPassword] = useState("");
  const [confirm,setConfirm] = useState("");
  const [show,setShow] = useState(false);
  const [ready,setReady] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const sb = supabaseBrowser();
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const tokenHash = params.get("token_hash");
        if (code) {
          const { error } = await sb.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash) {
          const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
          if (error) throw error;
        }
        const { data, error } = await sb.auth.getSession();
        if (error) throw error;
        if (!data.session) throw new Error("This password-reset link is invalid or expired. Request a new link.");
        if (active) setReady(true);
      } catch (e: any) {
        if (active) setError(e?.message || "Unable to validate this reset link.");
      }
    })();
    return () => { active = false; };
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    if (password.length < 8) { setError("Use a password with at least 8 characters."); setBusy(false); return; }
    if (password !== confirm) { setError("The passwords do not match."); setBusy(false); return; }
    try {
      const { error } = await supabaseBrowser().auth.updateUser({ password });
      if (error) throw error;
      setMessage("Password updated. Opening your workspace…");
      router.replace("/dashboard");
    } catch (e: any) { setError(e?.message || "Password update failed. Request a new reset link if this one expired."); }
    finally { setBusy(false); }
  }
  return <main className="login-page"><div className="login-grid"/><section className="login-hero"><div className="login-brand"><span className="login-mark">C</span><div><b>CPGist</b><small>CPG INTELLIGENCE PLATFORM</small></div></div><div className="hero-copy"><span className="eyebrow">SECURE ACCOUNT RECOVERY</span><h1>Get back to your workspace.</h1><p>Choose a new password for your existing CPGist account. Your account and credit ledger stay unchanged.</p></div><div className="login-footer">CPGist / Retail intelligence workspace</div></section><section className="login-card-wrap"><div className="login-card"><div className="login-card-head"><span className="status-dot"/>PASSWORD RESET<h2>Set a new password</h2><p>Use at least 8 characters. The reset link can only be used with a valid Supabase recovery session.</p></div>
    {!ready && !error && <p className="muted">Validating your secure reset link…</p>}
    {ready && <form onSubmit={submit}><label>New password<div className="field"><LockKeyhole size={16}/><input type={show?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters"/><button type="button" className="icon-btn" onClick={()=>setShow(!show)}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label><label>Confirm new password<div className="field"><LockKeyhole size={16}/><input type={show?"text":"password"} value={confirm} onChange={e=>setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="Repeat your new password"/></div></label><button className="login-submit" disabled={busy}>{busy?"Updating…":"Update password"}<ArrowRight size={16}/></button></form>}
    {error&&<div className="form-error" role="alert">{error}</div>}{message&&<div className="form-message" role="status">{message}</div>}<div className="login-switch"><Link href="/">Back to sign in</Link></div></div></section></main>;
}
