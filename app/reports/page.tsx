"use client";
import {useEffect,useState} from "react";
import {Download,FileText,Presentation,RefreshCw,ShieldCheck,TrendingUp} from "lucide-react";
import {AppShell} from "../../components/app-shell";
import {BarChart,Donut,LineChart} from "../../components/cpg-charts";
import {supabaseBrowser} from "../../lib/supabase-browser";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}).format(n||0);
const pct=(n:number)=>(n>=0?"+":"")+n.toFixed(1)+"%";

export default function Reports(){
 const [d,setD]=useState<any>(null),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);try{const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session)throw new Error("Please sign in again.");const r=await fetch("/api/dashboard",{headers:{Authorization:"Bearer "+session.access_token}});const x=await r.json();if(!r.ok)throw new Error(x.error||"Report data failed.");setD(x)}catch(e:any){setD({error:e.message})}finally{setLoading(false)}}
 useEffect(()=>{load()},[]);
 function printPdf(){window.print()}
 function powerpoint(){window.alert("PowerPoint export is being finalized in the next export module. The report data shown here is already source-anchored.")}
 if(loading)return <AppShell title="Reports" subtitle="Decision-ready client reporting"><section className="content"><div className="card panel loading-card">Building report from live source data…</div></section></AppShell>;
 if(d?.error)return <AppShell title="Reports"><section className="content"><div className="card panel error-card">{d.error}</div></section></AppShell>;
 const lead=(d.topBrands||[])[0];
 return <AppShell title="Reports" subtitle="Decision-ready client reporting"><section className="content">
  <div className="report-hero card"><div><div className="eyebrow">EXECUTIVE REPORTING</div><h1>CPGist Executive Market Performance Review</h1><p>Market context → performance → competitive structure → implications, with quantitative figures tied to the connected dataset.</p><div className="report-meta"><span><ShieldCheck size={14}/>Source-anchored</span><span><TrendingUp size={14}/>Quantitative story</span><span><FileText size={14}/>Client-ready</span></div></div><div className="report-actions"><button className="primary" onClick={powerpoint}><Presentation size={16}/>PowerPoint</button><button className="secondary-btn" onClick={printPdf}><Download size={16}/>PDF / Print</button><button className="icon-btn report-refresh" onClick={load}><RefreshCw size={16}/></button></div></div>
  <div className="report-grid-kpis"><div className="card kpi"><span>Net sales</span><strong>{money(d.totalSales)}</strong><small>{pct(Number(d.growth||0)*100)} vs prior week</small></div><div className="card kpi"><span>Units</span><strong>{new Intl.NumberFormat().format(d.totalUnits||0)}</strong><small>Observed volume</small></div><div className="card kpi"><span>Distribution</span><strong>{d.avgDistribution==null?"—":d.avgDistribution.toFixed(1)+"%"}</strong><small>Average ACV</small></div><div className="card kpi"><span>Periods</span><strong>{d.periods?.length||0}</strong><small>Weekly source periods</small></div></div>
  <div className="two-col"><div className="card panel"><div className="panel-head"><div><b>Market value trend</b><span>Last 26 completed source periods</span></div></div><LineChart points={(d.weekly||[]).slice(-26).map((x:any)=>({label:x.label,value:x.sales}))}/></div><div className="card panel"><div className="panel-head"><div><b>Brand concentration</b><span>Observed value share</span></div></div><div className="share-focus"><Donut share={Number(lead?.share||0)} centerLabel="leader share"/><div><strong>{lead?.name||"—"}</strong><p>{money(lead?.sales||0)}</p><span>Descriptive share, not causal.</span></div></div></div></div>
  <div className="two-col"><div className="card panel"><div className="panel-head"><div><b>Brand performance</b><span>Value sales ranking</span></div></div><BarChart items={(d.topBrands||[]).slice(0,8).map((x:any)=>({label:x.name,value:x.sales}))}/></div><div className="card panel"><div className="panel-head"><div><b>Executive story</b><span>Numbers first, narrative second</span></div></div><div className="story-grid"><div><span>01 · OBSERVE</span><h3>Market movement</h3><p>Observed sales are {money(d.totalSales)} with weekly movement of {pct(Number(d.growth||0)*100)} versus the prior week.</p></div><div><span>02 · DIAGNOSE</span><h3>Competitive structure</h3><p>{lead?.name||"The leading brand"} represents {Number(lead?.share||0).toFixed(1)}% of observed value sales.</p></div><div><span>03 · ACT</span><h3>Next decision</h3><p>Use AI Analyst to move from descriptive reporting into diagnosis, scenarios, anomalies and retailer questions.</p></div></div></div></div>
  <div className="report-footnote">Source: {d.source||"syndicate"} · Coverage: {d.periods?.[0]||"—"} → {d.periods?.[d.periods.length-1]||"—"} · Original CPGist report.</div>
 </section></AppShell>
}
