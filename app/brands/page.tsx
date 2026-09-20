"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {ArrowDownRight,ArrowUpRight,BarChart3,ExternalLink,FileText,Search,SlidersHorizontal,TrendingUp} from "lucide-react";
import {AppShell} from "../../components/app-shell";
import {LineChart} from "../../components/cpg-charts";
import {supabaseBrowser} from "../../lib/supabase-browser";

const money=(n:any)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}).format(Number(n)||0);
const pct=(n:any)=>(Number(n)>=0?"+":"")+Number(n||0).toFixed(1)+"%";
const text=(v:any)=>typeof v==="string"?v:(v==null?"":String(v));
type Brand={id:number|string;name:string;category?:string;parent_company?:string;home_regions?:string};

export default function Brands(){
 const [q,setQ]=useState(""),[results,setResults]=useState<Brand[]>([]),[selected,setSelected]=useState<Brand|null>(null),[detail,setDetail]=useState<any>(null),[loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[error,setError]=useState("");

 useEffect(()=>{
  let live=true;
  const run=async()=>{
   setLoading(true);setError("");
   try{
    const {data:{session}}=await supabaseBrowser().auth.getSession();
    if(!session){location.href="/";return}
    const r=await fetch("/api/explorer?entity=brand&q="+encodeURIComponent(q),{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||"Brand search failed.");
    if(live)setResults(Array.isArray(d.results)?d.results:[]);
   }catch(e:any){if(live)setError(e?.message||"Brand search failed.");}
   finally{if(live)setLoading(false);}
  };
  const timer=window.setTimeout(run,150);
  return()=>{live=false;window.clearTimeout(timer)};
 },[q]);

 async function openBrand(b:Brand){
  setSelected(b);setDetail(null);setDetailLoading(true);setError("");
  try{
   const {data:{session}}=await supabaseBrowser().auth.getSession();
   if(!session)throw new Error("Please sign in again.");
   const r=await fetch("/api/explorer?entity=brand&id="+encodeURIComponent(String(b.id)),{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||"Brand detail failed.");
   if(!d?.metrics||!Array.isArray(d?.weekly))throw new Error("The selected brand returned incomplete analytical data.");
   setDetail(d);
  }catch(e:any){setError(e?.message||"Brand detail failed.");}
  finally{setDetailLoading(false);}
 }

 const chart=useMemo(()=>Array.isArray(detail?.weekly)?detail.weekly.slice(-26).map((x:any)=>({label:text(x.period).slice(5),value:Number(x.sales)||0})):[],[detail]);
 const m=detail?.metrics||{};
 const region=text(selected?.home_regions);

 return <AppShell title="Brands" subtitle="Brand-specific performance, diagnostics and evidence">
  <section className="content">
   <div className="intro">
    <div><div className="muted">BRAND INTELLIGENCE</div><h1>Find a brand. Then work only on that brand.</h1><p>Search the complete brand master, open one brand, and keep every chart, metric, product and report scoped to that client brand.</p></div>
    <Link className="secondary-btn" href="/ai-analyst"><BarChart3 size={14}/>Ask AI Analyst</Link>
   </div>

   <div className="brand-workspace">
    <div className="card brand-directory">
     <div className="panel-head"><div><b>Complete brand master</b><span>{results.length} matching brands · no 30-item cap</span></div><SlidersHorizontal size={16}/></div>
     <div className="brand-search"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search brand, category, parent company or region…"/></div>
     <div className="brand-list" aria-label="All brands">
      {loading?<div className="empty-state">Loading complete brand master…</div>:
       results.map(b=><button key={String(b.id)} className={"brand-list-item "+(selected?.id===b.id?"selected":"")} onClick={()=>openBrand(b)}>
        <span className="brand-avatar">{text(b.name).slice(0,1).toUpperCase()||"B"}</span>
        <span className="brand-list-copy"><b>{text(b.name)||"Unnamed brand"}</b><small>{text(b.category)||"Unclassified"} · {text(b.parent_company)||"Independent"}{text(b.home_regions)?" · "+text(b.home_regions):""}</small></span>
        <ExternalLink size={13}/>
       </button>)
      }
      {!loading&&!results.length&&<div className="empty-state">No matching brands.</div>}
     </div>
    </div>

    <div className="brand-detail">
     {!selected&&<div className="card empty-detail"><TrendingUp size={22}/><h2>Select a brand</h2><p>Choose any brand from the complete master. The right panel becomes a client-specific workspace.</p></div>}
     {selected&&detailLoading&&<div className="card empty-detail">Loading {text(selected.name)} evidence…</div>}
     {selected&&!detailLoading&&detail&&
      <>
       <div className="card brand-hero"><div><span className="eyebrow">SELECTED BRAND</span><h2>{text(selected.name)}</h2><p>{text(selected.category)||"Unclassified"} · {text(selected.parent_company)||"Independent"}{region?" · "+region:""}</p></div><div className="brand-actions"><Link className="primary" href={"/reports?brand_id="+encodeURIComponent(String(selected.id))}><FileText size={14}/>Brand report</Link><Link className="secondary-btn" href={"/ai-analyst?brand_id="+encodeURIComponent(String(selected.id))}>Ask about brand</Link></div></div>

       <div className="report-grid-kpis">
        <div className="card kpi"><span>Latest 13W sales</span><strong>{money(m.sales)}</strong><small className={Number(m.growth)>=0?"positive":"negative"}>{Number(m.growth)>=0?<ArrowUpRight size={13}/>:<ArrowDownRight size={13}/>} {pct(m.growth)} vs prior 13W</small></div>
        <div className="card kpi"><span>Units</span><strong>{new Intl.NumberFormat().format(Number(m.units)||0)}</strong><small>Selected brand only</small></div>
        <div className="card kpi"><span>Avg ACV</span><strong>{m.distribution==null?"—":Number(m.distribution).toFixed(1)+"%"}</strong><small>Observed brand distribution</small></div>
        <div className="card kpi"><span>Promo rate</span><strong>{Number(m.promoRate||0).toFixed(1)}%</strong><small>Observed promotional activity</small></div>
       </div>

       <div className="two-col">
        <div className="card panel"><div className="panel-head"><div><b>{text(selected.name)} sales trend</b><span>26 latest completed brand periods</span></div></div><LineChart points={chart}/></div>
        <div className="card panel"><div className="panel-head"><div><b>Brand scorecard</b><span>Decision-ready metrics</span></div></div><div className="brand-score"><div><span>Prior 13W</span><b>{money(m.priorSales)}</b></div><div><span>Growth</span><b className={Number(m.growth)>=0?"positive":"negative"}>{pct(m.growth)}</b></div><div><span>Category</span><b>{text(selected.category)||"—"}</b></div><div><span>Parent</span><b>{text(selected.parent_company)||"—"}</b></div></div></div>
       </div>

       <div className="two-col">
        <div className="card panel"><div className="panel-head"><div><b>Product master</b><span>{Array.isArray(detail.products)?detail.products.length:0} products mapped to this brand</span></div></div>
         <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>SUBCATEGORY</th><th>SIZE</th></tr></thead><tbody>{(detail.products||[]).map((x:any)=><tr key={String(x.id)}><td>{text(x.name)||"Unnamed product"}</td><td>{text(x.category)||"—"}</td><td>{text(x.subcategory)||"—"}</td><td>{text(x.size)||"—"}</td></tr>)}</tbody></table></div>
        </div>
        <div className="card panel"><div className="panel-head"><div><b>Client question shortcuts</b><span>Keep the analysis on the selected brand</span></div></div><div className="shortcut-grid"><Link href={"/ai-analyst?brand_id="+selected.id}>What changed for this brand?</Link><Link href={"/ai-analyst?brand_id="+selected.id}>Which periods drove the change?</Link><Link href={"/reports?brand_id="+selected.id}>Build a brand performance report</Link><Link href={"/reports?brand_id="+selected.id}>Prepare a client presentation</Link></div></div>
       </div>
      </>
     }
     {error&&<div className="form-error">{error}</div>}
    </div>
   </div>
  </section>
 </AppShell>
}
