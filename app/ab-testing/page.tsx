"use client";

import {useMemo,useState} from "react";
import {
  AlertTriangle,ArrowRight,CheckCircle2,FlaskConical,Info,Layers3,
  ShieldCheck,Target,TrendingUp,Users,CalendarDays,BarChart3
} from "lucide-react";
import {AppShell} from "../../components/app-shell";

type Metric = "conversion"|"sales"|"units"|"margin";
type Design = "randomized"|"observational";

const metricMeta:Record<Metric,{label:string;short:string;unit:string;example:string}> = {
  conversion:{label:"Conversion / response rate",short:"Conversion rate",unit:"%",example:"12.0"},
  sales:{label:"Sales per test unit",short:"Sales",unit:"$",example:"12.00"},
  units:{label:"Units per test unit",short:"Units",unit:"units",example:"1.25"},
  margin:{label:"Gross margin per test unit",short:"Gross margin",unit:"$",example:"4.80"}
};

const num=(v:string)=>Number(v);
const fmt=(v:number,decimals=2)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:decimals,maximumFractionDigits:decimals}):"—";
const pct=(v:number)=>Number.isFinite(v)?`${v>=0?"+":""}${v.toFixed(1)}%`:"—";

function twoProportionZ(controlRate:number,controlN:number,testRate:number,testN:number){
  if(!controlN||!testN)return null;
  const p1=controlRate/100,p2=testRate/100,p=(p1*controlN+p2*testN)/(controlN+testN);
  const variance=p*(1-p)*(1/controlN+1/testN);
  return variance>0?Math.abs(p1-p2)/Math.sqrt(variance):null;
}

export default function ABTesting(){
  const [metric,setMetric]=useState<Metric>("conversion");
  const [design,setDesign]=useState<Design>("randomized");
  const [unit,setUnit]=useState("stores / customers");
  const [controlValue,setControlValue]=useState("12.0");
  const [testValue,setTestValue]=useState("14.5");
  const [controlN,setControlN]=useState("1000");
  const [testN,setTestN]=useState("1000");
  const [hypothesis,setHypothesis]=useState("The new price, promotion or packaging improves the selected KPI.");
  const [startDate,setStartDate]=useState("");
  const [endDate,setEndDate]=useState("");

  const meta=metricMeta[metric];
  const c=num(controlValue),t=num(testValue),cn=Math.floor(num(controlN)),tn=Math.floor(num(testN));

  const result=useMemo(()=>{
    const validRate=metric!=="conversion"||(c>=0&&c<=100&&t>=0&&t<=100);
    const validSamples=cn>0&&tn>0;
    const diff=t-c;
    const lift=c!==0?((t/c)-1)*100:null;
    const z=metric==="conversion"&&validRate&&validSamples?twoProportionZ(c,cn,t,tn):null;
    const significant=z!=null&&z>=1.96;
    const directional=diff>0?"improved":diff<0?"declined":"unchanged";
    return {validRate,validSamples,diff,lift,z,significant,directional};
  },[metric,c,t,cn,tn]);

  const valid=result.validRate&&result.validSamples&&Number.isFinite(c)&&Number.isFinite(t);
  const causal=design==="randomized";
  const status=!valid?"Fix the inputs":causal?(result.significant?"Evidence supports a difference":"No statistical signal at 95%"):"Observational comparison only";

  return <AppShell title="A/B Testing" subtitle="Experiment planning and evidence-based variant analysis">
    <section className="content ab-page">
      <div className="ab-hero">
        <div>
          <div className="ab-eyebrow">EXPERIMENTATION WORKSPACE</div>
          <h1>Test commercial decisions before scaling them.</h1>
          <p>Define the experiment, compare control vs test, quantify lift, and keep causal claims tied to valid experimental design.</p>
        </div>
        <div className={`ab-status-pill ${causal?"causal":"observational"}`}>
          <FlaskConical size={15}/>{causal?"Randomized experiment":"Observational comparison"}
        </div>
      </div>

      <div className={`ab-trust ${causal?"":"warn"}`}>
        {causal?<ShieldCheck size={15}/>:<AlertTriangle size={15}/>}
        <div><b>{causal?"Causal interpretation enabled":"Causal interpretation disabled"}</b>
        <span>{causal?"Lift can be interpreted causally only if treatment assignment is genuinely randomized (or otherwise valid experimentally designed).":"Historical retailer, region or store differences describe association; they do not prove that the test caused the change."}</span></div>
      </div>

      <div className="ab-grid">
        <div className="card panel ab-setup">
          <div className="ab-section-head">
            <div><span className="ab-kicker">01 · DESIGN</span><b>Define the experiment</b><small>Set the context before looking at the result.</small></div>
            <Target size={18}/>
          </div>

          <div className="ab-form-grid">
            <label><span>Experiment design</span><select value={design} onChange={e=>setDesign(e.target.value as Design)}>
              <option value="randomized">Randomized A/B test</option>
              <option value="observational">Historical / observational comparison</option>
            </select></label>
            <label><span>Primary KPI</span><select value={metric} onChange={e=>setMetric(e.target.value as Metric)}>
              {Object.entries(metricMeta).map(([key,m])=><option key={key} value={key}>{m.label} {m.unit==="%"?"(%)":m.unit===" $"?"":"("+m.unit+")"}</option>)}
            </select></label>
            <label className="ab-wide"><span>Hypothesis</span><input value={hypothesis} onChange={e=>setHypothesis(e.target.value)} /></label>
            <label><span>Unit of randomization / comparison</span><select value={unit} onChange={e=>setUnit(e.target.value)}>
              <option>stores / customers</option><option>households</option><option>retailers</option><option>regions</option><option>SKUs</option>
            </select></label>
            <label><span>Experiment start <em>optional</em></span><div className="ab-input-icon"><CalendarDays size={14}/><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></div></label>
            <label><span>Experiment end <em>optional</em></span><div className="ab-input-icon"><CalendarDays size={14}/><input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></div></label>
          </div>

          <div className="ab-divider"/>
          <div className="ab-subhead"><b>Observed KPI values</b><span>{meta.short} is measured at the same unit level in both groups.</span></div>
          <div className="ab-values">
            <div className="ab-group control"><div className="ab-group-label"><span>CONTROL</span><small>Baseline / current approach</small></div><label><span>{meta.short} <b>({meta.unit})</b></span><input type="number" step="any" min={metric==="conversion"?0:undefined} max={metric==="conversion"?100:undefined} value={controlValue} onChange={e=>setControlValue(e.target.value)} /></label><label><span>Observations</span><input type="number" min="1" step="1" value={controlN} onChange={e=>setControlN(e.target.value)} /></label></div>
            <div className="ab-arrow"><ArrowRight size={18}/></div>
            <div className="ab-group test"><div className="ab-group-label"><span>TEST</span><small>New price / promotion / variant</small></div><label><span>{meta.short} <b>({meta.unit})</b></span><input type="number" step="any" min={metric==="conversion"?0:undefined} max={metric==="conversion"?100:undefined} value={testValue} onChange={e=>setTestValue(e.target.value)} /></label><label><span>Observations</span><input type="number" min="1" step="1" value={testN} onChange={e=>setTestN(e.target.value)} /></label></div>
          </div>

          {!result.validRate&&<div className="ab-error"><AlertTriangle size={14}/><span>Conversion / response rate must be between 0% and 100%.</span></div>}
          {(!result.validSamples||!Number.isFinite(c)||!Number.isFinite(t))&&<div className="ab-error"><AlertTriangle size={14}/><span>Enter valid KPI values and at least one observation in each group.</span></div>}
        </div>

        <div className="card panel ab-result">
          <div className="ab-section-head">
            <div><span className="ab-kicker">02 · RESULT</span><b>What changed?</b><small>Calculated directly from the control and test inputs.</small></div>
            <BarChart3 size={18}/>
          </div>

          <div className="ab-result-banner">
            <div><span className={causal?"":"muted"}>{status}</span><small>{design==="randomized"?"Randomized design":"No causal inference"}</small></div>
            <strong>{valid&&result.lift!=null?pct(result.lift):"—"}</strong>
            <small>relative lift</small>
          </div>

          <div className="ab-metric-cards">
            <div><span>CONTROL</span><strong>{valid?fmt(c):"—"}</strong><small>{cn>0?cn.toLocaleString():"—"} observations</small></div>
            <div><span>TEST</span><strong>{valid?fmt(t):"—"}</strong><small>{tn>0?tn.toLocaleString():"—"} observations</small></div>
            <div><span>ABSOLUTE CHANGE</span><strong>{valid?fmt(result.diff):"—"}</strong><small>test − control</small></div>
          </div>

          <div className="ab-interpret">
            <div><CheckCircle2 size={15}/>
              <div><b>{valid?(result.directional==="improved"?"Test is higher than control":result.directional==="declined"?"Test is lower than control":"Test equals control"):"Waiting for valid inputs"}</b>
              <span>{valid&&result.lift!=null?(`${meta.short}: ${pct(result.lift)} vs control.`):"Complete the experiment inputs to calculate lift."}</span></div>
            </div>
          </div>

          {metric==="conversion"&&valid?<div className={`ab-stat ${result.significant?"signal":""}`}>
            <Info size={15}/><div><b>{result.significant?"Statistical signal at 95%":"No statistical signal at 95%"}</b><span>Two-proportion z-test · |z| = {result.z?.toFixed(2)} · reference threshold = 1.96</span></div>
          </div>:<div className="ab-stat neutral"><Info size={15}/><div><b>Lift is descriptive for this KPI</b><span>Formal uncertainty needs experiment-level variance or store/customer-level observations for the appropriate test.</span></div></div>}

          <div className="ab-method"><Layers3 size={14}/><span><b>Evidence:</b> manually entered experiment values · {unit} · {causal?"randomized design selected":"observational design selected"}</span></div>
        </div>
      </div>

      <div className="ab-grid lower">
        <div className="card panel">
          <div className="ab-section-head"><div><span className="ab-kicker">03 · CPG USE CASES</span><b>Decisions you can test</b><small>Apply the same experimental structure across commercial levers.</small></div><TrendingUp size={18}/></div>
          <div className="ab-usecases">
            {[
              ["PRICE","Test price points","Compare a new price against the current price."],
              ["PROMOTION","Test offer mechanics","Compare discount, bundle or display variants."],
              ["PACK / SKU","Test variants","Compare pack, size or assortment changes."],
              ["RETAILER","Test store clusters","Run the same treatment across comparable stores."]
            ].map(([k,t,d])=><div key={k}><span>{k}</span><b>{t}</b><small>{d}</small></div>)}
          </div>
        </div>
        <div className="card panel">
          <div className="ab-section-head"><div><span className="ab-kicker">04 · GUARDRAILS</span><b>What CPGist can claim</b><small>Keep evidence and interpretation separate.</small></div><Users size={18}/></div>
          <ul className="ab-guardrails">
            <li><b>Randomized + signal:</b> report the observed lift and statistical evidence; causal interpretation depends on experiment quality.</li>
            <li><b>No signal:</b> report the measured difference without calling it a proven improvement.</li>
            <li><b>Observational:</b> label the result as an association, not a causal effect.</li>
            <li><b>Missing evidence:</b> identify the fields needed for a valid experiment.</li>
          </ul>
        </div>
      </div>

      <div className="card panel ab-workflow">
        <div className="ab-section-head"><div><span className="ab-kicker">05 · WORKFLOW</span><b>From business question to decision</b><small>A/B testing in CPGist is a structured evidence workflow, not just a lift calculator.</small></div><ShieldCheck size={18}/></div>
        <div className="ab-steps">
          {[
            ["01","QUESTION","Does the new promotion improve sales?"],
            ["02","DESIGN","Randomize comparable stores or customers."],
            ["03","MEASURE","Capture sales, units and margin consistently."],
            ["04","ANALYZE","Calculate lift and appropriate uncertainty."],
            ["05","DECIDE","Scale only when the evidence supports the business decision."]
          ].map(([n,k,v])=><div key={n}><i>{n}</i><span>{k}</span><b>{v}</b></div>)}
        </div>
      </div>
    </section>
  </AppShell>;
}
