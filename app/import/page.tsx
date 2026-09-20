"use client";
import {useState} from "react";
import {Database,UploadCloud,CheckCircle2,AlertCircle,Loader2} from "lucide-react";
import {AppShell} from "../../components/app-shell";
import {supabaseBrowser} from "../../lib/supabase-browser";
import {importDatasetZip} from "../../lib/syndicate-import";

export default function ImportPage(){
 const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState(""),[result,setResult]=useState<any>(null),[error,setError]=useState("");
 async function run(){if(!file)return;setBusy(true);setError("");setResult(null);try{const sb=supabaseBrowser();const {data:{session}}=await sb.auth.getSession();if(!session)throw new Error("Please sign in first.");setStatus("Starting secure browser import…");const r=await importDatasetZip(sb,file,setStatus);setResult(r);setStatus("Import completed successfully.");}catch(e:any){setError(e?.message||"Import failed. You can retry safely; the import is idempotent.");setStatus("")}finally{setBusy(false)}}
 return <AppShell title="Data Import" subtitle="Secure source ingestion"><section className="content"><div className="intro"><div><div className="muted">SOURCE INGESTION</div><h1>Load the CPGist dataset</h1><p>Validate and load a CPG dataset into the shared CPGist analytical workspace.</p></div></div>
  <div className="card import-card"><div className="import-icon"><Database size={28}/></div><h2>Upload CPGist Free Dataset</h2><p>Use a supported ZIP dataset. The import is validated before records become available to the analytical workspace.</p>
   <label className="dropzone"><input type="file" accept=".zip" onChange={e=>{setFile(e.target.files?.[0]||null);setError("");setResult(null)}}/><strong>{file?file.name:"Choose CPGist dataset ZIP"}</strong><span>{file?((file.size/1024/1024).toFixed(1)+" MB selected"):"Click to browse from your computer"}</span></label>
   <button className="primary import-btn" disabled={!file||busy} onClick={run}>{busy?<><Loader2 size={15} className="spin"/>Processing…</>:<><UploadCloud size={15}/>Validate & import</>}</button>
   {status&&<div className="form-message"><Loader2 size={14} className={busy?"spin":""}/>{status}</div>}
   {error&&<div className="form-error"><AlertCircle size={14}/>{error}</div>}
   {result&&<div className="import-success"><CheckCircle2 size={18}/><div><b>Dataset is live.</b><span>{result.brands} brands · {result.retailers} retailers · {result.products} products · {Number(result.salesRows||0).toLocaleString()} source observations · {Number(result.brandWeeks||0).toLocaleString()} brand-weeks</span><a href="/dashboard">Open live dashboard →</a></div></div>}
  </div>
 </section></AppShell>
}
