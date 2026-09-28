"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {Database,UploadCloud,CheckCircle2,AlertCircle,Loader2} from "lucide-react";
import {AppShell} from "../../components/app-shell";
import {supabaseBrowser} from "../../lib/supabase-browser";
import {getImportState,subscribeImport,startDatasetImport} from "../../lib/import-manager";

export default function ImportPage(){
 const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(()=>getImportState().busy),[status,setStatus]=useState(()=>getImportState().status),[result,setResult]=useState<any>(()=>getImportState().result),[error,setError]=useState(()=>getImportState().error);
 useEffect(()=>{
  const unsubscribe=subscribeImport(s=>{setBusy(s.busy);setStatus(s.status);setResult(s.result);setError(s.error);window.dispatchEvent(new CustomEvent("cpgist:import-busy",{detail:s.busy}));}); return()=>{unsubscribe();};
 },[]);
 useEffect(()=>{
  const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};
  if(busy)window.addEventListener("beforeunload",warn);
  return()=>window.removeEventListener("beforeunload",warn);
 },[busy]);
 async function run(){
  if(!file||busy)return;
  setError("");setResult(null);
  startDatasetImport(supabaseBrowser(),file).catch(()=>{});
 }

 return <AppShell title="Data Import" subtitle="Load the CPGist client dataset">
  <section className="content">
   <div className="intro"><div><div className="muted">SOURCE INGESTION · IMPORTER V2</div><h1>Load CPGist Free Dataset</h1><p>Upload the current CPGist Free Dataset. The importer keeps Postgres compact by loading client-ready dimensions, weekly aggregates, product master and 13-week product/retailer summaries. The source archive remains your full analytical package.</p></div></div>
   <div className="card import-card">
    <div className="import-icon"><UploadCloud size={28}/></div><h2>Upload CPGist dataset</h2>
    <label className="dropzone"><input type="file" accept=".zip" onChange={e=>{setFile(e.target.files?.[0]||null);setError("");setResult(null)}}/><strong>{file?file.name:"Choose CPGist_Supabase_Free_Dataset.zip"}</strong><span>{file?((file.size/1024/1024).toFixed(1)+" MB selected"):"ZIP up to 200 MB · processed in a background worker · expected latest week: Sep 19, 2026"}</span></label>
    <button className="primary import-btn" disabled={!file||busy} onClick={run}>{busy?<><Loader2 size={15} className="spin"/>Processing…</>:<><UploadCloud size={15}/>Validate & import</>}</button>
    {status&&<div className="form-message"><Loader2 size={14} className={busy?"spin":""}/>{status}</div>}
    {error&&<div className="form-error"><AlertCircle size={14}/>{error}</div>}
    {result&&<div className="import-success"><CheckCircle2 size={18}/><div><b>Current dataset is live.</b><span>{result.brands?.toLocaleString?.()||0} brands · {result.retailers?.toLocaleString?.()||0} retailers · {result.products?.toLocaleString?.()||0} products · {result.categories?.toLocaleString?.()||0} categories · {result.regions?.toLocaleString?.()||0} regions</span><span>{result.csvFiles?.toLocaleString?.()||0} CSV files · {result.periods?.toLocaleString?.()||0} weekly periods · {result.periodStart||"—"} → {result.periodEnd||"—"}</span><Link href="/dashboard">Open live dashboard →</Link></div></div>}
   </div>
  </section>
 </AppShell>
}
