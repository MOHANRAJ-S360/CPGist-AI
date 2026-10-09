"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {Boxes,Search,Store,Layers3,Map,PackageSearch,FileText,ChevronLeft,ChevronRight,ChevronDown,ChevronUp} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import {AppShell} from "../../components/app-shell";
import {supabaseBrowser} from "../../lib/supabase-browser";

type Entity="brand"|"retailer"|"category"|"region"|"product";
type Tab={id:Entity;label:string;icon:LucideIcon};
const tabs:Tab[]=[
 {id:"brand",label:"Brands",icon:Boxes},
 {id:"retailer",label:"Retailers",icon:Store},
 {id:"category",label:"Categories",icon:Layers3},
 {id:"region",label:"Regions",icon:Map},
 {id:"product",label:"Products",icon:PackageSearch}
];
const PAGE_SIZE=50;
const money=(n:any)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}).format(Number(n)||0);

export default function Explorer(){
 const initialParams=typeof window!=="undefined"?new URLSearchParams(window.location.search):null;
 const [entity,setEntity]=useState<Entity>((initialParams?.get("entity") as Entity)||"brand");
 const [categoryFilter]=useState(()=>initialParams?.get("category")||"");
 const [subcategoryFilter]=useState(()=>initialParams?.get("subcategory")||"");
 const [q,setQ]=useState(()=>initialParams?.get("q")||"");
 const [rows,setRows]=useState<any[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [page,setPage]=useState(1);
 const [expandedCategories,setExpandedCategories]=useState<Set<string>>(new Set());
 const [expandedSubcategories,setExpandedSubcategories]=useState<Set<string>>(new Set());
 const [total,setTotal]=useState(0);
 const [detailData,setDetailData]=useState<any>(null);
 const [detailKey,setDetailKey]=useState<string|null>(null);
 const [detailLoading,setDetailLoading]=useState(false);

 useEffect(()=>{setPage(1);setExpandedCategories(new Set());setExpandedSubcategories(new Set())},[entity,q]);

 useEffect(()=>{
  let live=true;
  const run=async()=>{
   setLoading(true);setError("");
   try{
    const {data:{session}}=await supabaseBrowser().auth.getSession();
    if(!session)throw new Error("Please sign in again.");
    const offset=(page-1)*PAGE_SIZE;
    const r=await fetch("/api/explorer?entity="+entity+"&q="+encodeURIComponent(q)+"&category="+encodeURIComponent(categoryFilter)+"&subcategory="+encodeURIComponent(subcategoryFilter)+"&limit="+PAGE_SIZE+"&offset="+offset,{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(typeof d?.error==="string"?d.error:d?.error?.message||"Search failed.");
    if(live){setRows(Array.isArray(d.results)?d.results:[]);setTotal(Number(d.count)||0);}
   }catch(e:any){
    if(live){setRows([]);setTotal(0);setError(e?.message||"Search failed.");}
   }finally{if(live)setLoading(false);}
  };
  run();
  return()=>{live=false};
 },[entity,q,page,categoryFilter,subcategoryFilter]);

 useEffect(()=>{setDetailData(null);setDetailKey(null)},[entity,q,page]);

 const currentLabel=tabs.find(t=>t.id===entity)?.label||"Data";
 const detail=(x:any)=>{
  if(entity==="brand")return [x.category,x.parent_company].filter(Boolean).join(" · ");
  if(entity==="retailer")return [x.channel,x.region,x.retailer_group].filter(Boolean).join(" · ");
  if(entity==="product")return [x.category,x.subcategory,x.size,x.sku].filter(Boolean).join(" · ");
  if(entity==="region")return [x.country,x.region_group].filter(Boolean).join(" · ");
  return [x.parent_category,x.subcategory_count!=null?x.subcategory_count+" subcategories":""].filter(Boolean).join(" · ");
 };
 const pageCount=Math.max(1,Math.ceil(total/PAGE_SIZE));
 const start=total?((page-1)*PAGE_SIZE)+1:0;
 const end=Math.min(page*PAGE_SIZE,total);

 return <AppShell title="Data Explorer" subtitle="Find specific brands, products, retailers, categories and regions">
  <section className="content">
   <div className="intro"><div><div className="muted">DATA EXPLORATION</div><h1>Find the exact data you need</h1><p>Search the active CPGist dataset directly. Every entity has a master record, and brands can be opened into a scoped report and AI analysis without mixing unrelated brands.</p></div></div>
   <div className="card explorer-toolbar">
    <div className="explorer-tabs">{tabs.map(tab=>{const Icon=tab.icon;return <button key={tab.id} className={entity===tab.id?"active":""} onClick={()=>{setEntity(tab.id);setQ("");}}><Icon size={14}/>{tab.label}</button>})}</div>
    <div className="explorer-search"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={"Search "+currentLabel.toLowerCase()+"…"} autoFocus/></div>
   </div>
   <div className="card panel">
    <div className="panel-head"><div><b>{currentLabel} directory</b><span>{total.toLocaleString()} total matching records · showing {start.toLocaleString()}–{end.toLocaleString()}</span></div></div>
    {error?<div className="form-error">{error}</div>:loading?<div className="loading-card">Searching live data…</div>:<><div className="explorer-results">
      {rows.map((x:any,i:number)=>{
       const isCategory=entity==="category";
       const categoryKey=String(x.id??x.name??i);
       const expanded=isCategory&&expandedCategories.has(categoryKey);
       const subcategories=Array.isArray(x.subcategories)?x.subcategories:[];
       return <div key={categoryKey}>
        <div className="explorer-result" style={(isCategory||entity==="retailer"||entity==="product"||entity==="region")?{cursor:"pointer"}:undefined} onClick={async()=>{if(isCategory){setExpandedCategories(prev=>{const next=new Set(prev);if(next.has(categoryKey))next.delete(categoryKey);else next.add(categoryKey);return next});return}setDetailLoading(true);try{const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session)throw new Error("Please sign in again.");const r=await fetch("/api/explorer?entity="+entity+"&id="+encodeURIComponent(String(x.id)),{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});const d=await r.json();if(r.ok){setDetailData(d);setDetailKey(String(x.id))}}catch{}finally{setDetailLoading(false)}}}>
         <div className="explorer-result-icon">{entity==="product"?<PackageSearch size={15}/>:entity==="retailer"?<Store size={15}/>:entity==="category"?<Layers3 size={15}/>:entity==="region"?<Map size={15}/>:<Boxes size={15}/>}</div>
         <div className="explorer-result-copy"><b>{String(x.name||"Unnamed")}</b><span>{detail(x)}</span></div>
         {isCategory&&<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10,fontSize:12,color:"#667085"}}><span>{subcategories.length||Number(x.subcategory_count)||0} subcategories</span>{expanded?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</div>}
         {entity==="brand"&&<div className="explorer-result-actions"><Link className="secondary-btn" href={"/reports?brand_id="+x.id} onClick={e=>e.stopPropagation()}><FileText size={13}/>Report</Link><Link className="primary" href={"/ai-analyst?brand_id="+x.id} onClick={e=>e.stopPropagation()}>AI</Link></div>}
        </div>
        {detailLoading&&detailKey===String(x.id)&&<div className="card panel loading-card">Loading selected {currentLabel.toLowerCase()} detail…</div>}
        {detailKey===String(x.id)&&detailData?.entity===entity&&((entity==="retailer"&&detailData.retailer)||entity==="product"||entity==="region")&&<div className="card panel" style={{margin:"-1px 0 12px 52px",background:"#fbfbfe"}}>{entity==="retailer"&&<><div className="panel-head"><div><b>{detailData.retailer.name}</b><span>Retailer detail · selected retailer only</span></div></div><div className="report-grid-kpis"><div className="card kpi"><span>STORES</span><strong>{Number(detailData.retailer.total_stores||0).toLocaleString()}</strong><small>Listed stores</small></div><div className="card kpi"><span>CHANNEL</span><strong>{detailData.retailer.channel||"—"}</strong><small>Retailer master</small></div><div className="card kpi"><span>REGION</span><strong>{detailData.retailer.region||"—"}</strong><small>Retailer master</small></div><div className="card kpi"><span>13W SALES</span><strong>{detailData.metrics?.sales==null?"—":money(detailData.metrics.sales)}</strong><small>Latest 13 completed weeks</small></div></div><div className="muted" style={{margin:"8px 0 0"}}>{detailData.latestWindow?.length===13?"13W window: "+detailData.latestWindow[0]+" → "+detailData.latestWindow.at(-1):"13W window unavailable"}</div></>}{entity==="product"&&<><div className="panel-head"><div><b>{detailData.product.name}</b><span>{detailData.product.sku||"SKU not provided"} · {detailData.product.category||"Category not provided"}</span></div><button type="button" className="secondary-btn" onClick={()=>{setDetailData(null);setDetailKey(null)}}>← Back to products</button></div><div className="report-grid-kpis"><div className="card kpi"><span>13W SALES</span><strong>{detailData.metrics?.sales==null?"—":money(detailData.metrics.sales)}</strong><small>{detailData.metrics?.weeksAvailable===13?"Latest 13 weeks":"13W coverage: "+Number(detailData.metrics?.weeksAvailable||0)+"/13 weeks"}</small></div><div className="card kpi"><span>UNITS</span><strong>{Number(detailData.metrics?.units||0).toLocaleString()}</strong></div><div className="card kpi"><span>AVG PRICE</span><strong>{detailData.metrics?.avgPrice==null?"—":money(detailData.metrics.avgPrice)}</strong></div><div className="card kpi"><span>AVG DISTRIBUTION</span><strong>{detailData.metrics?.avgDistribution==null?"—":Number(detailData.metrics.avgDistribution).toFixed(1)+"%"}</strong></div></div><table><thead><tr><th>RETAILER</th><th>CHANNEL</th><th>REGION</th><th>STORES</th><th>SALES</th><th>UNITS</th></tr></thead><tbody>{(detailData.retailers||[]).map((r:any)=><tr key={r.id}><td><b>{r.name}</b></td><td>{r.channel||"—"}</td><td>{r.region||"—"}</td><td>{r.total_stores==null?"—":Number(r.total_stores).toLocaleString()}</td><td>{money(r.sales)}</td><td>{Number(r.units||0).toLocaleString()}</td></tr>)}</tbody></table></>}{entity==="region"&&<><div className="panel-head"><div><b>{detailData.region.name}</b><span>{detailData.region.country||"Country not provided"} · {detailData.region.region_group||"Region group not provided"}</span></div><button type="button" className="secondary-btn" onClick={()=>{setDetailData(null);setDetailKey(null)}}>← Back to regions</button></div><div className="report-grid-kpis"><div className="card kpi"><span>13W SALES</span><strong>{detailData.metrics?.sales==null?"—":money(detailData.metrics.sales)}</strong><small>{detailData.metrics?.weeksAvailable===13?"Latest 13 weeks":"13W coverage: "+Number(detailData.metrics?.weeksAvailable||0)+"/13 weeks"}</small></div><div className="card kpi"><span>STORES</span><strong>{Number(detailData.totalStores||0).toLocaleString()}</strong><small>Selected region</small></div><div className="card kpi"><span>BRANDS</span><strong>{Number(detailData.brands?.length||0).toLocaleString()}</strong></div><div className="card kpi"><span>PRODUCTS</span><strong>{Number(detailData.productCount||0).toLocaleString()}</strong></div></div><table><thead><tr><th>BRAND</th><th>CATEGORY</th></tr></thead><tbody>{(detailData.brands||[]).map((b:any)=><tr key={b.id}><td><b>{b.name}</b></td><td>{b.category||"—"}</td></tr>)}</tbody></table></>}</div>}
        {isCategory&&expanded&&<div style={{margin:"-1px 0 10px 52px",border:"1px solid #e5e7eb",borderRadius:12,background:"#fafaff",padding:"12px 14px"}}>
         <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <b style={{fontSize:13}}>Subcategories in {String(x.name||"this category")}</b>
          <Link className="secondary-btn" href={"/explorer?entity=product&category="+encodeURIComponent(String(x.name||""))} onClick={e=>e.stopPropagation()}>View all products</Link>
         </div>
         {subcategories.length?<div style={{display:"grid",gap:10}}>
          {subcategories.map((s:any)=>{
           const subKey=String(x.name||"")+"::"+String(s.name||"");
           const subExpanded=expandedSubcategories.has(subKey);
           const products=Array.isArray(s.products)?s.products:[];
           return <div key={subKey} style={{border:"1px solid #e6e8f0",borderRadius:10,background:"#fff",overflow:"hidden"}}>
            <button type="button" onClick={e=>{e.stopPropagation();setExpandedSubcategories(prev=>{const next=new Set(prev);if(next.has(subKey))next.delete(subKey);else next.add(subKey);return next})}} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 13px",border:0,background:"#fff",textAlign:"left",cursor:"pointer",color:"inherit"}}>
             <span><b style={{fontSize:13}}>{String(s.name||"Unclassified")}</b><small style={{display:"block",marginTop:3,color:"#667085"}}>{Number(s.product_count||products.length||0).toLocaleString()} products · click to view SKUs</small></span>
             {subExpanded?<ChevronUp size={15}/>:<ChevronRight size={15}/>}
            </button>
            {subExpanded&&<div style={{borderTop:"1px solid #eef0f5",padding:"10px 12px",background:"#fbfbfe"}}>
             {products.length?<div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
               <thead><tr><th style={{textAlign:"left",padding:"7px 8px",color:"#667085",fontWeight:600}}>PRODUCT</th><th style={{textAlign:"left",padding:"7px 8px",color:"#667085",fontWeight:600}}>PRODUCT ID</th><th style={{textAlign:"left",padding:"7px 8px",color:"#667085",fontWeight:600}}>SKU</th><th style={{textAlign:"left",padding:"7px 8px",color:"#667085",fontWeight:600}}>SIZE</th></tr></thead>
               <tbody>{products.map((p:any)=><tr key={String(p.id)}><td style={{padding:"8px",borderTop:"1px solid #eef0f5",fontWeight:600}}>{String(p.name||"Unnamed product")}</td><td style={{padding:"8px",borderTop:"1px solid #eef0f5",fontFamily:"monospace",color:"#475467"}}>{String(p.id)}</td><td style={{padding:"8px",borderTop:"1px solid #eef0f5",fontFamily:"monospace",color:p.sku?"#475467":"#98a2b3"}}>{String(p.sku||"Not provided")}</td><td style={{padding:"8px",borderTop:"1px solid #eef0f5",color:"#667085"}}>{String(p.size||"—")}</td></tr>)}</tbody>
              </table>
             </div>:<div className="empty-detail">No SKU-level products are available for this subcategory.</div>}
             <div style={{fontSize:11,color:"#667085",marginTop:8}}>SKU availability follows the connected dataset; CPGist does not invent SKU codes when the source does not provide them.</div><div style={{display:"flex",justifyContent:"flex-end",marginTop:9}}><Link className="secondary-btn" href={"/explorer?entity=product&category="+encodeURIComponent(String(x.name||""))+"&subcategory="+encodeURIComponent(String(s.name||""))} onClick={e=>e.stopPropagation()}>Open filtered product view</Link></div>
            </div>}
           </div>
          })}
         </div>:<div className="empty-detail">No subcategory records are available for this category.</div>}
        </div>}
       </div>
      })}
      {!rows.length&&<div className="empty-detail">No matching records. Try a broader search.</div>}
    </div><div className="explorer-pagination"><button disabled={page<=1||loading} onClick={()=>setPage(p=>Math.max(1,p-1))}><ChevronLeft size={14}/>Previous</button><span>Page {page.toLocaleString()} of {pageCount.toLocaleString()}</span><button disabled={page>=pageCount||loading} onClick={()=>setPage(p=>Math.min(pageCount,p+1))}>Next<ChevronRight size={14}/></button></div></>}
   </div>
  </section>
 </AppShell>
}
