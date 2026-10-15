"use client";
import { useEffect } from "react";

export default function LoginPage() {
  useEffect(() => {
    window.location.replace("https://cpgist.vercel.app/signin");
  }, []);

  return (
    <main className="login-page">
      <section className="login-card-wrap">
        <div className="login-card">
          <div className="login-card-head">
            <span className="login-security-label">CPGIST SECURE ACCESS</span>
            <h2>Continue through your company portal</h2>
            <p>Sign in or create your account on the official CPGist portal. You’ll be returned to the CPGist AI workspace automatically.</p>
          </div>
          <a className="login-submit" href="https://cpgist.vercel.app/signin">Continue to CPGist portal →</a>
        </div>
      </section>
    </main>
  );
}
