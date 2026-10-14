"use client";

import {useState} from "react";
import {ArrowLeft,Upload,CheckCircle2,AlertTriangle,FileSpreadsheet} from "lucide-react";
import Link from "next/link";
import {supabaseBrowser} from "../../lib/supabase-browser";

export default function IngestPage(){
 const [file,setFile]=useState<File|null>(null),[result,setResult]=useState<any>(null),[loading,setLoading]=useState(false),[error,setError]=useState(""),[organizationId,setOrganizationId]=useState("");

 async function inspect(){
  if(!file||!organizationId.trim())return;
  setLoading(true);setError("");setResult(null);
  try{
   const fd=new FormData();fd.append("file",file);fd.append("organizationId",organizationId.trim());
   const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session)throw new Error("Please sign in again.");const res=await fetch("/api/ingest",{method:"POST",headers:{Authorization:"Bearer "+session.access_token},body:fd});const data=await res.json();
   if(!res.ok)setError(data.error||"Could not import file.");else setResult(data);
  }catch(e:any){setError(e?.message||"Unable to reach the ingestion service.");}finally{setLoading(false);}
 }

 return <div className="app"><main className="main" style={{marginLeft:0}}><header><Link href="/" className="navitem"><ArrowLeft size={16}/>Dashboard</Link><b>Data ingestion</b></header><section className="content">
  <div className="intro"><div><div className="muted">CPG data platform</div><h1>Import data</h1><p>Upload CSV or XLSX sales data into the canonical CPG model.</p></div></div>
  <div className="card panel"><div style={{display:"grid",gap:12}}>
   <div style={{display:"flex",alignItems:"center",gap:10}}><FileSpreadsheet size={28}/><div><b>{file?file.name:"Choose a sales file"}</b><span className="sub">{file?(file.size/1024).toFixed(1)+" KB selected":"CSV, XLS or XLSX with period, sales and units."}</span></div></div>
   <input value={organizationId} onChange={e=>setOrganizationId(e.target.value)} placeholder="Organization ID (UUID)" style={{padding:"10px 12px",borderRadius:8,border:"1px solid var(--line)",background:"transparent",color:"inherit",width:"100%"}}/>
   <div style={{display:"flex",gap:10,alignItems:"center"}}>
    <label className="primary"><Upload size={14}/>Choose file<input hidden type="file" accept=".csv,.xls,.xlsx" onChange={e=>{setFile(e.target.files?.[0]||null);setResult(null);setError("")}}/></label>
    {file&&organizationId&&<button className="select" onClick={inspect} disabled={loading}>{loading?"Importing…":"Import & validate"}</button>}
   </div>
  </div></div>
  {error&&<div className="card response"><AlertTriangle size={15}/><p>{error}</p></div>}
  {result&&<><div className="kpis">
   <div className="card kpi"><div className="muted">Rows detected</div><strong>{result.rowCount.toLocaleString()}</strong></div>
   <div className="card kpi"><div className="muted">Rows imported</div><strong>{result.rowsInserted.toLocaleString()}</strong></div>
   <div className="card kpi"><div className="muted">Rows rejected</div><strong>{result.rowsRejected.toLocaleString()}</strong></div>
   <div className="card kpi"><div className="muted">Required fields</div><strong>{result.missingRequired?.length===0?"Ready":"Missing"}</strong></div>
  </div>
  <div className="card panel"><div className="panel-head"><div><b>Canonical mapping</b><span>Source columns mapped into the CPG data model.</span></div>{result.missingRequired?.length===0?<span className="positive"><CheckCircle2 size={14}/> Validation passed</span>:<span className="negative"><AlertTriangle size={14}/> Missing required fields</span>}</div>
   <table><thead><tr><th>CANONICAL FIELD</th><th>SOURCE COLUMN</th></tr></thead><tbody>{(result.mapping||[]).map((m:any)=><tr key={m.canonical}><td>{m.canonical}</td><td>{m.source}</td></tr>)}{(result.missingRequired||[]).map((m:string)=><tr key={m}><td>{m}</td><td className="negative">Not found</td></tr>)}</tbody></table>
  </div>
  <div className="card response"><CheckCircle2 size={15}/><p><b>Import complete:</b> {result.rowsInserted.toLocaleString()} rows were written to sales facts and {result.rowsRejected.toLocaleString()} were rejected during normalization. Source and ingestion-run metadata were recorded.</p></div>
  </>}
 </section></main></div>;
}