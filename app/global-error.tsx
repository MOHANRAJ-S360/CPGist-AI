"use client";
import {useEffect} from "react";
export default function GlobalError({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
 useEffect(()=>{console.error(error)},[error]);
 return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f7f8fa",fontFamily:"system-ui,sans-serif",padding:24}}>
  <div style={{maxWidth:560,width:"100%",background:"#fff",border:"1px solid #e5e8ef",borderRadius:16,padding:28,boxShadow:"0 14px 40px rgba(16,24,40,.08)"}}>
   <div style={{fontSize:12,fontWeight:800,color:"#6d5dfc",letterSpacing:".12em"}}>CPGist</div>
   <h1 style={{fontSize:22,margin:"10px 0 8px",color:"#101828"}}>This workspace could not be loaded</h1>
   <p style={{fontSize:13,lineHeight:1.6,color:"#667085",margin:"0 0 18px"}}>The page hit a client-side error. Your data is not lost. Retry the page, or return to the dashboard.</p>
   <div style={{display:"flex",gap:8}}><button onClick={reset} style={{border:0,borderRadius:9,padding:"10px 14px",background:"#6d5dfc",color:"#fff",fontWeight:700,cursor:"pointer"}}>Retry</button><a href="/dashboard" style={{border:"1px solid #dce1ea",borderRadius:9,padding:"10px 14px",color:"#344054",textDecoration:"none"}}>Dashboard</a></div>
   {process.env.NODE_ENV!=="production"&&<pre style={{marginTop:18,whiteSpace:"pre-wrap",fontSize:10,color:"#b42318"}}>{error?.message}</pre>}
  </div>
 </div>
}