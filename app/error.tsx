"use client";
import {useEffect} from "react";
export default function Error({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
 useEffect(()=>{console.error(error)},[error]);
 return <div className="error-boundary"><div className="error-boundary-card"><div className="error-boundary-kicker">CPGist</div><h1>We could not load this workspace</h1><p>The page hit an unexpected client-side error. Your data is not lost.</p><div className="error-boundary-actions"><button onClick={()=>reset()}>Retry</button><a href="/dashboard">Dashboard</a></div></div></div>;
}