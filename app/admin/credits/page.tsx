"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { RefreshCw, Save, Coins, PlusCircle } from "lucide-react";

export default function AdminCreditsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);\n  const [operations, setOperations] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("5");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function request(path: string, init: RequestInit = {}) {
    const { data: { session } } = await supabaseBrowser().auth.getSession();
    if (!session) throw new Error("Please sign in again.");
    const response = await fetch(path, { ...init, headers: { Authorization: "Bearer " + session.access_token, "Content-Type": "application/json", ...(init.headers || {}) }, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Admin request failed.");
    return data;
  }
  async function load() {
    setLoading(true); setError("");
    try { const d = await request("/api/admin/credits"); setSettings(d.settings); setAccounts(d.accounts || []); setLedger(d.ledger || []); setOperations(d.operations || []); }
    catch (e: any) { setError(e?.message || "Unable to load credit administration."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const d = await request("/api/admin/credits", { method: "PATCH", body: JSON.stringify({
        welcome_credits: Number(settings.welcome_credits),
        welcome_grant_enabled: Boolean(settings.welcome_grant_enabled),
        ai_analyst_question_cost: Number(settings.ai_analyst_question_cost)
      }) });
      setSettings(d.settings); setMessage("Credit settings saved. This affects future welcome grants and new AI Analyst reservations; existing balances are unchanged.");
    } catch (e: any) { setError(e?.message || "Unable to save settings."); }
    finally { setSaving(false); }
  }
  async function adjust(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const d = await request("/api/admin/credits", { method: "POST", body: JSON.stringify({ user_id: userId, amount: Number(amount), reason, idempotency_key: crypto.randomUUID() }) });
      setMessage("Adjustment recorded. New balance: " + d.balance + " credits."); setReason(""); await load();
    } catch (e: any) { setError(e?.message || "Adjustment failed."); }
    finally { setSaving(false); }
  }
  return <AppShell title="Credit administration" subtitle="Admin-only controls and audit history">
    <section className="content">
      <div className="intro"><div><div className="muted">ADMINISTRATION</div><h1>Credit settings & audit</h1><p>Only Supabase users with <code>app_metadata.role = admin</code> can use this screen. Settings changes never rewrite existing balances.</p></div><button className="button secondary" onClick={load} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
      {error && <div className="card panel" role="alert"><strong>Request blocked</strong><p>{error}</p><p className="muted">If you were just granted admin access, sign out and back in to refresh your Supabase access token.</p></div>}
      {message && <div className="card panel" role="status">{message}</div>}
      {loading ? <div className="card panel">Loading secure credit settings…</div> : settings && <>
        <form className="card panel" onSubmit={saveSettings} style={{marginBottom:18}}>
          <h2 style={{marginTop:0}}>Credit configuration</h2>
          <p className="muted">Proposed launch defaults: 10 welcome credits and 1 credit per AI Analyst question. No expiry is configured.</p>
          <div className="form-grid">
            <label>Welcome credits<input type="number" min="0" max="100000" required value={settings.welcome_credits} onChange={e=>setSettings({...settings,welcome_credits:Number(e.target.value)})}/></label>
            <label>AI Analyst question cost<input type="number" min="0" max="100000" required value={settings.ai_analyst_question_cost} onChange={e=>setSettings({...settings,ai_analyst_question_cost:Number(e.target.value)})}/></label>
          </div>
          <label style={{display:"flex",gap:10,alignItems:"center",margin:"14px 0"}}><input type="checkbox" checked={settings.welcome_grant_enabled} onChange={e=>setSettings({...settings,welcome_grant_enabled:e.target.checked})}/> Enable one-time welcome grants for new accounts</label>
          <button className="button primary" disabled={saving}><Save size={15}/> Save settings</button>
        </form>
        <form className="card panel" onSubmit={adjust} style={{marginBottom:18}}>
          <h2 style={{marginTop:0}}><PlusCircle size={18} style={{verticalAlign:"middle",marginRight:8}}/>Manual credit adjustment</h2>
          <p className="muted">Positive amounts add credits; negative amounts remove credits. Every adjustment requires a reason and is written to the ledger.</p>
          <label>User account<select required value={userId} onChange={e=>setUserId(e.target.value)}><option value="">Choose an account</option>{accounts.map(a=><option key={a.user_id} value={a.user_id}>{a.user_id} · {a.balance} credits</option>)}</select></label>
          <div className="form-grid" style={{marginTop:12}}><label>Adjustment amount<input type="number" required value={amount} onChange={e=>setAmount(e.target.value)} min="-100000" max="100000" step="1"/></label><label>Reason<input required minLength={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. support correction"/></label></div>
          <button className="button primary" disabled={saving || !userId || !reason.trim() || Number(amount)===0}><Coins size={15}/> Apply adjustment</button>
        </form>
        <div className="card panel" style={{marginBottom:18}}><h2 style={{marginTop:0}}>Accounts</h2><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["User ID","Balance","Welcome grant","Created","Updated"].map(x=><th key={x} style={{textAlign:"left",padding:8,borderBottom:"1px solid #e5e7eb"}}>{x}</th>)}</tr></thead><tbody>{accounts.map(a=><tr key={a.user_id}><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{a.user_id}</td><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{a.balance}</td><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{a.welcome_granted ? "Granted" : "Not granted"}</td><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{new Date(a.created_at).toLocaleDateString()}</td><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{new Date(a.updated_at).toLocaleDateString()}</td></tr>)}</tbody></table></div></div>
        <div className="card panel" style={{marginBottom:18}}><h2 style={{marginTop:0}}>Recent metered operations</h2><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Started","User ID","Operation","Credits","Status","Failure"].map(x=><th key={x} style={{textAlign:"left",padding:8,borderBottom:"1px solid #e5e7eb"}}>{x}</th>)}</tr></thead><tbody>{operations.map(o=><tr key={o.id}><td style={{padding:8,borderBottom:"1px solid #eef0f4",whiteSpace:"nowrap"}}>{new Date(o.created_at).toLocaleString()}</td><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{o.user_id}</td><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{o.operation_key}</td><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{o.credits}</td><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{o.status}</td><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{o.failure_reason||"—"}</td></tr>)}</tbody></table></div></div>
        <div className="card panel"><h2 style={{marginTop:0}}>Recent ledger entries</h2><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Date","User ID","Type","Amount","Balance","Operation","Reason"].map(x=><th key={x} style={{textAlign:"left",padding:8,borderBottom:"1px solid #e5e7eb"}}>{x}</th>)}</tr></thead><tbody>{ledger.map(t=><tr key={t.id}><td style={{padding:8,borderBottom:"1px solid #eef0f4",whiteSpace:"nowrap"}}>{new Date(t.created_at).toLocaleString()}</td><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{t.user_id}</td><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{t.transaction_type}</td><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{t.amount}</td><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{t.balance_after}</td><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{t.operation_key||"—"}</td><td style={{padding:8,borderBottom:"1px solid #eef0f4"}}>{t.reason||"—"}</td></tr>)}</tbody></table></div></div>
      </>}
    </section>
  </AppShell>;
}
