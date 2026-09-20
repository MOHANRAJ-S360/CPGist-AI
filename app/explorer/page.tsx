"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {Boxes,Search,Store,Layers3,Map,PackageSearch,FileText} from "lucide-react";
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

export default function Explorer(){
 const [entity,setEntity]=useState<Entity>("brand");
 const [q,setQ]=useState("");
 const [rows,setRows]=useState<any[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 useEffect(()=>{
  let live=true;
  const run=async()=>{
   setLoading(true);setError("");
   try{
    const {data:{session}}=await supabaseBrowser().auth.getSession();
    if(!session)throw new Error("Please sign in again.");
    const r=await fetch("/api/explorer?entity="+entity+"&q="+encodeURIComponent(q),{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(typeof d?.error==="string"?d.error:d?.error?.message||"Search failed.");
    if(live)setRows(Array.isArray(d.results)?d.results:[]);
   }catch(e:any){
    if(live){setRows([]);setError(e?.message||"Search failed.");}
   }finally{if(live)setLoading(false);}
  };
  run();
  return()=>{live=false};
 },[entity,q]);

 const currentLabel=tabs.find(t=>t.id===entity)?.label||"Data";
 const detail=(x:any)=>{
  if(entity==="brand")return [x.category,x.parent_company].filter(Boolean).join(" · ");
  if(entity==="retailer")return [x.channel,x.region,x.retailer_group].filter(Boolean).join(" · ");
  if(entity==="product")return [x.category,x.subcategory,x.size].filter(Boolean).join(" · ");
  if(entity==="region")return [x.country,x.region_group].filter(Boolean).join(" · ");
  return [x.parent_category,x.subcategory_count!=null?x.subcategory_count+" subcategories":""].filter(Boolean).join(" · ");
 };
 return <AppShell title="Data Explorer" subtitle="Find specific brands, products, retailers, categories and regions">
  <section className="content">
   <div className="intro"><div><div className="muted">DATA EXPLORATION</div><h1>Find the exact data you need</h1><p>Search the active dataset directly. Open a brand report or send the selected brand into AI Analyst without losing scope.</p></div></div>
   <div className="card explorer-toolbar">
    <div className="explorer-tabs">{tabs.map(tab=>{const Icon=tab.icon;return <button key={tab.id} className={entity===tab.id?"active":""} onClick={()=>{setEntity(tab.id);setQ("");}}><Icon size={14}/>{tab.label}</button>})}</div>
    <div className="explorer-search"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={"Search "+currentLabel.toLowerCase()+"…"} autoFocus/></div>
   </div>
   <div className="card panel">
    <div className="panel-head"><div><b>{currentLabel} directory</b><span>{rows.length.toLocaleString()} matching records</span></div></div>
    {error?<div className="form-error">{error}</div>:loading?<div className="loading-card">Searching live data…</div>:<div className="explorer-results">
      {rows.map((x:any,i:number)=><div className="explorer-result" key={String(x.id??x.name??i)}>
       <div className="explorer-result-icon">{entity==="product"?<PackageSearch size={15}/>:entity==="retailer"?<Store size={15}/>:entity==="category"?<Layers3 size={15}/>:entity==="region"?<Map size={15}/>:<Boxes size={15}/>}</div>
       <div className="explorer-result-copy"><b>{String(x.name||"Unnamed")}</b><span>{detail(x)}</span></div>
       {entity==="brand"&&<div className="explorer-result-actions"><Link className="secondary-btn" href={"/reports?brand_id="+x.id}><FileText size={13}/>Report</Link><Link className="primary" href={"/ai-analyst?brand_id="+x.id}>AI</Link></div>}
      </div>)}
      {!rows.length&&<div className="empty-detail">No matching records. Try a broader search.</div>}
    </div>}
   </div>
  </section>
 </AppShell>
}
