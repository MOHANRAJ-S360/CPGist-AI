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

export default function Explorer(){
 const initialParams=typeof window!=="undefined"?new URLSearchParams(window.location.search):null;
 const [entity,setEntity]=useState<Entity>((initialParams?.get("entity") as Entity)||"brand");
 const [categoryFilter]=useState(()=>initialParams?.get("category")||"");
 const [subcategoryFilter]=useState(()=>initialParams?.get("subcategory")||"");
 const [q,setQ]=useState("");
 const [rows,setRows]=useState<any[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [page,setPage]=useState(1);
 const [expandedCategories,setExpandedCategories]=useState<Set<string>>(new Set());
 const [total,setTotal]=useState(0);

 useEffect(()=>{setPage(1);setExpandedCategories(new Set())},[entity,q]);

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
        <div className="explorer-result" style={isCategory?{cursor:"pointer"}:undefined} onClick={isCategory?()=>setExpandedCategories(prev=>{const next=new Set(prev);if(next.has(categoryKey))next.delete(categoryKey);else next.add(categoryKey);return next}):undefined}>
         <div className="explorer-result-icon">{entity==="product"?<PackageSearch size={15}/>:entity==="retailer"?<Store size={15}/>:entity==="category"?<Layers3 size={15}/>:entity==="region"?<Map size={15}/>:<Boxes size={15}/>}</div>
         <div className="explorer-result-copy"><b>{String(x.name||"Unnamed")}</b><span>{detail(x)}</span></div>
         {isCategory&&<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10,fontSize:12,color:"#667085"}}><span>{subcategories.length||Number(x.subcategory_count)||0} subcategories</span>{expanded?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</div>}
         {entity==="brand"&&<div className="explorer-result-actions"><Link className="secondary-btn" href={"/reports?brand_id="+x.id} onClick={e=>e.stopPropagation()}><FileText size={13}/>Report</Link><Link className="primary" href={"/ai-analyst?brand_id="+x.id} onClick={e=>e.stopPropagation()}>AI</Link></div>}
        </div>
        {isCategory&&expanded&&<div style={{margin:"-1px 0 10px 52px",border:"1px solid #e5e7eb",borderRadius:12,background:"#fafaff",padding:"12px 14px"}}>
         <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <b style={{fontSize:13}}>Subcategories in {String(x.name||"this category")}</b>
          <Link className="secondary-btn" href={"/explorer?entity=product&category="+encodeURIComponent(String(x.name||""))} onClick={e=>e.stopPropagation()}>View all products</Link>
         </div>
         {subcategories.length?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8}}>
          {subcategories.map((s:any)=> <Link key={String(s.name)} href={"/explorer?entity=product&category="+encodeURIComponent(String(x.name||""))+"&subcategory="+encodeURIComponent(String(s.name||""))} onClick={e=>e.stopPropagation()} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",border:"1px solid #e6e8f0",borderRadius:10,background:"#fff",textDecoration:"none",color:"inherit"}}>
           <span><b style={{fontSize:13}}>{String(s.name||"Unclassified")}</b><small style={{display:"block",marginTop:3,color:"#667085"}}>{Number(s.product_count||0).toLocaleString()} products</small></span>
           <ChevronRight size={15}/>
          </Link>)}
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
