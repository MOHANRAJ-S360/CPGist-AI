"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {BarChart3,Download,FileText,Presentation,RefreshCw,Search,ShieldCheck,TrendingUp} from "lucide-react";
import {AppShell} from "../../components/app-shell";
import {BarChart,Donut,LineChart} from "../../components/cpg-charts";
import {supabaseBrowser} from "../../lib/supabase-browser";

const money=(n:any)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}).format(Number(n)||0);
const num=(n:any)=>Number(n)||0;
const pct=(n:any)=>(num(n)>=0?"+":"")+num(n).toFixed(1)+"%";
const safe=(v:any)=>v==null?"":String(v);

declare global{interface Window{jspdf?:any;PptxGenJS?:any}}

function loadScript(src:string,id:string){return new Promise<void>((resolve,reject)=>{if(document.getElementById(id)){resolve();return}const s=document.createElement("script");s.id=id;s.src=src;s.async=true;s.onload=()=>resolve();s.onerror=()=>reject(new Error("Export library could not be loaded. Retry with an active internet connection."));document.head.appendChild(s)})}

export default function Reports(){
 const [brandId,setBrandId]=useState<string|null>(null),[q,setQ]=useState(""),[brandResults,setBrandResults]=useState<any[]>([]);
 const [d,setD]=useState<any>(null),[loading,setLoading]=useState(true),[exporting,setExporting]=useState("");
 useEffect(()=>{setBrandId(new URLSearchParams(window.location.search).get("brand_id"))},[]);

 async function token(){const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session)throw new Error("Please sign in again.");return session.access_token}
 async function load(){
  setLoading(true);
  try{
   const t=await token();
   const url=brandId?"/api/explorer?entity=brand&id="+encodeURIComponent(brandId):"/api/dashboard?source=syndicate";
   const r=await fetch(url,{headers:{Authorization:"Bearer "+t},cache:"no-store"});const x=await r.json();if(!r.ok)throw new Error(x.error||"Report data failed.");
   if(brandId)setD({...x,scope:"brand",source:"syndicate",totalSales:x.metrics?.sales,totalUnits:x.metrics?.units,avgDistribution:x.metrics?.distribution,growth:x.metrics?.growth,topBrands:[{name:x.brand?.name,sales:x.metrics?.sales,share:100,growth:x.metrics?.growth}]});
   else setD({...x,scope:"market"});
  }catch(e:any){setD({error:e?.message||"Report data failed."})}finally{setLoading(false)}
 }
 useEffect(()=>{load()},[brandId]);

 useEffect(()=>{
  let live=true;
  if(!q.trim()){setBrandResults([]);return}
  (async()=>{try{const t=await token();const r=await fetch("/api/explorer?entity=brand&q="+encodeURIComponent(q),{headers:{Authorization:"Bearer "+t},cache:"no-store"});const x=await r.json();if(live)setBrandResults(Array.isArray(x.results)?x.results.slice(0,10):[])}catch{if(live)setBrandResults([])}})();
  return()=>{live=false}
 },[q]);

 const growth=useMemo(()=>d?.scope==="brand"?num(d?.growth):num(d?.growth)*100,[d]);
 const leader=d?.topBrands?.[0];
 const insight=d?.scope==="brand"
  ? safe(d?.brand?.name)+" generated "+money(d?.totalSales)+" in the latest 13 weeks, "+pct(growth)+" versus the prior 13 weeks. The report remains scoped to this brand."
  : "Observed market sales are "+money(d?.totalSales)+" in the latest 13 weeks, with "+(leader?.name||"the leading brand")+" representing "+num(leader?.share).toFixed(1)+"% of observed value sales.";

 async function downloadPdf(){
  if(!d||d.error)return;setExporting("pdf");
  try{
   await loadScript("https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js","cpgist-jspdf");
   const jsPDF=window.jspdf?.jsPDF;if(!jsPDF)throw new Error("PDF export library is unavailable.");
   const doc=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"}),W=297;
   const header=(heading:string)=>{doc.setFillColor(13,20,38);doc.rect(0,0,W,24,"F");doc.setTextColor(255,255,255);doc.setFontSize(15);doc.text("C",16,15);doc.text("CPGist",23,15);doc.setFontSize(7);doc.text("CPG INTELLIGENCE",23,20);doc.setFontSize(12);doc.text(heading,65,15);doc.setFontSize(7);doc.text("Source-anchored · "+(d.periods?.[0]||"—")+" → "+(d.periods?.at(-1)||"—"),65,20);doc.setTextColor(20,28,45)};
   header(d.scope==="brand"?safe(d.brand?.name)+" — Brand Performance Review":"Executive Market Performance Review");
   doc.setFontSize(21);doc.text(d.scope==="brand"?"Client brand performance":"Decision-ready market performance",16,41);
   doc.setFontSize(9);doc.setTextColor(88,98,115);doc.text(insight,16,50,{maxWidth:258});doc.setTextColor(20,28,45);
   const cards=[[d.scope==="brand"?"Latest 13W sales":"Net sales",money(d.totalSales)],[d.scope==="brand"?"13W growth":"Weekly growth",pct(growth)],["Units",new Intl.NumberFormat().format(num(d.totalUnits))],["Distribution",d.avgDistribution==null?"—":num(d.avgDistribution).toFixed(1)+"%"]];
   cards.forEach((c,i)=>{const x=16+i*66;doc.setDrawColor(225,229,237);doc.roundedRect(x,64,60,28,3,3);doc.setFontSize(7);doc.setTextColor(100,110,126);doc.text(c[0],x+5,74);doc.setFontSize(14);doc.setTextColor(20,28,45);doc.text(c[1],x+5,87)});
   doc.setFontSize(8);doc.setTextColor(100,110,126);doc.text("Coverage: "+(d.periods?.[0]||"—")+" to "+(d.periods?.at(-1)||"—")+" · "+(d.periods?.length||0)+" weekly periods",16,104);
   doc.setFontSize(12);doc.setTextColor(20,28,45);doc.text(d.scope==="brand"?"Product master":"Brand performance",16,119);
   doc.setFontSize(8);doc.setTextColor(70,80,96);
   if(d.scope==="brand"){(d.products||[]).slice(0,14).forEach((p:any,i:number)=>{const y=128+i*5.5;doc.text(safe(p.name).slice(0,42),18,y);doc.text(safe(p.category||"—").slice(0,22),150,y);doc.text(safe(p.subcategory||"—").slice(0,22),205,y)})}
   else {(d.topBrands||[]).slice(0,12).forEach((b:any,i:number)=>{const y=128+i*5.5;doc.text(String(i+1),18,y);doc.text(safe(b.name).slice(0,32),27,y);doc.text(money(b.sales),125,y);doc.text(num(b.share).toFixed(1)+"%",165,y);doc.text(pct(num(b.growth)*100),195,y)})}
   doc.setFontSize(7);doc.setTextColor(120,130,145);doc.text("CPGist report: figures are calculated from the connected dataset; narrative does not substitute for quantitative evidence.",16,205);
   doc.save((d.scope==="brand"?safe(d.brand?.name).replace(/[^a-z0-9]+/gi,"_")+"_Brand_Report":"CPGist_Executive_Market_Performance")+".pdf");
  }finally{setExporting("")}
 }

 async function downloadPpt(){
  if(!d||d.error)return;setExporting("pptx");
  try{
   await loadScript("https://cdn.jsdelivr.net/gh/gitbrent/pptxgenjs@4.0.1/dist/pptxgen.bundle.js","cpgist-pptx");
   const PptxGenJS=window.PptxGenJS;if(!PptxGenJS)throw new Error("PowerPoint export library is unavailable.");
   const pptx=new PptxGenJS();pptx.layout="LAYOUT_WIDE";pptx.author="CPGist";pptx.company="CPGist";pptx.title=d.scope==="brand"?safe(d.brand?.name)+" Brand Performance Review":"CPGist Executive Market Performance Review";
   const navy="0D1426",purple="6D5DFC",muted="657084",line="E3E7EE";
   const header=(s:any,title:string,sub:string)=>{s.background={color:"F7F8FA"};s.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:.55,fill:{color:navy},line:{color:navy}});s.addText("C",{x:.28,y:.11,w:.3,h:.25,fontSize:16,bold:true,color:"FFFFFF",align:"center",valign:"mid",fill:{color:purple},margin:0});s.addText("CPGist",{x:.68,y:.13,w:1,h:.2,fontSize:13,bold:true,color:"FFFFFF",margin:0});s.addText(title,{x:2.0,y:.12,w:6.4,h:.2,fontSize:12,bold:true,color:"FFFFFF",margin:0});s.addText(sub,{x:9.0,y:.14,w:3.9,h:.15,fontSize:7,color:"CBD2DE",align:"right",margin:0)};
   let s=pptx.addSlide();header(s,d.scope==="brand"?safe(d.brand?.name)+" — Brand Review":"Executive Market Performance Review",safe(d.periods?.[0])+" → "+safe(d.periods?.at(-1)));s.addText(d.scope==="brand"?"Client-specific quantitative story":"Decision-ready quantitative market story",{x:.65,y:1.05,w:11.7,h:.45,fontSize:25,bold:true,color:navy,margin:0});s.addText(insight,{x:.68,y:1.75,w:11.3,h:.65,fontSize:11,color:muted,margin:0.02});
   const cards=[["Sales",money(d.totalSales)],["Growth",pct(growth)],["Units",new Intl.NumberFormat().format(num(d.totalUnits))],["ACV",d.avgDistribution==null?"—":num(d.avgDistribution).toFixed(1)+"%"]];cards.forEach((c,i)=>{const x=.68+i*3.02;s.addShape(pptx.ShapeType.roundRect,{x,y:2.8,w:2.75,h:1.05,rectRadius:.08,fill:{color:"FFFFFF"},line:{color:line}});s.addText(c[0],{x:x+.15,y:3.02,w:2.3,h:.18,fontSize:8,color:muted,margin:0});s.addText(c[1],{x:x+.15,y:3.36,w:2.3,h:.28,fontSize:17,bold:true,color:navy,margin:0})});s.addText("CPGist · source-anchored · quantitative figures first",{x:.7,y:5.2,w:11.7,h:.2,fontSize:8,color:muted,margin:0});
   s=pptx.addSlide();header(s,d.scope==="brand"?safe(d.brand?.name)+" — Sales Trend":"Market Trend",safe(d.periods?.[0])+" → "+safe(d.periods?.at(-1)));s.addText("Weekly sales trend",{x:.7,y:.85,w:5,h:.3,fontSize:17,bold:true,color:navy,margin:0});const pts=(d.weekly||[]).slice(-26);s.addChart(pptx.ChartType.line,[{name:"Sales",labels:pts.map((x:any)=>safe(x.period)),values:pts.map((x:any)=>num(x.sales))}],{x:.7,y:1.35,w:8,h:4.8,showLegend:false,showTitle:false,chartColors:[purple],catAxisLabelFontSize:7,valAxisLabelFontSize:7});
   if(d.scope==="brand"){s.addText("Product master",{x:9.05,y:.85,w:3,h:.3,fontSize:17,bold:true,color:navy,margin:0});s.addTable([["Product","Category","Subcategory"]].concat((d.products||[]).slice(0,9).map((p:any)=>[safe(p.name),safe(p.category||"—"),safe(p.subcategory||"—")])),{x:9.05,y:1.35,w:3.7,h:4.8,fontSize:8,border:{type:"solid",color:line,pt:1},fill:"FFFFFF",color:navy})}
   else{s.addText("Brand performance",{x:9.05,y:.85,w:3,h:.3,fontSize:17,bold:true,color:navy,margin:0});s.addTable([["Brand","Sales","Growth"]].concat((d.topBrands||[]).slice(0,9).map((b:any)=>[safe(b.name),money(b.sales),pct(num(b.growth)*100)])),{x:9.05,y:1.35,w:3.7,h:4.8,fontSize:8,border:{type:"solid",color:line,pt:1},fill:"FFFFFF",color:navy})}
   s=pptx.addSlide();header(s,d.scope==="brand"?safe(d.brand?.name)+" — Retailer Context":"Management Implications","Evidence-first context");s.addText(d.scope==="brand"?"Retailer footprint":"What the numbers say",{x:.7,y:.85,w:6,h:.3,fontSize:17,bold:true,color:navy,margin:0});
   if(d.scope==="brand"&&Array.isArray(d.retailers)&&d.retailers.length)s.addTable([["Retailer","Channel","Region","Sales"]].concat(d.retailers.slice(0,12).map((r:any)=>[safe(r.name),safe(r.channel||"—"),safe(r.region||"—"),money(r.sales)])),{x:.7,y:1.35,w:8.3,h:4.8,fontSize:8,border:{type:"solid",color:line,pt:1},fill:"FFFFFF",color:navy});
   else{s.addText(d.scope==="brand"?"Retailer-level facts are not loaded in the compact layer yet.":"Select a client brand in the Reports scope finder to create a brand-specific deck.",{x:.7,y:1.5,w:7.6,h:1.0,fontSize:12,color:muted,margin:0.02})}
   s.addText("Quantitative interpretation",{x:9.35,y:.85,w:3,h:.3,fontSize:17,bold:true,color:navy,margin:0});s.addText(insight,{x:9.35,y:1.35,w:3.2,h:1.4,fontSize:10,color:muted,margin:0.02});s.addText("Use AI Analyst for the next question; CPGist keeps exported material scoped to the selected business object.",{x:9.35,y:3.0,w:3.2,h:1.3,fontSize:10,color:muted,margin:0.02});
   await pptx.writeFile({fileName:(d.scope==="brand"?safe(d.brand?.name).replace(/[^a-z0-9]+/gi,"_")+"_Brand_Report":"CPGist_Executive_Market_Performance")+".pptx"});
  }finally{setExporting("")}
 }

 if(loading)return <AppShell title="Reports" subtitle="Decision-ready client reporting"><section className="content"><div className="card panel loading-card">Building report from live source data…</div></section></AppShell>;
 if(d?.error)return <AppShell title="Reports"><section className="content"><div className="card panel error-card">{d.error}</div></section></AppShell>;

 return <AppShell title="Reports" subtitle={d.scope==="brand"?"Focused client brand reporting":"Decision-ready market reporting"}><section className="content">
  <div className="report-hero card"><div><div className="eyebrow">{d.scope==="brand"?"BRAND REPORT":"EXECUTIVE REPORTING"}</div><h1>{d.scope==="brand"?safe(d.brand?.name)+" — Brand Performance Review":"CPGist Executive Market Performance Review"}</h1><p>{d.scope==="brand"?"Every figure below is scoped to the selected brand, with product master and retailer context where available.":"Use the scope finder below to switch from market context to a precise client-brand story before exporting."}</p><div className="report-meta"><span><ShieldCheck size={14}/>Source-anchored</span><span><TrendingUp size={14}/>Quantitative story</span><span><FileText size={14}/>Client-ready</span></div></div><div className="report-actions"><button className="primary" onClick={downloadPpt} disabled={!!exporting}><Presentation size={16}/>{exporting==="pptx"?"Building…":"PowerPoint"}</button><button className="secondary-btn" onClick={downloadPdf} disabled={!!exporting}><Download size={16}/>{exporting==="pdf"?"Building…":"PDF"}</button><button className="icon-btn report-refresh" onClick={load} disabled={!!exporting}><RefreshCw size={16}/></button></div></div>
  <div className="card report-scope"><div><b>Report scope</b><span>{d.scope==="brand"?"Currently scoped to "+safe(d.brand?.name)+". Search another brand to switch the entire report.":"Search any brand to replace the market report with a client-specific report."}</span></div><div className="scope-search"><Search size={14}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search all brands…"/>{q&&brandResults.length>0&&<div className="scope-results">{brandResults.map((b:any)=><Link key={String(b.id)} href={"/reports?brand_id="+encodeURIComponent(String(b.id))}><b>{safe(b.name)}</b><span>{safe(b.category||"Unclassified")} · {safe(b.parent_company||"Independent")}</span></Link>)}</div>}</div></div>
  <div className="report-grid-kpis"><div className="card kpi"><span>{d.scope==="brand"?"Latest 13W sales":"Net sales"}</span><strong>{money(d.totalSales)}</strong><small className={growth>=0?"positive":"negative"}>{pct(growth)} vs prior 13W</small></div><div className="card kpi"><span>Units</span><strong>{new Intl.NumberFormat().format(num(d.totalUnits))}</strong><small>{d.scope==="brand"?"Selected brand only":"Observed market"}</small></div><div className="card kpi"><span>Distribution</span><strong>{d.avgDistribution==null?"—":num(d.avgDistribution).toFixed(1)+"%"}</strong><small>Average ACV</small></div><div className="card kpi"><span>Periods</span><strong>{d.periods?.length||0}</strong><small>Weekly source periods</small></div></div>
  <div className="two-col"><div className="card panel"><div className="panel-head"><div><b>{d.scope==="brand"?safe(d.brand?.name)+" sales trend":"Market value trend"}</b><span>Latest 26 completed source periods</span></div></div><LineChart points={(d.weekly||[]).slice(-26).map((x:any)=>({label:safe(x.label||x.period),value:num(x.sales)}))}/></div><div className="card panel"><div className="panel-head"><div><b>{d.scope==="brand"?"Selected brand":"Brand concentration"}</b><span>{d.scope==="brand"?"100% of this scoped report":"Observed value share"}</span></div></div><div className="share-focus"><Donut share={Number(leader?.share||0)} centerLabel={d.scope==="brand"?"selected":"leader share"}/><div><strong>{safe(leader?.name)||"—"}</strong><p>{money(leader?.sales||0)} · {d.scope==="brand"?pct(growth):num(leader?.share).toFixed(1)+"% share"}</p><span>{d.scope==="brand"?"No unrelated brands are included in the brand story.":"Select a brand above to remove unrelated brand context."}</span></div></div></div></div>
  {d.scope==="brand"&&<div className="two-col"><div className="card panel"><div className="panel-head"><div><b>Product master</b><span>{Array.isArray(d.products)?d.products.length:0} products mapped to this brand</span></div></div><div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>SUBCATEGORY</th><th>SIZE</th></tr></thead><tbody>{(d.products||[]).map((x:any)=><tr key={String(x.id)}><td>{safe(x.name)}</td><td>{safe(x.category||"—")}</td><td>{safe(x.subcategory||"—")}</td><td>{safe(x.size||"—")}</td></tr>)}</tbody></table></div></div><div className="card panel"><div className="panel-head"><div><b>Retailer footprint</b><span>Brand × retailer relationships where loaded</span></div></div>{d.retailers?.length?<div className="table-scroll"><table><thead><tr><th>RETAILER</th><th>CHANNEL</th><th>REGION</th><th>SALES</th><th>DISTRIBUTION</th></tr></thead><tbody>{d.retailers.map((x:any)=><tr key={String(x.retailer_id)+"-"+String(x.category)}><td>{safe(x.name)}</td><td>{safe(x.channel||"—")}</td><td>{safe(x.region||"—")}</td><td>{money(x.sales)}</td><td>{x.distribution==null?"—":num(x.distribution).toFixed(1)+"%"}</td></tr>)}</tbody></table></div>:<div className="empty-state">Retailer-level brand relationships are not loaded yet. The report remains valid; import the compact brand-retailer aggregate to populate this view.</div>}</div></div>}
  {d.scope==="market"&&<div className="two-col"><div className="card panel"><div className="panel-head"><div><b>Brand performance</b><span>Observed value sales</span></div></div><BarChart items={(d.topBrands||[]).slice(0,10).map((x:any)=>({label:safe(x.name),value:num(x.sales),change:num(x.growth)*100}))}/></div><div className="card panel"><div className="panel-head"><div><b>Category context</b><span>Latest observed category performance</span></div></div><table><thead><tr><th>CATEGORY</th><th>SALES</th><th>GROWTH</th></tr></thead><tbody>{(d.categories||[]).slice(0,12).map((x:any)=><tr key={safe(x.name)}><td>{safe(x.name)}</td><td>{money(x.sales)}</td><td className={num(x.growth)>=0?"positive":"negative"}>{pct(num(x.growth)*100)}</td></tr>)}</tbody></table></div></div>}
  <div className="card panel report-story"><div className="panel-head"><div><b>Executive story</b><span>Numbers first. Narrative second.</span></div></div><div className="story-grid"><div><span>01 · OBSERVE</span><h3>Performance</h3><p>{insight}</p></div><div><span>02 · DIAGNOSE</span><h3>Keep context attached</h3><p>{d.scope==="brand"?"Use distribution, retailer, product and promotion evidence to explain the brand movement.":"Use category and brand context to frame the market movement."}</p></div><div><span>03 · ACT</span><h3>Next decision</h3><p>{d.scope==="brand"?"Ask AI Analyst a brand-scoped question or export this exact brand story.":"Search a client brand above before exporting client-facing material."}</p></div></div></div>
  <div className="report-footnote">Source: {safe(d.source||"syndicate")} · Coverage: {safe(d.periods?.[0])} → {safe(d.periods?.at(-1))} · Scope: {d.scope==="brand"?safe(d.brand?.name):"Market"} · Original CPGist analytical report.</div>
 </section></AppShell>
}
