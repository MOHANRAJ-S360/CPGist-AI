"use client";
import {useEffect,useState} from "react";
import {ArrowDownRight,ArrowUpRight,CheckCircle2,Clock3,Target,TriangleAlert} from "lucide-react";
import {AppShell} from "./app-shell";
import {BarChart,LineChart} from "./cpg-charts";
import {supabaseBrowser} from "../lib/supabase-browser";

const money=(n:unknown)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}).format(Number(n)||0);
const num=(n:unknown)=>Number.isFinite(Number(n))?Number(n):0;
const pct=(n:unknown)=>(num(n)>=0?"+":"")+num(n).toFixed(1)+"%";
const titles:Record<string,[string,string]>={
 brands:["Brands","Brand performance and share"],retailers:["Retailers","Account and channel performance"],
 categories:["Categories","Category growth and structure"],market:["Market","Market pulse and competitive context"],
 workflows:["Workflows","Repeatable decision workflows"],alerts:["Alerts","Evidence-based performance signals"]
};

export default function WorkspaceSection({section}:{section:string}){
 const [d,setD]=useState<any>(null);
 const meta=titles[section]||["Workspace","CPG intelligence workspace"];
 useEffect(()=>{let cancelled=false;(async()=>{try{
  const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session){location.href="/";return}
  const r=await fetch("/api/dashboard?source=syndicate",{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
  const json=await r.json();if(!cancelled)setD(json);
 }catch(e:any){if(!cancelled)setD({error:e?.message||"Workspace data failed."})}})();return()=>{cancelled=true}},[]);
 const [title,subtitle]=meta;
 if(!d)return <AppShell title={title} subtitle={subtitle}><section className="content"><div className="card panel loading-card">Loading live workspace data…</div></section></AppShell>;
 if(d.error)return <AppShell title={title} subtitle={subtitle}><section className="content"><div className="card panel error-card">{String(d.error)}</div></section></AppShell>;
 const brands=Array.isArray(d.topBrands)?d.topBrands:[], retailers=Array.isArray(d.retailers)?d.retailers:[], categories=Array.isArray(d.categories)?d.categories:[], weekly=Array.isArray(d.weekly)?d.weekly:[];
 const latest=weekly.at(-1)?.period||d.periodEnd||"—";
 let body:React.ReactNode;
 if(section==="brands")body=<>
  <div className="two-col"><div className="card panel"><div className="panel-head"><div><b>Brand value ranking</b><span>Latest 13-week observed sales</span></div></div><BarChart items={brands.map((x:any)=>({label:String(x.name||"Unnamed brand"),value:num(x.sales),change:num(x.growth)}))}/></div>
  <div className="card panel"><div className="panel-head"><div><b>Market trend</b><span>Weekly observed value sales</span></div></div><LineChart points={weekly.slice(-26).map((x:any)=>({label:String(x.label||x.period||""),value:num(x.sales)}))}/></div></div>
  <div className="card panel"><div className="panel-head"><div><b>Brand scorecard</b><span>Sales, share and 13-week growth</span></div></div><table><thead><tr><th>BRAND</th><th>SALES</th><th>SHARE</th><th>GROWTH</th></tr></thead><tbody>{brands.map((x:any)=><tr key={String(x.id??x.name)}><td>{String(x.name||"Unnamed brand")}</td><td>{money(x.sales)}</td><td>{num(x.share).toFixed(1)}%</td><td className={num(x.growth)>=0?"positive":"negative"}>{num(x.growth)>=0?<ArrowUpRight size={13}/>:<ArrowDownRight size={13}/>} {pct(x.growth)}</td></tr>)}</tbody></table></div>
 </>;
 else if(section==="retailers")body=<div className="two-col"><div className="card panel"><div className="panel-head"><div><b>Retailer value ranking</b><span>Latest 13-week observed sales</span></div></div><BarChart items={retailers.slice(0,10).map((x:any)=>({label:String(x.name||"Unnamed retailer"),value:num(x.sales),change:num(x.growth)}))}/></div><div className="card panel"><div className="panel-head"><div><b>Account performance</b><span>Latest 13 weeks vs prior 13 weeks</span></div></div><table><thead><tr><th>RETAILER</th><th>SALES</th><th>GROWTH</th></tr></thead><tbody>{retailers.slice(0,12).map((x:any)=><tr key={String(x.id??x.name)}><td>{String(x.name||"Unnamed retailer")}</td><td>{money(x.sales)}</td><td className={num(x.growth)>=0?"positive":"negative"}>{pct(x.growth)}</td></tr>)}</tbody></table></div></div>;
 else if(section==="categories")body=<div className="two-col"><div className="card panel"><div className="panel-head"><div><b>Category growth map</b><span>Latest 13-week observed sales</span></div></div><BarChart items={categories.map((x:any)=>({label:String(x.name||"Unclassified"),value:num(x.sales),change:num(x.growth)}))}/></div><div className="card panel"><div className="panel-head"><div><b>Category signals</b><span>Value sales and growth</span></div></div><table><thead><tr><th>CATEGORY</th><th>SALES</th><th>GROWTH</th></tr></thead><tbody>{categories.map((x:any)=><tr key={String(x.name)}><td>{String(x.name||"Unclassified")}</td><td>{money(x.sales)}</td><td className={num(x.growth)>=0?"positive":"negative"}>{pct(x.growth)}</td></tr>)}</tbody></table></div></div>;
 else if(section==="market")body=<><div className="report-grid-kpis"><div className="card kpi"><span>Market sales</span><strong>{money(d.totalSales)}</strong><small>Latest 13 weeks</small></div><div className="card kpi"><span>13W growth</span><strong>{pct(d.growth)}</strong><small>vs prior 13 weeks</small></div><div className="card kpi"><span>Avg distribution</span><strong>{d.avgDistribution==null?"—":num(d.avgDistribution).toFixed(1)+"%"}</strong><small>ACV</small></div><div className="card kpi"><span>Latest period</span><strong>{latest}</strong><small>completed source period</small></div></div><div className="card panel"><div className="panel-head"><div><b>Market value trend</b><span>Weekly observed sales</span></div></div><LineChart points={weekly.slice(-52).map((x:any)=>({label:String(x.label||x.period||""),value:num(x.sales)}))}/></div></>;
 else if(section==="workflows")body=<div className="workflow-grid">{[["Category growth review","Scan category growth, brand share, distribution and retailer whitespace.","Run in AI Analyst","/ai-analyst"],["Executive market review","Build a client-ready PDF and PowerPoint from the same source facts.","Open Reports","/reports"],["Data quality review","Check source coverage and the latest period before client delivery.","Open Data Import","/import"]].map((x:any,i)=><div className="card workflow-card" key={i}><div className="workflow-icon"><Target size={17}/></div><span>WORKFLOW {String(i+1).padStart(2,"0")}</span><h3>{x[0]}</h3><p>{x[1]}</p><a className="primary workflow-link" href={x[3]}>{x[2]}</a></div>)}</div>;
 else body=<div className="alert-grid">{(Array.isArray(d.alerts)?d.alerts:[]).map((a:any,i:number)=><div className="card alert-card" key={i}><div className={"alert-icon "+(a?.tone==="negative"?"negative":"positive")}>{a?.tone==="negative"?<TriangleAlert size={17}/>:<CheckCircle2 size={17}/>}</div><div><span>{String(a?.type||"SIGNAL")}</span><h3>{String(a?.title||"Performance signal")}</h3><p>{String(a?.text||"No additional detail.")}</p><small><Clock3 size={12}/> {String(a?.period||latest)}</small></div></div>)}</div>;
 return <AppShell title={title} subtitle={subtitle}><section className="content"><div className="intro"><div><div className="muted">LIVE WORKSPACE</div><h1>{title}</h1><p>{subtitle} · latest source period {latest}</p></div></div>{body}</section></AppShell>;
}
