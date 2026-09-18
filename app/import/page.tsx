"use client";
import {useState} from "react";
import Link from "next/link";
import {Database,UploadCloud,CheckCircle2,AlertCircle,ArrowLeft,Loader2} from "lucide-react";
import {supabaseBrowser} from "../../lib/supabase-browser";
import {importSyndicateZip} from "../../lib/syndicate-import";

export default function ImportPage(){
 const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState(""),[result,setResult]=useState<any>(null),[error,setError]=useState("");
 async function run(){
  if(!file)return;
  setBusy(true);setError("");setResult(null);
  try{
   const sb=supabaseBrowser();
   const {data:{session}}=await sb.auth.getSession();
   if(!session)throw new Error("Please sign in first.");
   setStatus("Starting secure browser import…");
   const r=await importSyndicateZip(sb,file,setStatus);
   setResult(r);setStatus("Import completed successfully.");
  }catch(e:any){setError(e?.message||"Import failed. You can retry safely; the import is idempotent.");setStatus("");}
  finally{setBusy(false);}
 }
 return <div className="app"><aside className="sidebar"><div className="brand"><div className="logo">C</div><div><b>CPGist</b><small>CPG INTELLIGENCE</small></div></div><Link className="navitem" href="/dashboard"><ArrowLeft size={15}/>Dashboard</Link><Link className="navitem active" href="/import"><Database size={15}/>Data Import</Link></aside>
 <main className="main"><header><b>Data Import</b></header><section className="content"><div className="intro"><div><div className="muted">Source ingestion</div><h1>Load the Syndicate dataset</h1><p>CPGist validates the supplied ZIP and processes the large sales file locally in safe batches, avoiding Edge Function timeouts.</p></div></div>
 <div className="card import-card"><div className="import-icon"><UploadCloud size={28}/></div><h2>Upload Syndicate data</h2><p>Accepted: the supplied ZIP containing 110 brands, 200 retailers, 440 products and 1,515,488 sales observations. The raw sales file is processed in your browser; only compact weekly aggregates are sent to Supabase.</p>
 <label className="dropzone"><input type="file" accept=".zip" onChange={e=>{setFile(e.target.files?.[0]||null);setError("");setResult(null)}}/><strong>{file?file.name:"Choose dataset file"}</strong><span>{file?((file.size/1024/1024).toFixed(1)+" MB selected"):"Click to browse from your computer"}</span></label>
 <button className="primary import-btn" disabled={!file||busy} onClick={run}>{busy?<><Loader2 size={15} className="spin"/>Processing…</>:<><UploadCloud size={15}/>Validate & import</>}</button>
 {status&&<div className="form-message"><Loader2 size={14} className={busy?"spin":""}/>{status}</div>}
 {error&&<div className="form-error"><AlertCircle size={14}/>{error}</div>}
 {result&&<div className="import-success"><CheckCircle2 size={18}/><div><b>Dataset is live.</b><span>{result.brands} brands · {result.retailers} retailers · {result.products} products · {result.salesRows.toLocaleString()} source observations · {result.brandWeeks.toLocaleString()} brand-weeks</span><Link href="/dashboard">Open live dashboard →</Link></div></div>}
 </div></section></main></div>
}