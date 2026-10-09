"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowDownRight,ArrowUpRight,BarChart3,BrainCircuit,FileText,RefreshCw,ShieldCheck} from "lucide-react";
import {AppShell} from "../../components/app-shell";
import {BarChart,Donut,LineChart} from "../../components/cpg-charts";
import {supabaseBrowser} from "../../lib/supabase-browser";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}).format(n||0);
const pct=(n:number)=> (n>=0?"+":"")+n.toFixed(1)+"%";

export default function Dashboard(){
 const [d,setD]=useState<any>(null),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);try{const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session){location.href="/";return}const r=await fetch("/api/dashboard",{headers:{Authorization:"Bearer "+session.access_token}});setD(await r.json())}catch(e:any){setD({error:e.message})}finally{setLoading(false)}}
 useEffect(()=>{load()},[]);
 if(loading)return <AppShell title="Dashboard" subtitle="Executive CPG performance"><section className="content"><div className="card panel loading-card">Loading live market intelligence…</div></section></AppShell>;
 if(d?.error)return <AppShell title="Dashboard"><section className="content"><div className="card panel error-card">{d.error}</div></section></AppShell>;
 return <AppShell title="Dashboard" subtitle="Executive CPG performance">
  <section className="content">
   <div className="intro"><div><div className="muted">LIVE PORTFOLIO WORKSPACE</div><h1>Executive overview</h1><p>Latest 13-week performance window · source coverage {d.periodStart} → {d.periodEnd} · <b>{d.compactDataset?"CPGist Free Dataset":"Legacy Syndicate Dataset"}</b></p></div><div className="dashboard-actions"><button className="secondary-btn" onClick={load}><RefreshCw size={14}/>Refresh</button><Link className="primary" href="/reports"><FileText size={14}/>Client report</Link></div></div>
   <div className="kpis">
    <div className="card kpi"><span>Latest 13W sales</span><strong>{money(d.totalSales)}</strong><small className={d.growth>=0?"positive":"negative"}>{d.growth>=0?<ArrowUpRight size={13}/>:<ArrowDownRight size={13}/>} {pct(Number(d.growth||0)*100)} vs prior 13W</small></div>
    <div className="card kpi"><span>Units</span><strong>{new Intl.NumberFormat().format(d.totalUnits)}</strong><small>Source volume in latest 13W</small></div>
    <div className="card kpi"><span>Avg. ACV distribution</span><strong>{d.avgDistribution==null?"—":d.avgDistribution.toFixed(1)+"%"}</strong><small>Across source observations</small></div>
    <div className="card kpi"><span>Promo rate</span><strong>{d.promoRate==null?"Not available":d.promoRate.toFixed(1)+"%"}</strong><small>{d.promoRate==null?"Promotion rate is not present in this dataset scope":"Observed promotional activity"}</small></div>
   </div>
   {d.provenance?.label&&<div className="data-provenance synthetic"><ShieldCheck size={13}/><b>Projection status</b><span>{d.provenance.label}. Latest 13W: {d.provenance.latest13ProjectedWeeks} projected / {d.provenance.latest13ActualWeeks} observed; prior 13W: {d.provenance.prior13ProjectedWeeks} projected / {d.provenance.prior13ActualWeeks} observed. Growth is a source-window comparison, not observed-only performance.</span></div>}
   <div className="two-col">
    <div className="card panel"><div className="panel-head"><div><b>Market value trend</b><span>Weekly sales · last 26 source periods</span></div><BarChart3 size={17}/></div><LineChart points={(d.weekly||[]).slice(-26).map((x:any)=>({label:x.label,value:x.sales}))}/></div>
    <div className="card panel"><div className="panel-head"><div><b>Brand market sales structure</b><span>Latest 13-week source-window sales</span></div></div><div className="share-focus"><Donut share={Number(d.topBrands?.[0]?.share||0)} centerLabel="leader share"/><div><strong>{d.topBrands?.[0]?.name||"—"}</strong><p>{money(d.topBrands?.[0]?.sales||0)} · {d.topBrands?.[0]?.growth==null?"—":pct(Number(d.topBrands[0].growth)*100)}</p><span>Share is descriptive; combine with growth and distribution.</span></div></div></div>
   </div>
   <div className="two-col">
    <div className="card panel"><div className="panel-head"><div><b>Brand performance</b><span>Value sales with period comparison</span></div></div><BarChart items={(d.topBrands||[]).slice(0,8).map((x:any)=>({label:x.name,value:x.sales,change:x.growth}))}/></div>
    <div className="card panel"><div className="panel-head"><div><b>Category performance</b><span>Latest 13W vs prior 13W</span></div></div><BarChart items={(d.categories||[]).slice(0,8).map((x:any)=>({label:x.name,value:x.sales,change:x.growth}))}/></div>
   </div>
   <div className="two-col">
    <div className="card panel"><div className="panel-head"><div><b>Retailer performance</b><span>Latest 13-week source value sales</span></div></div><table><thead><tr><th>RETAILER</th><th>SALES</th><th>GROWTH</th></tr></thead><tbody>{(d.retailers||[]).slice(0,8).map((x:any)=><tr key={x.id}><td>{x.name}</td><td>{money(x.sales)}</td><td className={x.growth>=0?"positive":"negative"}>{pct(Number(x.growth||0)*100)}</td></tr>)}</tbody></table></div>
    <div className="card panel"><div className="panel-head"><div><b>AI decision pulse</b><span>Same evidence layer used by reports</span></div><BrainCircuit size={17}/></div><div className="insight purple"><div><ShieldCheck size={15}/>Evidence-first workspace</div><p>CPGist keeps the story anchored to source periods, exact metrics and explicit limitations. Use the Analyst when the next question needs diagnosis, retailer whitespace, price, promotion, anomalies or scenarios.</p><Link href="/ai-analyst">Open AI Analyst →</Link></div></div>
   </div>
  </section>
 </AppShell>
}
