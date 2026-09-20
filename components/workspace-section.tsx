"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {ArrowUpRight,MapPinned,Search,Store,Layers3,BarChart3,FileText,Target,TriangleAlert,CheckCircle2,Clock3} from "lucide-react";
import {AppShell} from "./app-shell";
import {BarChart,LineChart} from "./cpg-charts";
import {supabaseBrowser} from "../lib/supabase-browser";

const money=(n:any)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}).format(Number(n)||0);
const pct=(n:any)=>(Number(n)>=0?"+":"")+Number(n||0).toFixed(1)+"%";
const txt=(v:any)=>v==null?"":String(v);

const titles:Record<string,[string,string,string]> = {
 retailers:["Retailers","Account and channel performance","retailer"],
 categories:["Categories","Category growth and structure","category"],
 regions:["Regions","Geographic footprint and market coverage","region"],
 market:["Market","Market pulse and competitive context","category"],
 workflows:["Workflows","Repeatable decision workflows","workflow"],
 alerts:["Alerts","Evidence-based performance signals","alert"]
};

export default function WorkspaceSection({section}:{section:string}){
 const [d,setD]=useState<any>(null),[q,setQ]=useState(""),[selected,setSelected]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [title,subtitle,entity]=titles[section]||titles.market;

 useEffect(()=>{
  let live=true;
  (async()=>{
   setLoading(true);setError("");
   try{
    const {data:{session}}=await supabaseBrowser().auth.getSession();
    if(!session){location.href="/";return}
    const apiEntity=entity==="workflow"||entity==="alert"?"category":entity;
    const r=await fetch("/api/explorer?entity="+apiEntity+"&q="+encodeURIComponent(q),{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
    const x=await r.json();if(!r.ok)throw new Error(x.error||"Workspace data failed.");
    if(live)setD(x);
   }catch(e:any){if(live)setError(e?.message||"Workspace data failed.");}
   finally{if(live)setLoading(false);}
  })();
  return()=>{live=false};
 },[entity,q]);

 const rows=Array.isArray(d?.results)?d.results:[];
 const filtered=useMemo(()=>rows,[rows]);
 const icon=entity==="retailer"?<Store size={20}/>:entity==="region"?<MapPinned size={20}/>:<Layers3 size={20}/>;

 if(section==="market"){
  return <MarketWorkspace/>
 }
 if(section==="workflows"){
  return <AppShell title={title} subtitle={subtitle}><section className="content"><div className="intro"><div><div className="muted">WORKFLOW CENTER</div><h1>{title}</h1><p>{subtitle}</p></div></div><div className="workflow-grid">{[
   ["Weekly performance review","Refresh brand, category, retailer and region metrics from the latest source period.","Open AI Analyst","/ai-analyst"],
   ["Client report","Generate a scoped, quantitative PDF or PowerPoint for a selected brand.","Open Reports","/reports"],
   ["Data quality review","Validate source coverage and import the compact analytical layer.","Open Data Import","/import"]
  ].map((x,i)=><div className="card workflow-card" key={i}><div className="workflow-icon"><Target size={17}/></div><span>WORKFLOW {String(i+1).padStart(2,"0")}</span><h3>{x[0]}</h3><p>{x[1]}</p><Link className="primary workflow-link" href={x[3]}>{x[2]}</Link></div>)}</div></section></AppShell>
 }
 if(section==="alerts"){
  return <AppShell title={title} subtitle={subtitle}><section className="content"><div className="intro"><div><div className="muted">EXCEPTION CENTER</div><h1>Signals that need attention</h1><p>Use AI Analyst to investigate any unusual movement instead of treating an alert as a conclusion.</p></div></div><div className="alert-grid"><div className="card alert-card"><div className="alert-icon positive"><CheckCircle2 size={17}/></div><div><span>DATA COVERAGE</span><h3>Explorer is connected</h3><p>{d?.count??"—"} source records are available for the current explorer scope.</p><small><Clock3 size={12}/> Live query</small></div></div><div className="card alert-card"><div className="alert-icon positive"><ArrowUpRight size={17}/></div><div><span>NEXT ACTION</span><h3>Open a focused brand or retailer view</h3><p>Use the entity directories to isolate the exact business object before generating client material.</p><small><Clock3 size={12}/> Recommended workflow</small></div></div></div></section></AppShell>
 }
 return <AppShell title={title} subtitle={subtitle}><section className="content">
  <div className="intro"><div><div className="muted">{title.toUpperCase()} INTELLIGENCE</div><h1>Explore the complete {entity} master</h1><p>Search and review every available {entity}. There is no 30-item presentation cap; the list is the full returned master and can be filtered instantly.</p></div></div>
  {error&&<div className="form-error">{error}</div>}
  <div className="entity-workspace">
   <div className="card entity-directory">
    <div className="panel-head"><div><b>Complete {entity} master</b><span>{loading?"Loading…":(d?.count??filtered.length)+" matching records"}</span></div>{icon}</div>
    <div className="brand-search"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={"Search "+entity+"…"} /></div>
    <div className="entity-list">{loading?<div className="empty-state">Loading complete master…</div>:filtered.map((x:any,i:number)=>{
      const id=String(x.id??x.name??i);const active=selected&&String(selected.id??selected.name)===id;
      return <button className={"entity-list-item "+(active?"selected":"")} key={id} onClick={()=>setSelected(x)}>
       <span className="entity-avatar">{entity==="region"?"R":entity==="retailer"?"R":"C"}</span>
       <span className="entity-list-copy"><b>{txt(x.name)||"Unclassified"}</b><small>{entity==="retailer"?txt(x.channel)+" · "+txt(x.region):entity==="region"?txt(x.retailers)+" retailers · "+txt(x.stores)+" stores":txt(x.periods)+" periods · "+money(x.sales)}</small></span>
      </button>
    })}{!loading&&!filtered.length&&<div className="empty-state">No matching records.</div>}</div>
   </div>
   <div className="entity-detail">
    {!selected?<div className="card empty-detail">{icon}<h2>Select a {entity}</h2><p>Choose an item from the complete directory to inspect its available master and analytical fields.</p></div>:
      <div className="card panel">
       <div className="entity-detail-head"><div><span className="eyebrow">SELECTED {entity.toUpperCase()}</span><h2>{txt(selected.name)}</h2><p>{entity==="retailer"?txt(selected.channel)+" · "+txt(selected.region):entity==="region"?txt(selected.retailers)+" retailers · "+txt(selected.stores)+" stores":txt(selected.periods)+" weekly periods"}</p></div><div className="brand-actions">{entity==="retailer"&&<Link className="secondary-btn" href={"/ai-analyst?retailer_id="+encodeURIComponent(String(selected.id))}><BarChart3 size={14}/>Ask AI Analyst</Link>}{entity==="category"&&<Link className="secondary-btn" href="/ai-analyst"><BarChart3 size={14}/>Analyze category</Link>}</div></div>
       <div className="report-grid-kpis">
        {entity==="retailer"&&<><div className="card kpi"><span>Stores</span><strong>{Number(selected.total_stores||0).toLocaleString()}</strong><small>{txt(selected.channel)||"Channel"}</small></div><div className="card kpi"><span>Region</span><strong>{txt(selected.region)||"—"}</strong><small>Retailer master</small></div></>}
        {entity==="region"&&<><div className="card kpi"><span>Retailers</span><strong>{Number(selected.retailers||0).toLocaleString()}</strong><small>Retailer master</small></div><div className="card kpi"><span>Stores</span><strong>{Number(selected.stores||0).toLocaleString()}</strong><small>Footprint</small></div></>}
        {entity==="category"&&<><div className="card kpi"><span>Sales</span><strong>{money(selected.sales)}</strong><small>Observed source aggregate</small></div><div className="card kpi"><span>Units</span><strong>{Number(selected.units||0).toLocaleString()}</strong><small>Observed source aggregate</small></div><div className="card kpi"><span>Avg ACV</span><strong>{selected.avgDistribution==null?"—":Number(selected.avgDistribution).toFixed(1)+"%"}</strong><small>Average observed distribution</small></div></>}
       </div>
       {entity==="category"&&<div className="panel-subtable"><table><thead><tr><th>FIELD</th><th>VALUE</th></tr></thead><tbody><tr><td>Category</td><td>{txt(selected.name)}</td></tr><tr><td>Weekly periods</td><td>{Number(selected.periods||0).toLocaleString()}</td></tr><tr><td>Observed sales</td><td>{money(selected.sales)}</td></tr><tr><td>Observed units</td><td>{Number(selected.units||0).toLocaleString()}</td></tr></tbody></table></div>}
       {entity==="retailer"&&<div className="panel-subtable"><table><thead><tr><th>FIELD</th><th>VALUE</th></tr></thead><tbody><tr><td>Retailer</td><td>{txt(selected.name)}</td></tr><tr><td>Channel</td><td>{txt(selected.channel)||"—"}</td></tr><tr><td>Region</td><td>{txt(selected.region)||"—"}</td></tr><tr><td>Total stores</td><td>{Number(selected.total_stores||0).toLocaleString()}</td></tr></tbody></table></div>}
       {entity==="region"&&<div className="panel-subtable"><table><thead><tr><th>FIELD</th><th>VALUE</th></tr></thead><tbody><tr><td>Region</td><td>{txt(selected.name)}</td></tr><tr><td>Retailers</td><td>{Number(selected.retailers||0).toLocaleString()}</td></tr><tr><td>Stores</td><td>{Number(selected.stores||0).toLocaleString()}</td></tr><tr><td>Retailer coverage</td><td>{(selected.retailerNames||[]).join(", ")}</td></tr></tbody></table></div>}
      </div>
    }
   </div>
  </div>
 </section></AppShell>
}

function MarketWorkspace(){
 const [d,setD]=useState<any>(null);
 useEffect(()=>{(async()=>{try{const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session){location.href="/";return}const r=await fetch("/api/dashboard",{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});setD(await r.json())}catch(e:any){setD({error:e?.message||"Market data failed."})}})()},[]);
 const weekly=Array.isArray(d?.weekly)?d.weekly:[];
 return <AppShell title="Market" subtitle="Market pulse and competitive context"><section className="content"><div className="intro"><div><div className="muted">MARKET INTELLIGENCE</div><h1>Market pulse</h1><p>Quantitative market movement with brand, category and distribution context.</p></div></div>{d?.error?<div className="form-error">{String(d.error)}</div>:<><div className="report-grid-kpis"><div className="card kpi"><span>Market sales</span><strong>{money(d?.totalSales)}</strong><small>Latest observed window</small></div><div className="card kpi"><span>13W growth</span><strong>{pct(d?.growth)}</strong><small>vs prior 13W</small></div><div className="card kpi"><span>Avg distribution</span><strong>{d?.avgDistribution==null?"—":Number(d.avgDistribution).toFixed(1)+"%"}</strong><small>ACV</small></div></div><div className="two-col"><div className="card panel"><div className="panel-head"><div><b>Market value trend</b><span>Latest 26 completed periods</span></div></div><LineChart points={weekly.slice(-26).map((x:any)=>({label:txt(x.label||x.period),value:Number(x.sales)||0}))}/></div><div className="card panel"><div className="panel-head"><div><b>Leading brands</b><span>Observed value sales</span></div></div><BarChart items={(d?.topBrands||[]).map((x:any)=>({label:txt(x.name),value:Number(x.sales)||0,change:Number(x.growth)||0}))}/></div></div></>}</section></AppShell>
}
