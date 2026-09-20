"use client";
import {useEffect,useState} from "react";
import {BrainCircuit,Send,Loader2,Sparkles} from "lucide-react";
import {AppShell} from "../../components/app-shell";
import {supabaseBrowser} from "../../lib/supabase-browser";

type Msg={role:"user"|"assistant";content:string};
const safeText=(v:unknown)=>v==null?"":typeof v==="string"||typeof v==="number"||typeof v==="boolean"?String(v):(()=>{try{return JSON.stringify(v)}catch{return""}})();

function AnalystContent({text}:{text:string}){
 try{
  const a=JSON.parse(text);
  if(a?.headline&&a?.executiveTakeaway){
   const metrics=Array.isArray(a.metrics)?a.metrics.filter(Boolean):[],cols=Array.isArray(a.table?.columns)?a.table.columns.map(safeText):[],rows=Array.isArray(a.table?.rows)?a.table.rows.filter(Array.isArray):[],sections=Array.isArray(a.sections)?a.sections.filter(Boolean):[],warnings=Array.isArray(a.warnings)?a.warnings.filter(Boolean):[];
   return <div className="analyst-structured"><div className="analyst-kicker">{safeText(a.type||"ANALYSIS")}</div><h3>{safeText(a.headline)}</h3><p className="analyst-takeaway">{safeText(a.executiveTakeaway)}</p>
    {metrics.length>0&&<div className="analyst-metrics">{metrics.map((m:any,i:number)=><div className="analyst-metric" key={i}><span>{safeText(m?.label)}</span><strong>{safeText(m?.value)}</strong>{m?.change!=null&&<small className={["positive","negative","neutral"].includes(String(m?.tone))?String(m.tone):"neutral"}>{safeText(m.change)}</small>}</div>)}</div>}
    {cols.length>0&&<div className="analyst-table-wrap"><table className="analyst-table"><thead><tr>{cols.map((c:string,i:number)=><th key={i}>{c}</th>)}</tr></thead><tbody>{rows.map((row:any[],ri:number)=><tr key={ri}>{cols.map((_:string,ci:number)=><td key={ci}>{safeText(row?.[ci])}</td>)}</tr>)}</tbody></table></div>}
    {sections.map((s:any,i:number)=><section className="analyst-section" key={i}><h4>{safeText(s?.title)}</h4>{Array.isArray(s?.bullets)&&<ul>{s.bullets.filter(Boolean).map((b:any,j:number)=><li key={j}>{safeText(b)}</li>)}</ul>}</section>)}
    {warnings.length>0&&<div className="analyst-warning"><strong>Modeling notes</strong><ul>{warnings.map((w:any,i:number)=><li key={i}>{safeText(w)}</li>)}</ul></div>}
    {a.evidence&&<div className="analyst-evidence"><strong>Evidence</strong><span>{safeText(a.evidence?.source)}</span><span>{safeText(a.evidence?.period)}</span></div>}
   </div>
  }
 }catch{}
 return <p>{safeText(text)}</p>
}

export default function AIAnalyst(){
 const [input,setInput]=useState(""),[busy,setBusy]=useState(false),[brandScope,setBrandScope]=useState(""),[brandName,setBrandName]=useState(""),[msgs,setMsgs]=useState<Msg[]>([{role:"assistant",content:"I’m connected to the CPGist analytical layer. Ask about sales, brands, market share, distribution, pricing, anomalies, forecasts or scenarios."}]);
 useEffect(()=>{const id=new URLSearchParams(window.location.search).get("brand_id");if(!id)return;setBrandScope(id);(async()=>{try{const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session)return;const r=await fetch("/api/explorer?entity=brand&id="+encodeURIComponent(id),{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});const d=await r.json();if(d?.brand?.name)setBrandName(String(d.brand.name))}catch{}})()},[]);
 async function ask(q=input){if(!q.trim()||busy)return;setInput("");setBusy(true);const next=[...msgs,{role:"user" as const,content:q.trim()}];setMsgs(next);try{const {data:sessionData}=await supabaseBrowser().auth.getSession();if(!sessionData.session)throw new Error("Please sign in again.");const r=await fetch("/api/analyst",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+sessionData.session.access_token},body:JSON.stringify({messages:next.map(m=>({role:m.role,content:m.content})),scope:brandScope?{brandId:brandScope}:undefined})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Analyst request failed.");setMsgs(x=>[...x,{role:"assistant",content:d.analyst?JSON.stringify(d.analyst):"No analytical response returned."}]);}catch(e:any){setMsgs(x=>[...x,{role:"assistant",content:e?.message||"Analyst request failed."}])}finally{setBusy(false)}}
 const prompts=["What drove the latest sales movement?","Which brands are gaining or losing share?","Show me unusual weekly sales movements.","Forecast sales for the next 8 weeks.","What is the distribution situation by retailer?","Run a 5% price increase scenario."];
 return <AppShell title="AI Analyst" subtitle="Evidence-first CPG analysis"><section className="content analyst-page"><div className="intro"><div><div className="muted">AI INTELLIGENCE</div><h1>Ask the CPGist AI Analyst</h1>{brandScope&&<div className="scope-badge"><strong>Brand scope locked</strong><span>ID {brandScope}</span></div>}<p>Questions are translated into controlled analytical tools so quantitative answers come from your connected dataset.</p></div>{brandScope&&<div className="scope-badge">Focused on <b>{brandName||"selected brand"}</b></div>}</div>
  <div className="card analyst-chat">{msgs.map((m,i)=><div className={"chat-row "+m.role} key={i}><div className="chat-avatar">{m.role==="assistant"?<BrainCircuit size={14}/>:<Sparkles size={14}/>}</div><div className="chat-bubble">{m.role==="assistant"?<AnalystContent text={m.content}/>:m.content}</div></div>)}{busy&&<div className="chat-row assistant"><div className="chat-avatar"><BrainCircuit size={14}/></div><div className="chat-bubble"><Loader2 size={14} className="spin"/> Analyzing source evidence…</div></div>}</div>
  <div className="prompt-grid">{prompts.map(p=><button key={p} onClick={()=>setInput(p)} disabled={busy}>{p}</button>)}</div>
  <div className="card analyst-input"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ask()}}} placeholder="Ask a business question about your CPG data…"/><button className="primary" onClick={()=>ask()} disabled={busy||!input.trim()}>{busy?<Loader2 size={15} className="spin"/>:<Send size={15}/>}Ask</button></div>
 </section></AppShell>
}
