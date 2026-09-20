"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {ArrowDownRight,ArrowUpRight,BarChart3,ExternalLink,FileText,Search,SlidersHorizontal,TrendingUp} from "lucide-react";
import {AppShell} from "../../components/app-shell";
import {LineChart} from "../../components/cpg-charts";
import {supabaseBrowser} from "../../lib/supabase-browser";

const money=(n:any)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}).format(Number(n)||0);
const pct=(n:any)=>(Number(n)>=0?"+":"")+Number(n||0).toFixed(1)+"%";

type Brand={id:number;name:string;category?:string;parent_company?:string;home_regions?:string};
export default function Brands(){
 const [q,setQ]=useState(""),[results,setResults]=useState<Brand[]>([]),[selected,setSelected]=useState<Brand|null>(null),[detail,setDetail]=useState<any>(null),[loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[error,setError]=useState("");
 useEffect(()=>{let live=true;(async()=>{try{const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session){location.href="/";return}const r=await fetch("/api/explorer?entity=brand&q="+encodeURIComponent(q),{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Brand search failed.");if(live)setResults(Array.isArray(d.results)?d.results:[])}catch(e:any){if(live)setError(e.message||"Brand search failed.")}finally{if(live)setLoading(false)}})();return()=>{live=false}},[q]);
 async function openBrand(b:Brand){setSelected(b);setDetailLoading(true);setError("");try{const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session)throw new Error("Please sign in again.");const r=await fetch("/api/explorer?entity=brand&id="+encodeURIComponent(String(b.id)),{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Brand detail failed.");setDetail(d)}catch(e:any){setError(e.message||"Brand detail failed.");setDetail(null)}finally{setDetailLoading(false)}}
 const chart=useMemo(()=>Array.isArray(detail?.weekly)?safeDetail.weekly.slice(-26).map((x:any)=>({label:String(x.period).slice(5),value:Number(x.sales)||0})):[],[detail]);
 const safeDetail=detail&&detail.metrics?detail:null;
 return <AppShell title="Brands" subtitle="Brand-specific performance, diagnostics and evidence">
  <section className="content">
   <div className="intro"><div><div className="muted">BRAND INTELLIGENCE</div><h1>Find a brand. Then work only on that brand.</h1><p>Search across the brand master and open a focused view with sales, growth, distribution, products and client-report actions.</p></div><Link className="secondary-btn" href="/ai-analyst"><BarChart3 size={14}/>Ask AI Analyst</Link></div>
   <div className="brand-workspace">
    <div className="card brand-directory">
     <div className="panel-head"><div><b>Brand finder</b><span>{results.length} matching brands</span></div><SlidersHorizontal size={16}/></div>
     <div className="brand-search"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search brand, category or parent company…"/></div>
     <div className="brand-list">{loading?<div className="empty-state">Loading brand master…</div>:results.map(b=><button key={b.id} className={"brand-list-item "+(selected?.id===b.id?"selected":"")} onClick={()=>openBrand(b)}><span className="brand-avatar">{String(b.name||"B").slice(0,1).toUpperCase()}</span><span className="brand-list-copy"><b>{b.name}</b><small>{b.category||"Unclassified"} · {b.parent_company||"Independent"}</small></span><ExternalLink size={13}/></button>)}{!loading&&!results.length&&<div className="empty-state">No matching brands.</div>}</div>
    </div>
    <div className="brand-detail">
     {!selected?<div className="card empty-detail"><TrendingUp size={22}/><h2>Select a brand</h2><p>Use the finder to open a client-style brand workspace. Every number shown here will be tied to the selected brand.</p></div>:
      detailLoading?<div className="card empty-detail">Loading {selected.name} evidence…</div>:
      safeDetail?<><div className="card brand-hero"><div><span className="eyebrow">SELECTED BRAND</span><h2>{selected.name}</h2><p>{selected.category||"Unclassified"} · {selected.parent_company||"Independent"}{selected.home_regions?" · "+selected.home_regions:""}</p></div><div className="brand-actions"><Link className="primary" href={"/reports?brand_id="+selected.id}><FileText size={14}/>Brand report</Link><Link className="secondary-btn" href={"/ai-analyst?brand_id="+selected.id}>Ask about brand</Link></div></div>
       <div className="report-grid-kpis"><div className="card kpi"><span>Latest 13W sales</span><strong>{money(safeDetail.metrics.sales)}</strong><small className={safeDetail.metrics.growth>=0?"positive":"negative"}>{detail.metrics.growth>=0?<ArrowUpRight size={13}/>:<ArrowDownRight size={13}/>} {pct(detail.metrics.growth)} vs prior 13W</small></div><div className="card kpi"><span>Units</span><strong>{new Intl.NumberFormat().format(safeDetail.metrics.units||0)}</strong><small>Selected brand only</small></div><div className="card kpi"><span>Avg ACV</span><strong>{safeDetail.metrics.distribution==null?"—":Number(detail.metrics.distribution).toFixed(1)+"%"}</strong><small>Observed brand distribution</small></div><div className="card kpi"><span>Category share</span><strong>{safeDetail.metrics.share==null?"—":Number(detail.metrics.share).toFixed(1)+"%"}</strong><small>Latest 13W brand share</small></div></div>
       <div className="two-col"><div className="card panel"><div className="panel-head"><div><b>{selected.name} sales trend</b><span>26 latest completed brand periods</span></div></div><LineChart points={chart}/></div><div className="card panel"><div className="panel-head"><div><b>Brand scorecard</b><span>Decision-ready metrics</span></div></div><div className="brand-score"><div><span>Prior 13W</span><b>{money(safeDetail.metrics.priorSales)}</b></div><div><span>Growth</span><b className={detail.metrics.growth>=0?"positive":"negative"}>{pct(detail.metrics.growth)}</b></div><div><span>Category</span><b>{selected.category||"—"}</b></div><div><span>Parent</span><b>{selected.parent_company||"—"}</b></div><div><span>Realized price</span><b>{safeDetail.metrics.price==null?"—":money(detail.metrics.price)}</b></div><div><span>Promo rate</span><b>{safeDetail.metrics.promoRate==null?"—":Number(detail.metrics.promoRate).toFixed(1)+"%"}</b></div></div></div></div>
       <div className="two-col"><div className="card panel"><div className="panel-head"><div><b>Product master</b><span>Products mapped to this brand</span></div></div><table><thead><tr><th>PRODUCT</th><th>SUBCATEGORY</th><th>SIZE</th></tr></thead><tbody>{(safeDetail.products||[]).map((x:any)=><tr key={x.id}><td>{x.name}</td><td>{x.subcategory||"—"}</td><td>{x.size||"—"}</td></tr>)}</tbody></table></div><div className="card panel"><div className="panel-head"><div><b>Client question shortcuts</b><span>Keep the analysis on the selected brand</span></div></div><div className="shortcut-grid"><Link href={"/ai-analyst?brand_id="+selected.id}>What changed for this brand?</Link><Link href={"/ai-analyst?brand_id="+selected.id}>Which periods drove the change?</Link><Link href={"/reports?brand_id="+selected.id}>Build a brand performance report</Link><Link href={"/reports?brand_id="+selected.id}>Prepare a client presentation</Link></div></div></div>
       </>:<div className="card error-card">{error}</div>}
     {error&&selected&&<div className="form-error">{error}</div>}
    </div>
   </div>
  </section>
 </AppShell>
}