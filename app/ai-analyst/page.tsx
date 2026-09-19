"use client";
import {useState} from "react";import Link from "next/link";import {ArrowLeft,BrainCircuit,Send,Loader2,Sparkles} from "lucide-react";import {supabaseBrowser} from "../../lib/supabase-browser";
type Msg={role:"user"|"assistant";content:string};
export default function AIAnalyst(){const [input,setInput]=useState(""),[busy,setBusy]=useState(false),[msgs,setMsgs]=useState<Msg[]>([{role:"assistant",content:"I’m connected to the CPGist analytical layer. Ask about sales, brands, market share, distribution, pricing, anomalies, forecasts or scenarios."}]);
async function ask(q=input){if(!q.trim()||busy)return;setInput("");setBusy(true);const next=[...msgs,{role:"user" as const,content:q.trim()}];setMsgs(next);try{const {data:sessionData}=await supabaseBrowser().auth.getSession();if(!sessionData.session)throw new Error("Please sign in again.");const r=await fetch("/api/analyst",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${sessionData.session.access_token}`},body:JSON.stringify({messages:next.map(m=>({role:m.role,content:m.content}))})});const d=await r.json();const answer=d.choices?.[0]?.message?.content||d.error||"No analytical response returned.";setMsgs(x=>[...x,{role:"assistant",content:answer}]);}catch(e:any){setMsgs(x=>[...x,{role:"assistant",content:e.message||"Analyst request failed."}]);}finally{setBusy(false)}}
function Inline({text}:{text:string}){const parts=text.split(/(\\*\\*.*?\\*\\*)/g);return <>{parts.map((x,i)=>x.startsWith("**")&&x.endsWith("**")?<strong key={i}>{x.slice(2,-2)}</strong>:x)}</>}

function AnalystContent({text}:{text:string}){
  const lines=text.split("\\n"); const out:React.ReactNode[]=[]; let i=0;
  while(i<lines.length){
    const line=lines[i].trim();
    if(!line){i++;continue}
    if(line.startsWith("|")&&i+1<lines.length&&/^\\s*\\|?[-: ]+(\\|[-: ]+)+\\|?\\s*$/.test(lines[i+1])){
      const headers=line.split("|").slice(1,-1).map(x=>x.trim()); i+=2; const rows=[];
      while(i<lines.length&&lines[i].trim().startsWith("|")){rows.push(lines[i].split("|").slice(1,-1).map(x=>x.trim()));i++}
      out.push(<div className="analyst-table-wrap" key={i}><table className="analyst-table"><thead><tr>{headers.map((h,j)=><th key={j}><Inline text={h}/></th>)}</tr></thead><tbody>{rows.map((row,r)=><tr key={r}>{row.map((cell,j)=><td key={j}><Inline text={cell}/></td>)}</tr>)}</tbody></table></div>); continue
    }
    if(/^#{1,3}\\s/.test(line)){out.push(<h3 key={i}><Inline text={line.replace(/^#{1,3}\\s/,"")}/></h3>);i++;continue}
    if(/^[-*]\\s/.test(line)){const items=[];while(i<lines.length&&/^[-*]\\s/.test(lines[i].trim())){items.push(lines[i].trim().replace(/^[-*]\\s/,""));i++}out.push(<ul key={i}>{items.map((x,j)=><li key={j}><Inline text={x}/></li>)}</ul>);continue}
    if(/^>/.test(line)){out.push(<blockquote key={i}><Inline text={line.replace(/^>\\s?/,"")}/></blockquote>);i++;continue}
    out.push(<p key={i}><Inline text={line}/></p>);i++
  }
  return <div className="analyst-content">{out}</div>
}

const prompts=["What drove the latest sales movement?","Which brands are gaining or losing share?","Show me unusual weekly sales movements.","Forecast sales for the next 8 weeks.","What is the distribution situation by retailer?","Run a 5% price increase scenario."];return <div className="app"><aside className="sidebar"><div className="brand"><div className="logo">C</div><div><b>CPGist</b><small>CPG INTELLIGENCE</small></div></div><Link className="navitem" href="/dashboard"><ArrowLeft size={15}/>Dashboard</Link><Link className="navitem active" href="/ai-analyst"><BrainCircuit size={15}/>AI Analyst</Link><Link className="navitem" href="/import">Data Import</Link></aside><main className="main"><header><b>AI Analyst</b><div className="muted">Evidence-first CPG analysis</div></header><section className="content analyst-page"><div className="intro"><div><div className="muted">AI INTELLIGENCE</div><h1>Ask the CPGist AI Analyst</h1><p>Questions are translated into controlled analytical tools so quantitative answers come from your connected dataset.</p></div></div><div className="card analyst-chat">{msgs.map((m,i)=><div className={"chat-row "+m.role} key={i}><div className="chat-avatar">{m.role==="assistant"?<BrainCircuit size={14}/>:<Sparkles size={14}/>}</div><div className="chat-bubble">{m.role==="assistant"?<AnalystContent text={m.content}/>:m.content}</div></div>)}{busy&&<div className="chat-row assistant"><div className="chat-avatar"><BrainCircuit size={14}/></div><div className="chat-bubble"><Loader2 size={14} className="spin"/>Analyzing source evidence…</div></div>}</div><div className="prompt-grid">{prompts.map(p=><button key={p} onClick={()=>ask(p)} disabled={busy}>{p}</button>)}</div><div className="card analyst-input"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ask()}}} placeholder="Ask a business question about your CPG data…"/><button className="primary" onClick={()=>ask()} disabled={busy||!input.trim()}>{busy?<Loader2 size={15} className="spin"/>:<Send size={15}/>}Ask</button></div></section></main></div>}
