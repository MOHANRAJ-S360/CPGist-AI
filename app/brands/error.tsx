"use client";
import {useEffect} from "react";
export default function BrandError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
 useEffect(()=>{console.error("CPGist Brands route error",error)},[error]);
 return <main className="error-boundary"><div className="error-boundary-card"><div className="error-boundary-kicker">BRAND WORKSPACE</div><h1>We could not load this brand workspace</h1><p>The underlying data or chart component returned an error. Your data is not lost. Retry the workspace, or return to the dashboard.</p><div className="error-boundary-actions"><button onClick={()=>reset()}>Retry</button><a href="/dashboard">Dashboard</a></div></div></main>
}
