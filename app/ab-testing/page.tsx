"use client";

import {useMemo,useState} from "react";
import {FlaskConical,Info,ShieldCheck,TrendingUp,Users,Target} from "lucide-react";
import {AppShell} from "../../components/app-shell";

const n=(v:string)=>Number(v||0);
const pct=(v:number)=>`${v>=0?"+":""}${v.toFixed(1)}%`;
const money=(v:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}).format(v);

function twoProportionZ(a:number,an:number,b:number,bn:number){
 if(!an||!bn)return null;
 const p1=a/an,p2=b/bn,p=(a+b)/(an+bn);
 const se=Math.sqrt(p*(1-p)*(1/an+1/bn));
 return se?Math.abs(p1-p2)/se:null;
}

export default function ABTesting(){
 const [metric,setMetric]=useState("conversion");
 const [controlValue,setControlValue]=useState("12.0"),[testValue,setTestValue]=useState("14.5");
 const [controlN,setControlN]=useState("1000"),[testN,setTestN]=useState("1000");
 const [hypothesis,setHypothesis]=useState("Test whether the new price/promotion/packaging improves the selected KPI.");
 const c=n(controlValue),t=n(testValue),cn=Math.max(1,n(controlN)),tn=Math.max(1,n(testN));
 const result=useMemo(()=>{
   const lift=c?((t/c)-1)*100:null;
   const diff=t-c;
   const z=metric==="conversion"?twoProportionZ(c/100*cn,cn,t/100*tn,tn):null;
   const significant=z!=null?z>=1.96:null;
   return {lift,diff,z,significant};
 },[c,t,cn,tn,metric]);
 return <AppShell title="A/B Testing" subtitle="Experiment planning and evidence-based variant analysis"><section className="content">
  <div className="intro"><div><div className="muted">EXPERIMENTATION</div><h1>A/B test commercial decisions before scaling them.</h1><p>Compare a control and test variant, quantify lift, and keep causal claims separate from historical CPG observations.</p></div><div className="scope-badge"><FlaskConical size={15}/> Evidence-first testing</div></div>
  <div className="data-provenance"><ShieldCheck size={13}/><b>Important:</b><span>A/B testing is causal only when variant assignment is randomized or otherwise designed as a valid experiment. Historical retailer/region differences are reported as associations, not proven causal effects.</span></div>
  <div className="two-col">
   <div className="card panel"><div className="panel-head"><div><b>Experiment setup</b><span>Define what you want to test before reading the result</span></div><Target size={17}/></div>
    <div className="form-grid">
     <label>Primary KPI<select value={metric} onChange={e=>setMetric(e.target.value)}><option value="conversion">Conversion / response rate (%)</option><option value="sales">Sales per test unit</option><option value="units">Units per test unit</option><option value="margin">Gross margin per test unit</option></select></label>
     <label>Hypothesis<input value={hypothesis} onChange={e=>setHypothesis(e.target.value)}/></label>
     <label>Control result<input type="number" value={controlValue} onChange={e=>setControlValue(e.target.value)}/></label>
     <label>Test result<input type="number" value={testValue} onChange={e=>setTestValue(e.target.value)}/></label>
     <label>Control observations / stores / customers<input type="number" value={controlN} onChange={e=>setControlN(e.target.value)}/></label>
     <label>Test observations / stores / customers<input type="number" value={testN} onChange={e=>setTestN(e.target.value)}/></label>
    </div>
   </div>
   <div className="card panel"><div className="panel-head"><div><b>Experiment result</b><span>Calculated from the values above</span></div><TrendingUp size={17}/></div>
    <div className="report-grid-kpis"><div className="card kpi"><span>CONTROL</span><strong>{c}</strong><small>{cn.toLocaleString()} observations</small></div><div className="card kpi"><span>TEST</span><strong>{t}</strong><small>{tn.toLocaleString()} observations</small></div><div className="card kpi"><span>ABSOLUTE CHANGE</span><strong>{result.diff.toFixed(2)}</strong><small>Test − control</small></div><div className="card kpi"><span>RELATIVE LIFT</span><strong>{result.lift==null?"—":pct(result.lift)}</strong><small>Test vs control</small></div></div>
    {metric==="conversion"?<div className="data-provenance" style={{marginTop:14}}><Info size={13}/><b>{result.significant===null?"Insufficient inputs":result.significant?"Statistical signal detected":"No statistical signal at the 95% threshold"}</b><span>{result.z==null?"":`z = ${result.z.toFixed(2)} · two-sided 95% reference threshold = 1.96`}</span></div>:<div className="data-provenance" style={{marginTop:14}}><Info size={13}/><span>For sales, units and margin metrics, this page reports observed lift. Add experiment-level variance or store/customer-level observations for formal significance testing.</span></div>}
   </div>
  </div>
  <div className="two-col">
   <div className="card panel"><div className="panel-head"><div><b>How this helps CPGist</b><span>Designed around the decisions already present in the platform</span></div></div><div className="advanced-kpis"><div><span>PRICE</span><b>Test price points</b></div><div><span>PROMOTION</span><b>Test offer mechanics</b></div><div><span>PACK / SKU</span><b>Test variants</b></div><div><span>RETAILER</span><b>Test store clusters</b></div></div><p className="muted">The same framework can evaluate a new promotion, pack, price, assortment, display or retailer execution when a randomized test is run.</p></div>
   <div className="card panel"><div className="panel-head"><div><b>Decision guardrails</b><span>What CPGist will and will not claim</span></div><Users size={17}/></div><ul className="decision-list"><li><b>Positive result:</b> report lift and statistical evidence when valid experimental observations are available.</li><li><b>No signal:</b> do not describe a difference as a proven improvement.</li><li><b>Historical comparison:</b> show the difference, but label it observational rather than causal.</li><li><b>Missing evidence:</b> explain exactly what additional experiment fields are required.</li></ul></div>
  </div>
  <div className="card panel"><div className="panel-head"><div><b>Example CPGist workflow</b><span>From business question to testable decision</span></div></div><div className="advanced-kpis"><div><span>01 · QUESTION</span><b>Does the new promotion improve sales?</b></div><div><span>02 · DESIGN</span><b>Randomize comparable stores</b></div><div><span>03 · MEASURE</span><b>Sales, units, margin</b></div><div><span>04 · DECIDE</span><b>Scale only with sufficient evidence</b></div></div></div>
 </section></AppShell>
}
