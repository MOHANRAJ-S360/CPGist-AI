"use client";
import {useEffect} from "react";
export default function SectionError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
 useEffect(()=>{console.error("CPGist workspace route error",error)},[error]);
 return <main className="error-boundary"><div className="error-boundary-card"><div className="error-boundary-kicker">CPGist WORKSPACE</div><h1>This workspace could not be loaded</h1><p>Retry the page to reload its data, or return to the dashboard.</p><div className="error-boundary-actions"><button onClick={()=>reset()}>Retry</button><a href="/dashboard">Dashboard</a></div></div></main>
}
