"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { ArrowLeft, Coins, RefreshCw } from "lucide-react";
import Link from "next/link";

type Transaction = { id: number; transaction_type: string; amount: number; balance_after: number; operation_key?: string | null; status: string; reason?: string | null; created_at: string };\ntype Operation = { id: string; operation_key: string; credits: number; status: string; created_at: string; completed_at?: string | null; refunded_at?: string | null; failure_reason?: string | null };
export default function CreditsPage() {
  const [balance, setBalance] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);\n  const [operations, setOperations] = useState<Operation[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabaseBrowser().auth.getSession();
      if (!session) throw new Error("Please sign in to view your credits.");
      const response = await fetch("/api/credits", { headers: { Authorization: "Bearer " + session.access_token }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Credit history could not be loaded.");
      setBalance(data.balance); setTransactions(Array.isArray(data.transactions) ? data.transactions : []); setOperations(Array.isArray(data.operations) ? data.operations : []);
    } catch (e: any) { setError(e?.message || "Credit history could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  return <AppShell title="Credits & usage" subtitle="Balance, transactions and access options">
    <section className="content">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:18}}>
        <div><div className="muted">ACCOUNT</div><h1 style={{margin:"4px 0"}}>Credits & usage history</h1><p className="muted">Credit changes are recorded by the server. Viewing this page does not consume credits.</p></div>
        <div style={{display:"flex",gap:10}}><Link className="button secondary" href="/dashboard"><ArrowLeft size={15}/> Back to workspace</Link><button className="button secondary" onClick={load} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
      </div>
      {error && <div className="card panel" role="alert"><strong>Unable to load credits</strong><p>{error}</p><p className="muted">If this is the first deployment of the credit system, the database migration must be applied before the balance is available.</p></div>}
      <div className="card panel" style={{display:"flex",alignItems:"center",gap:16,marginBottom:18}}>
        <div style={{width:48,height:48,borderRadius:12,display:"grid",placeItems:"center",background:"#e7ecfb",color:"#26307a"}}><Coins size={24}/></div>
        <div><div className="muted">Available balance</div><h2 style={{margin:"4px 0"}}>{loading ? "Loading…" : balance ? (balance.balance ?? balance.remaining ?? 0) + " credits" : "—"}</h2><p className="muted" style={{margin:0}}>AI Analyst price: {balance?.cost ?? "—"} credit(s) per question. No expiry policy is configured.</p></div>
      </div>
      {balance && (balance.balance ?? balance.remaining ?? 0) <= 0 && <div className="card panel" style={{marginBottom:18,border:"1px solid #f0c36d"}}><strong>No credits remaining</strong><p>Paid credit packs and subscriptions are not active yet. No payment will be taken. Contact the administrator for access or wait for an allowance only if one is configured.</p></div>}
      <div className="card panel" style={{marginBottom:18}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}><h2 style={{margin:0}}>Metered operation history</h2><span className="muted">{operations.length} recent operations</span></div>
        {loading ? <p className="muted">Loading operations…</p> : operations.length === 0 ? <p className="muted">No metered operations recorded yet.</p> :
          <div style={{overflowX:"auto",marginTop:12}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Started","Operation","Credits reserved","Status","Completed / refunded","Failure reason"].map(h=><th key={h} style={{textAlign:"left",padding:"10px 8px",borderBottom:"1px solid #e5e7eb"}}>{h}</th>)}</tr></thead><tbody>{operations.map(o=><tr key={o.id}><td style={{padding:"10px 8px",borderBottom:"1px solid #eef0f4",whiteSpace:"nowrap"}}>{new Date(o.created_at).toLocaleString()}</td><td style={{padding:"10px 8px",borderBottom:"1px solid #eef0f4"}}>{o.operation_key}</td><td style={{padding:"10px 8px",borderBottom:"1px solid #eef0f4"}}>{o.credits}</td><td style={{padding:"10px 8px",borderBottom:"1px solid #eef0f4"}}>{o.status}</td><td style={{padding:"10px 8px",borderBottom:"1px solid #eef0f4",whiteSpace:"nowrap"}}>{o.completed_at ? new Date(o.completed_at).toLocaleString() : o.refunded_at ? new Date(o.refunded_at).toLocaleString() : "—"}</td><td style={{padding:"10px 8px",borderBottom:"1px solid #eef0f4"}}>{o.failure_reason || "—"}</td></tr>)}</tbody></table></div>}
      </div>
      <div className="card panel"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}><h2 style={{margin:0}}>Transaction history</h2><span className="muted">{transactions.length} recent entries</span></div>
        {loading ? <p className="muted">Loading transaction history…</p> : transactions.length === 0 ? <p className="muted">No credit transactions recorded yet.</p> :
          <div style={{overflowX:"auto",marginTop:12}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Date","Type","Operation","Change","Balance after","Status","Reason"].map(h=><th key={h} style={{textAlign:"left",padding:"10px 8px",borderBottom:"1px solid #e5e7eb"}}>{h}</th>)}</tr></thead><tbody>{transactions.map(t=><tr key={t.id}><td style={{padding:"10px 8px",borderBottom:"1px solid #eef0f4",whiteSpace:"nowrap"}}>{new Date(t.created_at).toLocaleString()}</td><td style={{padding:"10px 8px",borderBottom:"1px solid #eef0f4"}}>{t.transaction_type}</td><td style={{padding:"10px 8px",borderBottom:"1px solid #eef0f4"}}>{t.operation_key || "—"}</td><td style={{padding:"10px 8px",borderBottom:"1px solid #eef0f4",fontWeight:700}}>{t.amount > 0 ? "+" : ""}{t.amount}</td><td style={{padding:"10px 8px",borderBottom:"1px solid #eef0f4"}}>{t.balance_after}</td><td style={{padding:"10px 8px",borderBottom:"1px solid #eef0f4"}}>{t.status}</td><td style={{padding:"10px 8px",borderBottom:"1px solid #eef0f4"}}>{t.reason || "—"}</td></tr>)}</tbody></table></div>}
      </div>
    </section>
  </AppShell>;
}
