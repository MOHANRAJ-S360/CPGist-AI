// @ts-nocheck
"use client";
import {useState} from "react";
import {Download,Presentation} from "lucide-react";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}).format(n||0);
const pct=(n:number)=>(n>=0?"+":"")+n.toFixed(1)+"%";

function loadScript(src:string,id:string){return new Promise<void>((resolve,reject)=>{const old=document.getElementById(id);if(old){resolve();return}const s=document.createElement("script");s.id=id;s.src=src;s.async=true;s.onload=()=>resolve();s.onerror=()=>reject(new Error("Export library could not be loaded. Please retry."));document.head.appendChild(s)})}

export default function ReportExportButtons({data}:{data:any}){
 const [busy,setBusy]=useState("");
 async function pdf(){
  setBusy("pdf");
  try{
   await loadScript("https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js","cpgist-jspdf");
   const jsPDF=(window as any).jspdf?.jsPDF;if(!jsPDF)throw new Error("PDF export is unavailable.");
   const doc=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});doc.setFillColor(13,20,38);doc.rect(0,0,297,24,"F");doc.setTextColor(255,255,255);doc.setFontSize(17);doc.text("C  CPGist",16,15);doc.setFontSize(8);doc.text("CPG INTELLIGENCE · EXECUTIVE MARKET PERFORMANCE",16,20);doc.setTextColor(20,28,45);doc.setFontSize(22);doc.text("Executive market performance review",16,43);doc.setFontSize(10);doc.setTextColor(88,98,115);doc.text("Coverage "+(data.periods?.[0]||"—")+" to "+(data.periods?.[data.periods.length-1]||"—"),16,52);doc.setTextColor(20,28,45);
   const cards=[["Net sales",money(data.totalSales)],["Weekly growth",pct(Number(data.growth||0)*100)],["Units",new Intl.NumberFormat().format(data.totalUnits||0)],["Distribution",data.avgDistribution==null?"—":Number(data.avgDistribution).toFixed(1)+"%"]];cards.forEach((c:any,i:number)=>{const x=16+i*66;doc.setDrawColor(225,229,237);doc.roundedRect(x,64,60,30,3,3);doc.setFontSize(8);doc.setTextColor(100,110,126);doc.text(c[0],x+5,74);doc.setFontSize(15);doc.setTextColor(20,28,45);doc.text(c[1],x+5,88)});
   doc.setFontSize(13);doc.text("Top brands",16,110);doc.setFontSize(9);(data.topBrands||[]).slice(0,10).forEach((b:any,i:number)=>{const y=120+i*7;doc.text(String(i+1),17,y);doc.text(String(b.name).slice(0,30),25,y);doc.text(money(Number(b.sales||0)),120,y);doc.text(Number(b.share||0).toFixed(1)+"%",165,y)});doc.setFontSize(7);doc.setTextColor(120,130,145);doc.text("All figures are calculated from the connected CPGist dataset. Original CPGist analytical report.",16,200);doc.save("CPGist_Executive_Market_Performance.pdf");
  }catch(e:any){window.alert(e?.message||"PDF export failed.")}finally{setBusy("")}
 }
 async function ppt(){
  setBusy("pptx");
  try{
   await loadScript("https://cdn.jsdelivr.net/gh/gitbrent/pptxgenjs@4.0.1/dist/pptxgen.bundle.js","cpgist-pptx");
   const Pptx=(window as any).PptxGenJS;if(!Pptx)throw new Error("PowerPoint export is unavailable.");
   const pptx=new Pptx();pptx.layout="LAYOUT_WIDE";pptx.author="CPGist";pptx.title="CPGist Executive Market Performance";const navy="0D1426",purple="6D5DFC";
   const head=(s:any,t:string,sub:string)=>{s.background={color:"F7F8FA"};s.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.33,h:.55,fill:{color:navy},line:{color:navy}});s.addText("C",{x:.3,y:.1,w:.28,h:.28,fontSize:16,bold:true,color:"FFFFFF",align:"center",fill:{color:purple},margin:0});s.addText("CPGist",{x:.7,y:.14,w:1,h:.2,fontSize:13,bold:true,color:"FFFFFF",margin:0});s.addText(t,{x:2,y:.14,w:6,h:.2,fontSize:12,bold:true,color:"FFFFFF",margin:0});s.addText(sub,{x:9,y:.16,w:3.7,h:.15,fontSize:7,color:"CBD2DE",align:"right",margin:0)};
   let s=pptx.addSlide();head(s,"Executive Market Performance","Source-anchored");s.addText("Decision-ready market view",{x:.7,y:1.15,w:11,h:.45,fontSize:25,bold:true,color:navy,margin:0});s.addText("Coverage "+(data.periods?.[0]||"—")+" → "+(data.periods?.[data.periods.length-1]||"—"),{x:.7,y:1.8,w:7,h:.2,fontSize:10,color:"657084",margin:0});const cards=[["Net sales",money(data.totalSales)],["Weekly growth",pct(Number(data.growth||0)*100)],["Units",new Intl.NumberFormat().format(data.totalUnits||0)],["Distribution",data.avgDistribution==null?"—":Number(data.avgDistribution).toFixed(1)+"%"]];cards.forEach((c:any,i:number)=>{const x=.7+i*3.02;s.addShape(pptx.ShapeType.roundRect,{x:x,y:2.5,w:2.75,h:1.15,fill:{color:"FFFFFF"},line:{color:"E3E7EE"}});s.addText(c[0],{x:x+.15,y:2.72,w:2.3,h:.18,fontSize:8,color:"657084",margin:0});s.addText(c[1],{x:x+.15,y:3.05,w:2.3,h:.3,fontSize:18,bold:true,color:navy,margin:0})});
   s=pptx.addSlide();head(s,"Market trend and brand performance","Observed sales");s.addText("Weekly market sales",{x:.7,y:.85,w:4,h:.3,fontSize:17,bold:true,color:navy,margin:0});const pts=(data.weekly||[]).slice(-26);s.addChart(pptx.ChartType.line,[{name:"Sales",labels:pts.map((x:any)=>x.label),values:pts.map((x:any)=>x.sales)}],{x:.7,y:1.35,w:7.2,h:4.7,showLegend:false,chartColors:[purple],showValue:false});s.addText("Top brands",{x:8.3,y:.85,w:4,h:.3,fontSize:17,bold:true,color:navy,margin:0});s.addTable([["Brand","Sales","Share"]].concat((data.topBrands||[]).slice(0,8).map((x:any)=>[x.name,money(Number(x.sales||0)),Number(x.share||0).toFixed(1)+"%"])),{x:8.3,y:1.35,w:4.35,h:4.7,fontSize:9,border:{type:"solid",color:"E3E7EE",pt:1},fill:"FFFFFF",color:navy});
   s=pptx.addSlide();head(s,"Management implications","Evidence-first");s.addText("What the data says",{x:.7,y:.9,w:4,h:.3,fontSize:18,bold:true,color:navy,margin:0});const lead=(data.topBrands||[])[0];["Observed sales: "+money(data.totalSales)+".","Weekly movement: "+pct(Number(data.growth||0)*100)+" vs prior week.","Leading brand: "+(lead?.name||"—")+" at "+Number(lead?.share||0).toFixed(1)+"% share.","Latest source period: "+(data.periods?.[data.periods.length-1]||"—")+".","Use AI Analyst for diagnosis, scenarios and next decisions."].forEach((b:string,i:number)=>s.addText(b,{x:.9,y:1.55+i*.65,w:11,h:.35,fontSize:13,color:navy,bullet:{indent:12},margin:0}));s.addText("CPGist · quantitative client reporting",{x:.7,y:5.8,w:6,h:.2,fontSize:8,color:"657084",margin:0});await pptx.writeFile({fileName:"CPGist_Executive_Market_Performance.pptx"});
  }catch(e:any){window.alert(e?.message||"PowerPoint export failed.")}finally{setBusy("")}
 }
 return <div className="report-actions"><button className="primary" onClick={ppt} disabled={!!busy}><Presentation size={16}/>{busy==="pptx"?"Building…":"PowerPoint"}</button><button className="secondary-btn" onClick={pdf} disabled={!!busy}><Download size={16}/>{busy==="pdf"?"Building…":"PDF"}</button></div>
}
