"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Activity, ArrowRight, BarChart3, BrainCircuit, Eye, EyeOff,
  LockKeyhole, Mail, ShieldCheck
} from "lucide-react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../lib/supabase-browser";

type Mode = "login" | "signup" | "reset";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "signup") {
      setMode("signup");
    }
    let alive = true;
    try {
      const supabase = supabaseBrowser();
      supabase.auth.getSession().then(({ data, error: sessionError }) => {
        if (alive && !sessionError && data.session) router.replace("/dashboard");
      });
    } catch {
      // Configuration errors are shown when the user attempts to authenticate.
    }
    return () => { alive = false; };
  }, [router]);

  function clearFeedback() {
    setError("");
    setMessage("");
  }

  async function signInWithGoogle() {
    setBusy(true);
    clearFeedback();
    try {
      const supabase = supabaseBrowser();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "https://cpgistai.vercel.app/auth/callback?next=%2Fdashboard",
          queryParams: { prompt: "select_account" }
        }
      });
      if (authError) throw authError;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in could not be started. Please try again.");
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    clearFeedback();
    try {
      const supabase = supabaseBrowser();

      if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: "https://cpgistai.vercel.app/reset-password"
        });
        if (resetError) throw resetError;
        setMessage("If an account exists for this email, a password reset link has been sent.");
        return;
      }

      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (signInError) throw signInError;
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: "https://cpgistai.vercel.app/auth/callback?next=%2Fdashboard"
        }
      });
      if (signUpError) throw signUpError;

      if (!data.session) {
        setMessage("Your account has been created. Check your inbox and confirm your email before signing in.");
        setMode("login");
      } else {
        router.replace("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "login" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password";
  const description = mode === "login"
    ? "Sign in to continue to your CPGist intelligence workspace."
    : mode === "signup"
      ? "Create your account to start exploring your CPG data."
      : "Enter your email and we’ll send you a secure reset link.";

  return (
    <main className="login-page">
      <div className="login-grid" aria-hidden="true" />
      <section className="login-hero">
        <div className="login-brand">
          <span className="login-mark">C</span>
          <div><b>CPGist</b><small>CPG INTELLIGENCE PLATFORM</small></div>
        </div>
        <div className="hero-copy">
          <span className="eyebrow">ENTERPRISE CPG INTELLIGENCE</span>
          <h1>Turn retail data into decisions.</h1>
          <p>Understand what changed, uncover why it happened, and decide what to do next with your CPG data.</p>
          <div className="hero-metrics">
            <div><Activity size={16} /><b>Connected data</b><span>Work with your sources</span></div>
            <div><BarChart3 size={16} /><b>Clear evidence</b><span>Traceable analysis</span></div>
            <div><BrainCircuit size={16} /><b>AI Analyst</b><span>From insight to action</span></div>
          </div>
        </div>
        <div className="login-footer">CPGist · Retail intelligence workspace</div>
      </section>

      <section className="login-card-wrap">
        <div className="login-card">
          <div className="login-card-head">
            <span className="status-dot" />
            <span className="login-security-label"><ShieldCheck size={13} /> SECURE WORKSPACE ACCESS</span>
            <h2>{heading}</h2>
            <p>{description}</p>
          </div>

          <form onSubmit={submit}>
            <label htmlFor="auth-email">Work email
              <div className="field">
                <Mail size={16} aria-hidden="true" />
                <input id="auth-email" type="email" autoComplete="email" value={email}
                  onChange={(event) => setEmail(event.target.value)} required
                  placeholder="you@company.com" />
              </div>
            </label>

            {mode !== "reset" && (
              <label htmlFor="auth-password">Password
                <div className="field">
                  <LockKeyhole size={16} aria-hidden="true" />
                  <input id="auth-password" autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    type={showPassword ? "text" : "password"} value={password}
                    onChange={(event) => setPassword(event.target.value)} required minLength={6}
                    placeholder="At least 6 characters" />
                  <button type="button" className="icon-btn" aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((value) => !value)}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
            )}

            {mode === "login" && (
              <div className="auth-form-options">
                <span>Protected account access</span>
                <button type="button" onClick={() => { setMode("reset"); clearFeedback(); }}>Forgot password?</button>
              </div>
            )}

            {error && <div className="form-error" role="alert">{error}</div>}
            {message && <div className="form-message" role="status">{message}</div>}

            <button className="login-submit" type="submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
              <ArrowRight size={16} />
            </button>
          </form>

          {mode !== "reset" && (
            <>
              <div className="oauth-divider"><span>OR CONTINUE WITH</span></div>
              <button type="button" className="google-submit" onClick={signInWithGoogle} disabled={busy}>
                <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.01 13.22l7.98 6.19C11.88 13.72 17.45 9.5 24 9.5Z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.96 46.98 31.83 46.98 24.55Z"/>
                  <path fill="#FBBC05" d="M9.99 28.59A14.4 14.4 0 0 1 9.2 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.57 10.78l7.42-6.19Z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.45-4.88 2.3-8.18 2.3-6.55 0-12.12-4.22-14.01-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/>
                </svg>
                Continue with Google
                <ArrowRight size={16} />
              </button>
            </>
          )}

          <div className="login-switch">
            {mode === "login" ? "New to CPGist?" : mode === "signup" ? "Already have an account?" : "Remembered your password?"}
            <button type="button" onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              clearFeedback();
            }}>
              {mode === "login" ? "Create account" : mode === "signup" ? "Sign in" : "Back to sign in"}
            </button>
          </div>
          <p className="auth-legal">By continuing, you agree to use CPGist in accordance with your organization’s access policies.</p>
        </div>
      </section>
    </main>
  );
}
