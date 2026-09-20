"use client";
import {useState} from "react";
import {Database,UploadCloud,CheckCircle2,AlertCircle,Loader2,ShieldCheck} from "lucide-react";
import Link from "next/link";
import {AppShell} from "../../components/app-shell";
import {supabaseBrowser} from "../../lib/supabase-browser";
import {importSyndicateZip} from "../../lib/syndicate-import";

export default function ImportPage(){
 const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState(""),[result,setResult]=useState<any>(null),[error,setError]=useState("");
 async function run(){if(!file)return;setBusy(true);setError("");setResult(null);try{const sb=supabaseBrowser();const {data:{session}}=await sb.auth.getSession();if(!session)throw new Error("Please sign in first.");setStatus("Starting secure browser import…");const r=await importSyndicateZip(sb,file,setStatus);setResult(r);setStatus("Import completed successfully.")}catch(e:any){setError(e?.message||"Import failed. You can retry safely; the import is idempotent.");setStatus("")}finally{setBusy(false)}}
 return <AppShell title="Data Import" subtitle="Source ingestion and dataset readiness"><section className="content"><div className="intro"><div><div className="muted">SOURCE INGESTION</div><h1>Load your CPG dataset</h1><p>Validate and load a Syndicate dataset into the CPGist analytical workspace.</p></div></div>
  <div className="card import-card"><div className="import-icon"><Database size={27}/></div><div className="import-title-row"><div><h2>Upload Syndicate data</h2><p>CPGist will validate the archive, load the supported source tables and expose the data to Dashboard, AI Analyst and Reports.</p></div><div className="import-trust"><ShieldCheck size={16}/>Source-validated</div></div>
   <label className="dropzone"><input type="file" accept=".zip" onChange={e=>{setFile(e.target.files?.[0]||null);setError("");setResult(null)}}/><UploadCloud size={24}/><strong>{file?file.name:"Choose dataset file"}</strong><span>{file?(file.size/1024/1024).toFixed(1)+" MB selected":"ZIP dataset · click to browse"}</span></label>
   <button className="primary import-btn" disabled={!file||busy} onClick={run}>{busy?<><Loader2 size={15} className="spin"/>Processing…</>:<><UploadCloud size={15}/>Validate & import</>}</button>
   {status&&<div className="form-message"><Loader2 size={14} className={busy?"spin":""}/>{status}</div>}
   {error&&<div className="form-error"><AlertCircle size={14}/>{error}</div>}
   {result&&<div className="import-success"><CheckCircle2 size={18}/><div><b>Dataset is live.</b><span>{result.brands} brands · {result.retailers} retailers · {result.products} products · {result.salesRows.toLocaleString()} source observations · {result.brandWeeks.toLocaleString()} brand-weeks</span><Link href="/dashboard">Open live dashboard →</Link></div></div>}
  </div>
 </section></AppShell>
}
