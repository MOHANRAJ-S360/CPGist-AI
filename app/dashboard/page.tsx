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
 async function load(){setLoading(true);try{const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session){location.href="/";return}const r=await fetch("/api/dashboard?source=syndicate",{headers:{Authorization:"Bearer "+session.access_token}});setD(await r.json())}catch(e:any){setD({error:e.message})}finally{setLoading(false)}}
 useEffect(()=>{load()},[]);
 if(loading)return <AppShell title="Dashboard" subtitle="Executive CPG performance"><section className="content"><div className="card panel loading-card">Loading live market intelligence…</div></section></AppShell>;
 if(d?.error)return <AppShell title="Dashboard"><section className="content"><div className="card panel error-card">{d.error}</div></section></AppShell>;
 return <AppShell title="Dashboard" subtitle="Executive CPG performance"><section className="content">
  <div className="intro"><div><div className="muted">LIVE PORTFOLIO WORKSPACE</div><h1>Executive overview</h1><p>Source coverage {d.periods?.[0]||"—"} → {d.periods?.[d.periods.length-1]||"—"}</p></div><div className="dashboard-actions"><button className="secondary-btn" onClick={load}><RefreshCw size={14}/>Refresh</button><Link className="primary" href="/reports"><FileText size={14}/>Client report</Link></div></div>
  <div className="kpis"><div className="card kpi"><span>Observed sales</span><strong>{money(d.totalSales)}</strong><small className={(d.growth||0)>=0?"positive":"negative"}>{(d.growth||0)>=0?<ArrowUpRight size={13}/>:<ArrowDownRight size={13}/>} {d.growth==null?"—":pct(Number(d.growth)*100)} vs prior week</small></div><div className="card kpi"><span>Units</span><strong>{new Intl.NumberFormat().format(d.totalUnits||0)}</strong><small>Observed source volume</small></div><div className="card kpi"><span>Avg. ACV distribution</span><strong>{d.avgDistribution==null?"—":d.avgDistribution.toFixed(1)+"%"}</strong><small>Source observations</small></div><div className="card kpi"><span>Promo rate</span><strong>{d.promoRate==null?"—":d.promoRate.toFixed(1)+"%"}</strong><small>Observed promotional activity</small></div></div>
  <div className="two-col"><div className="card panel"><div className="panel-head"><div><b>Market value trend</b><span>Weekly sales across the source period</span></div><BarChart3 size={17}/></div><LineChart points={(d.weekly||[]).slice(-26).map((x:any)=>({label:x.label,value:x.sales}))}/></div><div className="card panel"><div className="panel-head"><div><b>Brand share structure</b><span>Observed value sales</span></div></div><div className="share-focus"><Donut share={Number(d.topBrands?.[0]?.share||0)} centerLabel="leader share"/><div><strong>{d.topBrands?.[0]?.name||"—"}</strong><p>{money(d.topBrands?.[0]?.sales||0)}</p><span>Share is descriptive; read it with growth and distribution.</span></div></div></div></div>
  <div className="two-col"><div className="card panel"><div className="panel-head"><div><b>Brand performance</b><span>Value sales ranking</span></div></div><BarChart items={(d.topBrands||[]).slice(0,8).map((x:any)=>({label:x.name,value:x.sales}))}/></div><div className="card panel"><div className="panel-head"><div><b>Decision pulse</b><span>Same evidence layer used by AI Analyst and Reports</span></div><BrainCircuit size={17}/></div><div className="insight purple"><div><ShieldCheck size={15}/>Evidence-first workspace</div><p>Use the Analyst for diagnosis, retailer whitespace, pricing, promotion, anomalies, forecasts and scenarios. Reports turns the same source facts into client-ready PDF and PowerPoint.</p><Link href="/ai-analyst">Open AI Analyst →</Link></div></div></div>
 </section></AppShell>;
}
