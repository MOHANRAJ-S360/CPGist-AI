"use client";
import {useState, type ReactNode} from "react";import Link from "next/link";import {ArrowLeft,BrainCircuit,Send,Loader2,Sparkles} from "lucide-react";import {supabaseBrowser} from "../../lib/supabase-browser";
type Msg={role:"user"|"assistant";content:string};
export default function AIAnalyst(){const [input,setInput]=useState(""),[busy,setBusy]=useState(false),[msgs,setMsgs]=useState<Msg[]>([{role:"assistant",content:"I’m connected to the CPGist analytical layer. Ask about sales, brands, market share, distribution, pricing, anomalies, forecasts or scenarios."}]);
async function ask(q=input){if(!q.trim()||busy)return;setInput("");setBusy(true);const next=[...msgs,{role:"user" as const,content:q.trim()}];setMsgs(next);try{const {data:sessionData}=await supabaseBrowser().auth.getSession();if(!sessionData.session)throw new Error("Please sign in again.");const r=await fetch("/api/analyst",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${sessionData.session.access_token}`},body:JSON.stringify({messages:next.map(m=>({role:m.role,content:m.content}))})});const d=await r.json();const answer=d.analyst?JSON.stringify(d.analyst):d.error||"No analytical response returned.";setMsgs(x=>[...x,{role:"assistant",content:answer}]);}catch(e:any){setMsgs(x=>[...x,{role:"assistant",content:e.message||"Analyst request failed."}]);}finally{setBusy(false)}}
function safeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value); } catch { return ""; }
}
function AnalystContent({text}:{text:string}){
  try{
    const a=JSON.parse(text);
    if(a?.headline&&a?.executiveTakeaway){
      const metrics=Array.isArray(a.metrics)?a.metrics.filter(Boolean):[];
      const columns=Array.isArray(a.table?.columns)?a.table.columns.map(safeText):[];
      const rows=Array.isArray(a.table?.rows)?a.table.rows.filter(Array.isArray):[];
      const sections=Array.isArray(a.sections)?a.sections.filter(Boolean):[];
      const warnings=Array.isArray(a.warnings)?a.warnings.filter(Boolean):[];
      return <div className="analyst-structured">
        <div className="analyst-kicker">{safeText(a.type||"ANALYSIS")}</div>
        <h3>{safeText(a.headline)}</h3>
        <p className="analyst-takeaway">{safeText(a.executiveTakeaway)}</p>
        {metrics.length>0&&<div className="analyst-metrics">{metrics.map((m:any,i:number)=><div className="analyst-metric" key={i}><span>{safeText(m?.label)}</span><strong>{safeText(m?.value)}</strong>{m?.change!==undefined&&m?.change!==null&&<small className={["positive","negative","neutral"].includes(String(m?.tone))?String(m.tone):"neutral"}>{safeText(m.change)}</small>}</div>)}</div>}
        {columns.length>0&&<div className="analyst-table-wrap"><table className="analyst-table"><thead><tr>{columns.map((col:string,i:number)=><th key={i}>{col}</th>)}</tr></thead><tbody>{rows.map((row:any[],ri:number)=><tr key={ri}>{columns.map((_:string,ci:number)=><td key={ci}>{safeText(row?.[ci])}</td>)}</tr>)}</tbody></table></div>}
        {sections.map((s:any,i:number)=><section className="analyst-section" key={i}><h4>{safeText(s?.title)}</h4>{Array.isArray(s?.bullets)&&<ul>{s.bullets.filter(Boolean).map((b:any,j:number)=><li key={j}>{safeText(b)}</li>)}</ul>}</section>)}
        {Array.isArray(a.decisionTrail)&&a.decisionTrail.length>0&&<div className="analyst-decision-trail"><strong>Decision trail</strong><ul>{a.decisionTrail.map((d:any,i:number)=><li key={i}><span className="decision-type">{safeText(d?.type)}</span>{safeText(d?.text)}</li>)}</ul></div>}{a.nextBestQuestion&&<div className="analyst-next-question"><strong>Next useful question</strong><p>{safeText(a.nextBestQuestion)}</p></div>}{warnings.length>0&&<div className="analyst-warning"><strong>Modeling notes</strong><ul>{warnings.map((w:any,i:number)=><li key={i}>{safeText(w)}</li>)}</ul></div>}
        {a.evidence&&<div className="analyst-evidence"><strong>Evidence</strong><span>{safeText(a.evidence?.source)}</span><span>{safeText(a.evidence?.period)}</span>{Number(a.evidence?.periodCount)>0&&<span>{safeText(a.evidence.periodCount)} periods</span>}</div>}
      </div>
    }
  }catch{}
  return <p>{safeText(text)}</p>
}

const prompts=["What drove the latest sales movement?","Which brands are gaining or losing share?","Show me unusual weekly sales movements.","Forecast sales for the next 8 weeks.","What is the distribution situation by retailer?","Run a 5% price increase scenario."];return <div className="app"><aside className="sidebar"><div className="brand"><div className="logo">C</div><div><b>CPGist</b><small>CPG INTELLIGENCE</small></div></div><Link className="navitem" href="/dashboard"><ArrowLeft size={15}/>Dashboard</Link><Link className="navitem active" href="/ai-analyst"><BrainCircuit size={15}/>AI Analyst</Link><Link className="navitem" href="/import">Data Import</Link></aside><main className="main"><header><b>AI Analyst</b><div className="muted">Evidence-first CPG analysis</div></header><section className="content analyst-page"><div className="intro"><div><div className="muted">AI INTELLIGENCE</div><h1>Ask the CPGist AI Analyst</h1><p>Questions are translated into controlled analytical tools so quantitative answers come from your connected dataset.</p></div></div><div className="card analyst-chat">{msgs.map((m,i)=><div className={"chat-row "+m.role} key={i}><div className="chat-avatar">{m.role==="assistant"?<BrainCircuit size={14}/>:<Sparkles size={14}/>}</div><div className="chat-bubble">{m.role==="assistant"?<AnalystContent text={m.content}/>:m.content}</div></div>)}{busy&&<div className="chat-row assistant"><div className="chat-avatar"><BrainCircuit size={14}/></div><div className="chat-bubble"><Loader2 size={14} className="spin"/>Analyzing source evidence…</div></div>}</div><div className="prompt-grid">{prompts.map(p=><button key={p} onClick={()=>ask(p)} disabled={busy}>{p}</button>)}</div><div className="card analyst-input"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ask()}}} placeholder="Ask a business question about your CPG data…"/><button className="primary" onClick={()=>ask()} disabled={busy||!input.trim()}>{busy?<Loader2 size={15} className="spin"/>:<Send size={15}/>}Ask</button></div></section></main></div>}
