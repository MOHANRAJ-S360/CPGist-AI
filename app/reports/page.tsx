"use client";
import {useEffect,useMemo,useState} from "react";
import {BarChart3,Download,FileText,Presentation,RefreshCw,ShieldCheck,TrendingUp} from "lucide-react";
import {AppShell} from "../../components/app-shell";
import {BarChart,LineChart,Donut} from "../../components/cpg-charts";
import {supabaseBrowser} from "../../lib/supabase-browser";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}).format(n||0);
const pct=(n:number)=> (n>=0?"+":"")+n.toFixed(1)+"%";

export default function Reports(){
 const [d,setD]=useState<any>(null),[loading,setLoading]=useState(true),[exporting,setExporting]=useState("");
 async function load(){
  setLoading(true);
  try{
   const {data:{session}}=await supabaseBrowser().auth.getSession();
   if(!session)throw new Error("Please sign in again.");
   const r=await fetch("/api/dashboard?source=syndicate",{headers:{Authorization:"Bearer "+session.access_token}});
   const x=await r.json();if(!r.ok)throw new Error(x.error||"Report data failed.");setD(x);
  }catch(e:any){setD({error:e.message})}finally{setLoading(false)}
 }
 useEffect(()=>{load()},[]);
 const reportDate=new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});
 const insight=useMemo(()=>{
  if(!d||d.error)return "";
  const growth=Number(d.growth||0)*100,leader=d.topBrands?.[0];
  return growth>=0
   ?"The latest completed period grew "+growth.toFixed(1)+"% versus the prior week. "+(leader?.name||"The leading brand")+" represents "+(leader?.share?.toFixed(1)||"—")+"% of observed value sales."
   :"The latest completed period softened "+Math.abs(growth).toFixed(1)+"% versus the prior week. "+(leader?.name||"The leading brand")+" remains the largest observed brand at "+(leader?.share?.toFixed(1)||"—")+"% share.";
 },[d]);

 async function downloadPdf(){
  if(!d||d.error)return;setExporting("pdf");
  try{
   const {jsPDF}=await import("jspdf");
   const doc=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"}),W=297;
   const header=(heading:string,sub:string)=>{doc.setFillColor(13,20,38);doc.rect(0,0,W,24,"F");doc.setTextColor(255,255,255);doc.setFontSize(16);doc.text("C",16,15);doc.text("CPGist",23,15);doc.setFontSize(8);doc.text("CPG INTELLIGENCE",23,20);doc.setFontSize(13);doc.text(heading,65,15);doc.setFontSize(8);doc.text(sub,65,20);doc.setTextColor(20,28,45)};
   header("Executive Market Performance Review","Prepared "+reportDate);
   doc.setFontSize(22);doc.text("Decision-ready view of market performance",16,43);
   doc.setFontSize(10);doc.setTextColor(88,98,115);doc.text(insight,16,53,{maxWidth:255});doc.setTextColor(20,28,45);
   const cards=[["Net sales",money(d.totalSales)],["Weekly growth",pct(Number(d.growth||0)*100)],["Units",new Intl.NumberFormat().format(d.totalUnits)],["Distribution",d.avgDistribution==null?"—":d.avgDistribution.toFixed(1)+"%"]];
   cards.forEach((c,i)=>{const x=16+i*66;doc.setDrawColor(225,229,237);doc.roundedRect(x,68,60,30,3,3);doc.setFontSize(8);doc.setTextColor(100,110,126);doc.text(c[0],x+5,78);doc.setFontSize(15);doc.setTextColor(20,28,45);doc.text(c[1],x+5,91)});
   doc.setFontSize(9);doc.setTextColor(100,110,126);doc.text("Coverage: "+(d.periods?.[0]||"—")+" to "+(d.periods?.at(-1)||"—")+" · "+(d.periodCount||d.periods?.length||0)+" periods · Source: "+(d.source||"syndicate"),16,115);
   doc.setFontSize(13);doc.setTextColor(20,28,45);doc.text("Brand performance",16,130);
   doc.setFontSize(9);doc.setTextColor(70,80,96);
   (d.topBrands||[]).slice(0,9).forEach((b:any,i:number)=>{const y=139+i*7;doc.text(String(i+1),17,y);doc.text(String(b.name).slice(0,28),25,y);doc.text(money(b.sales),112,y);doc.text(b.share.toFixed(1)+"%",155,y);doc.text(pct(b.growth||0),180,y)});
   doc.setFontSize(7);doc.setTextColor(120,130,145);doc.text("CPGist reporting note: all figures are calculated from the connected dataset. This report does not reproduce proprietary third-party syndicated methodology.",16,200);
   doc.save("CPGist_Executive_Market_Performance.pdf");
  }finally{setExporting("")}
 }

 async function downloadPpt(){
  if(!d||d.error)return;setExporting("pptx");
  try{
   const PptxGenJS=(await import("pptxgenjs")).default;
   const pptx=new PptxGenJS();pptx.layout="LAYOUT_WIDE";pptx.author="CPGist";pptx.company="CPGist";pptx.title="CPGist Executive Market Performance Review";
   const navy="0D1426",purple="6D5DFC",muted="657084",line="E3E7EE";
   const header=(slide:any,heading:string,sub:string)=>{slide.background={color:"F7F8FA"};slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:.55,fill:{color:navy},line:{color:navy}});slide.addText("C",{x:.28,y:.11,w:.3,h:.25,fontSize:16,bold:true,color:"FFFFFF",align:"center",valign:"mid",fill:{color:purple},margin:0});slide.addText("CPGist",{x:.68,y:.13,w:1,h:.2,fontSize:13,bold:true,color:"FFFFFF",margin:0});slide.addText(heading,{x:2.0,y:.12,w:6,h:.2,fontSize:12,bold:true,color:"FFFFFF",margin:0});slide.addText(sub,{x:9.1,y:.14,w:3.8,h:.15,fontSize:7,color:"CBD2DE",align:"right",margin:0)};
   let s=pptx.addSlide();header(s,"Executive Market Performance Review",reportDate);s.addText("Decision-ready view of market performance",{x:.65,y:1.15,w:11.7,h:.5,fontSize:26,bold:true,color:navy,margin:0});s.addText(insight,{x:.68,y:1.9,w:11.3,h:.65,fontSize:12,color:muted,margin:0.02});
   const cards=[["Net sales",money(d.totalSales)],["Weekly growth",pct(Number(d.growth||0)*100)],["Units",new Intl.NumberFormat().format(d.totalUnits)],["Distribution",d.avgDistribution==null?"—":d.avgDistribution.toFixed(1)+"%"]];
   cards.forEach((c,i)=>{const x=.68+i*3.02;s.addShape(pptx.ShapeType.roundRect,{x:x,y:3,w:2.75,h:1.1,rectRadius:.08,fill:{color:"FFFFFF"},line:{color:line}});s.addText(c[0],{x:x+.15,y:3.18,w:2.3,h:.18,fontSize:8,color:muted,margin:0});s.addText(c[1],{x:x+.15,y:3.55,w:2.3,h:.3,fontSize:18,bold:true,color:navy,margin:0})});
   s.addText("Coverage "+(d.periods?.[0]||"—")+" → "+(d.periods?.at(-1)||"—")+" · "+(d.periodCount||d.periods?.length||0)+" periods · Source "+(d.source||"syndicate"),{x:.7,y:5.15,w:11.7,h:.2,fontSize:8,color:muted,margin:0});
   s=pptx.addSlide();header(s,"Market trend and category context",(d.periods?.[0]||"—")+" → "+(d.periods?.at(-1)||"—"));s.addText("Weekly sales trend",{x:.7,y:.85,w:5,h:.3,fontSize:17,bold:true,color:navy,margin:0});
   const pts=(d.weekly||[]).slice(-26);s.addChart(pptx.ChartType.line,[{name:"Sales",labels:pts.map((x:any)=>x.label),values:pts.map((x:any)=>x.sales)}],{x:.7,y:1.35,w:7.2,h:4.7,showLegend:false,showTitle:false,chartColors:[purple],catAxisLabelFontSize:8,valAxisLabelFontSize:8});
   s.addText("Category performance",{x:8.35,y:.85,w:4,h:.3,fontSize:17,bold:true,color:navy,margin:0});s.addTable([["Category","Sales","Growth"]].concat((d.categories||[]).slice(0,8).map((x:any)=>[x.name,money(x.sales),pct(x.growth||0)])),{x:8.35,y:1.35,w:4.3,h:4.7,fontSize:9,border:{type:"solid",color:line,pt:1},fill:"FFFFFF",color:navy});
   s=pptx.addSlide();header(s,"Brand performance and share structure","Observed sales ranking");s.addText("Top brands by value sales",{x:.7,y:.85,w:6,h:.3,fontSize:17,bold:true,color:navy,margin:0});
   const top=(d.topBrands||[]).slice(0,8);s.addChart(pptx.ChartType.bar,[{name:"Sales",labels:top.map((x:any)=>x.name),values:top.map((x:any)=>x.sales)}],{x:.7,y:1.35,w:7.2,h:4.8,showLegend:false,chartColors:[purple],showValue:true,valAxisLabelFontSize:8,catAxisLabelFontSize:8});
   const leader=d.topBrands?.[0];s.addText("Leading brand share",{x:8.4,y:.85,w:4,h:.3,fontSize:17,bold:true,color:navy,margin:0});s.addShape(pptx.ShapeType.ellipse,{x:8.65,y:1.55,w:2.4,h:2.4,fill:{color:"EEEAFE"},line:{color:"EEEAFE"}});s.addText((leader?.share?.toFixed(1)||"—")+"%",{x:8.95,y:2.22,w:1.8,h:.35,fontSize:22,bold:true,color:purple,align:"center",margin:0});s.addText(leader?.name||"Leading brand",{x:8.45,y:4.2,w:2.8,h:.25,fontSize:11,bold:true,color:navy,align:"center",margin:0});s.addText("Share is descriptive. Read it with growth, distribution, price and category context.",{x:8.35,y:4.8,w:4.3,h:.9,fontSize:10,color:muted,margin:0.02});
   s=pptx.addSlide();header(s,"Management implications","Evidence-first narrative");s.addText("What the data says",{x:.7,y:.9,w:4,h:.3,fontSize:18,bold:true,color:navy,margin:0});
   const bullets=["Market growth: "+pct(Number(d.growth||0)*100)+" vs prior week.","Leading brand: "+(leader?.name||"—")+" at "+(leader?.share?.toFixed(1)||"—")+"% of observed sales.","Distribution: "+(d.avgDistribution==null?"not available":d.avgDistribution.toFixed(1)+"% average ACV distribution")+".","Latest period: "+(d.periods?.at(-1)||"—")+".","All quantitative claims in this deck are tied to the connected dataset."];
   bullets.forEach((b,i)=>s.addText(b,{x:.9,y:1.55+i*.65,w:11,h:.35,fontSize:13,color:navy,bullet:{indent:12},margin:0}));
   s.addText("Source and methodology",{x:.7,y:5.05,w:3,h:.25,fontSize:10,bold:true,color:muted,margin:0});s.addText("CPGist transforms connected weekly CPG facts into decision-ready views. Definitions, coverage and limitations should be read alongside the figures. This is an original CPGist report, not a reproduction of NIQ, Circana or Kantar output.",{x:.7,y:5.4,w:11.7,h:.6,fontSize:9,color:muted,margin:0.02});
   await pptx.writeFile({fileName:"CPGist_Executive_Market_Performance.pptx"});
  }finally{setExporting("")}
 }

 if(loading)return <AppShell title="Reports" subtitle="Decision-ready client reporting"><section className="content"><div className="card panel loading-card">Building report from live source data…</div></section></AppShell>;
 if(d?.error)return <AppShell title="Reports"><section className="content"><div className="card panel error-card">{d.error}</div></section></AppShell>;
 return <AppShell title="Reports" subtitle="Decision-ready client reporting"><section className="content">
  <div className="report-hero card"><div><div className="eyebrow">EXECUTIVE REPORTING</div><h1>CPGist Executive Market Performance Review</h1><p>Market context → performance → drivers → implications → methodology, with every quantitative statement tied to the connected dataset.</p><div className="report-meta"><span><ShieldCheck size={14}/>Source-anchored</span><span><TrendingUp size={14}/>Quantitative story</span><span><FileText size={14}/>Audit-friendly</span></div></div><div className="report-actions"><button className="primary" onClick={downloadPpt} disabled={!!exporting}><Presentation size={16}/>{exporting==="pptx"?"Building…":"PowerPoint"}</button><button className="secondary-btn" onClick={downloadPdf} disabled={!!exporting}><Download size={16}/>{exporting==="pdf"?"Building…":"PDF"}</button><button className="icon-btn report-refresh" onClick={load} title="Refresh source data"><RefreshCw size={16}/></button></div></div>
  <div className="report-grid-kpis"><div className="card kpi"><span>Net sales</span><strong>{money(d.totalSales)}</strong><small className={d.growth>=0?"positive":"negative"}>{pct(Number(d.growth||0)*100)} vs prior week</small></div><div className="card kpi"><span>Units</span><strong>{new Intl.NumberFormat().format(d.totalUnits)}</strong><small>Observed volume</small></div><div className="card kpi"><span>Distribution</span><strong>{d.avgDistribution==null?"—":d.avgDistribution.toFixed(1)+"%"}</strong><small>Average ACV</small></div><div className="card kpi"><span>Coverage</span><strong>{d.periodCount||d.periods?.length}</strong><small>weekly periods</small></div></div>
  <div className="two-col report-chart-row"><div className="card panel"><div className="panel-head"><div><b>Market value trend</b><span>Weekly sales across the observed source period</span></div><BarChart3 size={17}/></div><LineChart points={(d.weekly||[]).slice(-26).map((x:any)=>({label:x.label,value:x.sales}))}/></div><div className="card panel"><div className="panel-head"><div><b>Brand concentration</b><span>Share of observed value sales</span></div></div><div className="share-focus"><Donut share={Number(d.topBrands?.[0]?.share||0)} centerLabel="leader share"/><div><strong>{d.topBrands?.[0]?.name||"—"}</strong><p>{money(d.topBrands?.[0]?.sales||0)} observed sales</p><span>Descriptive share, not causal.</span></div></div></div></div>
  <div className="two-col report-chart-row"><div className="card panel"><div className="panel-head"><div><b>Brand performance</b><span>Value sales with period-over-period movement</span></div></div><BarChart items={(d.topBrands||[]).slice(0,8).map((x:any)=>({label:x.name,value:x.sales,change:x.growth}))}/></div><div className="card panel"><div className="panel-head"><div><b>Category context</b><span>Latest observed category performance</span></div></div><table><thead><tr><th>CATEGORY</th><th>SALES</th><th>GROWTH</th></tr></thead><tbody>{(d.categories||[]).slice(0,8).map((x:any)=><tr key={x.name}><td>{x.name}</td><td>{money(x.sales)}</td><td className={x.growth>=0?"positive":"negative"}>{pct(x.growth||0)}</td></tr>)}</tbody></table></div></div>
  <div className="card panel report-story"><div className="panel-head"><div><b>Executive story</b><span>What a client should see before the appendix</span></div></div><div className="story-grid"><div><span>01 · OBSERVE</span><h3>{d.growth>=0?"Market value is expanding":"Market value softened in the latest period"}</h3><p>{insight}</p></div><div><span>02 · DIAGNOSE</span><h3>Read share with distribution and category context</h3><p>{d.topBrands?.[0]?.name||"The leading brand"} has {d.topBrands?.[0]?.share?.toFixed(1)||"—"}% of observed value sales. CPGist keeps the number tied to the source period.</p></div><div><span>03 · ACT</span><h3>Move into the next decision</h3><p>Use AI Analyst for retailer whitespace, distribution diagnostics, pricing, anomaly and scenario questions using the same evidence layer.</p></div></div></div>
  <div className="report-footnote">Prepared {reportDate} · Source: {d.source} · Coverage: {d.periods?.[0]} → {d.periods?.at(-1)} · Original CPGist analytical report.</div>
 </section></AppShell>;
}
