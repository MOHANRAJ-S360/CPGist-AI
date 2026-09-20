"use client";
import {useEffect,useState} from "react";

export default function ReportExportButtons({data}:{data:any}){
 const [busy,setBusy]=useState("");
 useEffect(()=>{if(document.getElementById("cpgist-export-runtime"))return;const s=document.createElement("script");s.id="cpgist-export-runtime";s.src="/cpgist-export.js";s.async=true;document.body.appendChild(s)},[]);
 async function run(kind:"pdf"|"pptx"){setBusy(kind);try{const fn=(window as any).CPGistExport?.[kind];if(!fn)throw new Error("Export runtime is still loading. Please retry.");await fn(data)}catch(e:any){window.alert(e?.message||"Export failed.")}finally{setBusy("")}}
 return <div className="report-actions"><button className="primary" onClick={()=>run("pptx")} disabled={!!busy}>{busy==="pptx"?"Building…":"PowerPoint"}</button><button className="secondary-btn" onClick={()=>run("pdf")} disabled={!!busy}>{busy==="pdf"?"Building…":"PDF"}</button></div>
}
