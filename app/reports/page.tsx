"use client";
import {useEffect,useState} from "react";
import {FileText,RefreshCw,ShieldCheck,TrendingUp} from "lucide-react";
import {AppShell} from "../../components/app-shell";
import {BarChart,Donut,LineChart} from "../../components/cpg-charts";
import {supabaseBrowser} from "../../lib/supabase-browser";\nimport ReportExportButtons from "../../components/report-export-buttons";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}).format(n||0);
const pct=(n:number)=>(n>=0?"+":"")+n.toFixed(1)+"%";

export default function Reports(){
 const [d,setD]=useState<any>(null),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);try{const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session)throw new Error("Please sign in again.");const r=await fetch("/api/dashboard",{headers:{Authorization:"Bearer "+session.access_token}});const x=await r.json();if(!r.ok)throw new Error(x.error||"Report data failed.");setD(x)}catch(e:any){setD({error:e.message})}finally{setLoading(false)}}
 useEffect(()=>{load()},[]);

