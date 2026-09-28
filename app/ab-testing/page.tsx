"use client";

import {useEffect,useMemo,useState} from "react";
import {AlertTriangle,ArrowRight,BarChart3,CheckCircle2,Database,FlaskConical,Info,Layers3,ShieldCheck,Target,TrendingUp,Users} from "lucide-react";
import {AppShell} from "../../components/app-shell";
import {supabaseBrowser} from "../../lib/supabase-browser";

type Metric="conversion"|"sales"|"units"|"margin";
type Design="randomized"|"observational";
type Mode="live"|"manual";

const metricMeta:Record<Metric,{label:string;short:string;unit:string}>={
 conversion:{label:"Conversion / response rate",short:"Conversion rate",unit:"%"},
 sales:{label:"Sales",short:"Sales",unit:"$"},
 units:{label:"Units",short:"Units",unit:"units"},
 margin:{label:"Gross margin",short:"Gross margin",unit:"$"}
};
const n=(v:any)=>Number(v??0);
const fmt=(v:number,dec=2)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec}):"—";
const money=(v:number)=>Number.isFinite(v)?v.toLocaleString("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}):"—";
const pct=(v:number)=>Number.isFinite(v)?(v>=0?"+":"")+v.toFixed(1)+"%":"—";

function zForConversion(c:number,cn:number,t:number,tn:number){
 if(cn<=0||tn<=0)return null;
 const p1=c/100,p2=t/100,p=(p1*cn+p2*tn)/(cn+tn),variance=p*(1-p)*(1/cn+1/tn);
 return variance>0?Math.abs(p1-p2)/Math.sqrt(variance):null;
}
function aggregate(rows:any[],id:string,weeks:string[]){
 const x=rows.filter(r=>String(r.retailer_id)===id&&weeks.includes(String(r.week_ending)));
 const sales=x.reduce((s,r)=>s+n(r.sales),0),units=x.reduce((s,r)=>s+n(r.units),0),margin=x.reduce((s,r)=>s+n(r.gross_margin),0);
 return {sales,units,grossMargin:margin,marginPercent:sales?margin/sales*100:null,distribution:x.length?x.reduce((s,r)=>s+n(r.distribution),0)/x.length:null,price:units?sales/units:null,observations:x.length};
}

export default function ABTesting(){
 const [mode,setMode]=useState<Mode>("live"),[metric,setMetric]=useState<Metric>("sales"),[design,setDesign]=useState<Design>("observational");
 const [brands,setBrands]=useState<any[]>([]),[brandId,setBrandId]=useState(""),[data,setData]=useState<any>(null);
 const [controlRetailer,setControlRetailer]=useState(""),[testRetailer,setTestRetailer]=useState(""),[windowWeeks,setWindowWeeks]=useState("13");
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const [hypothesis,setHypothesis]=useState("Does the test retailer show stronger performance for the selected KPI?");
 const [unit,setUnit]=useState("retailers"),[controlValue,setControlValue]=useState("12"),[testValue,setTestValue]=useState("14.5"),[controlN,setControlN]=useState("1000"),[testN,setTestN]=useState("1000");
 const [startDate,setStartDate]=useState(""),[endDate,setEndDate]=useState("");
 const [savedExperiments,setSavedExperiments]=useState<any[]>([]),[saveStatus,setSaveStatus]=useState("");

 async function auth(){const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session)throw new Error("Please sign in again.");return session.access_token}
 async function loadBrands(){
  try{const token=await auth();const r=await fetch("/api/explorer?entity=brand&limit=5000",{headers:{Authorization:"Bearer "+token},cache:"no-store"});const x=await r.json();if(!r.ok)throw new Error(x.error||"Brand list failed.");const list=Array.isArray(x.results)?x.results:[];setBrands(list);if(!brandId&&list.length)setBrandId(String(list[0].id));}
  catch(e:any){setError(e.message||"Unable to load brands.");}
 }
 async function loadExperiments(id:string){
  try{const token=await auth();const r=await fetch("/api/ab-testing?mode=experiments&brand_id="+encodeURIComponent(id),{headers:{Authorization:"Bearer "+token},cache:"no-store"});const x=await r.json();if(r.ok)setSavedExperiments(Array.isArray(x.experiments)?x.experiments:[]);}catch{}
 }
 async function saveExperiment(){
  setSaveStatus("Saving…");
  try{
   const token=await auth();
   const experiment_id="EXP-"+new Date().toISOString().replace(/[-:.TZ]/g,"").slice(0,14);
   const r=await fetch("/api/ab-testing",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({
    experiment_id,brand_id:brandId,category:selectedBrand?.category||data?.brand?.category,hypothesis,design,unit_of_randomization:unit,
    treatment:"Test",control:"Control",primary_kpi:metric,start_date:startDate||null,end_date:endDate||null,
    control_value:controlValue,test_value:testValue,control_observations:controlN,test_observations:testN,
    assignment_validated:design==="randomized",notes:"Entered through CPGist A/B Testing workspace."
   })});
   const x=await r.json();if(!r.ok)throw new Error(x.error||"Save failed.");
   setSaveStatus("Saved "+experiment_id); await loadExperiments(brandId);
  }catch(e:any){setSaveStatus(e.message||"Save failed.");}
 }
 async function loadData(id:string){
  if(!id)return;setLoading(true);setError("");
  try{const token=await auth();const r=await fetch("/api/ab-testing?brand_id="+encodeURIComponent(id),{headers:{Authorization:"Bearer "+token},cache:"no-store"});const x=await r.json();if(!r.ok)throw new Error(x.error||"A/B Testing data failed.");setData(x);const rs=x.retailers||[];setControlRetailer(rs[0]?String(rs[0].id):"");setTestRetailer(rs[1]?String(rs[1].id):(rs[0]?String(rs[0].id):""));}
  catch(e:any){setData(null);setError(e.message||"Unable to load CPGist experiment data.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{loadBrands()},[]);
 useEffect(()=>{if(brandId){loadData(brandId);loadExperiments(brandId)}},[brandId]);

 const selectedBrand=brands.find(b=>String(b.id)===String(brandId))||data?.brand;
 const retailers=data?.retailers||[];
 const weeks=(data?.latest13||[]).slice(-Number(windowWeeks||13));
 const selectedControl=retailers.find((r:any)=>String(r.id)===String(controlRetailer));
 const selectedTest=retailers.find((r:any)=>String(r.id)===String(testRetailer));

 const live=useMemo(()=>{
  if(mode!=="live"||!data||!controlRetailer||!testRetailer)return null;
  const c=aggregate(data.rows||[],String(controlRetailer),weeks),t=aggregate(data.rows||[],String(testRetailer),weeks);
  const cv=metric==="sales"?c.sales:metric==="units"?c.units:c.grossMargin,tv=metric==="sales"?t.sales:metric==="units"?t.units:t.grossMargin;
  return {c,t,cv,tv,diff:tv-cv,lift:cv!==0?(tv/cv-1)*100:null};
 },[mode,data,controlRetailer,testRetailer,metric,weeks.join("|")]);

 const manual=useMemo(()=>{
  const c=Number(controlValue),t=Number(testValue),cn=Math.floor(Number(controlN)),tn=Math.floor(Number(testN));
  const validRate=metric!=="conversion"||(c>=0&&c<=100&&t>=0&&t<=100),validSamples=cn>0&&tn>0,diff=t-c,lift=c!==0?(t/c-1)*100:null;
  const z=metric==="conversion"&&validRate&&validSamples?zForConversion(c,cn,t,tn):null;
  return {c,t,cn,tn,diff,lift,z,validRate,validSamples,significant:z!=null&&z>=1.96};
 },[controlValue,testValue,controlN,testN,metric]);

 const result=mode==="live"?live:manual;
 const valid=mode==="live"?Boolean(live&&live.c.observations&&live.t.observations):manual.validRate&&manual.validSamples&&Number.isFinite(manual.c)&&Number.isFinite(manual.t);
 const causal=mode==="manual"&&design==="randomized";
 const status=!valid?"Waiting for valid data":mode==="live"?"Observed retailer comparison":causal?(manual.significant?"Evidence supports a difference":"No statistical signal at 95%"):"Observational comparison only";
 const value=(v:number)=>metric==="units"?fmt(v):money(v);
 const periodLabel=weeks.length?weeks[0]+" → "+weeks[weeks.length-1]:"No aligned weeks";

 return <AppShell title="A/B Testing" subtitle="Experiment planning and evidence-based variant analysis">
  <section className="content ab-page">
   <div className="ab-hero"><div><div className="ab-eyebrow">EXPERIMENTATION WORKSPACE</div><h1>Test commercial decisions with connected CPG data.</h1><p>Select a real brand and comparison groups. CPGist pulls the available retailer data and recalculates the result when you change the inputs.</p></div><div className="ab-live-badge"><Database size={15}/>{mode==="live"?"Live CPGist data":"Manual experiment"}</div></div>

   <div className="ab-mode-switch">
    <button className={mode==="live"?"active":""} onClick={()=>{setMode("live");setDesign("observational")}}><Database size={15}/><span><b>Use CPGist data</b><small>Connected brand + retailer observations</small></span></button>
    <button className={mode==="manual"?"active":""} onClick={()=>setMode("manual")}><FlaskConical size={15}/><span><b>Enter experiment results</b><small>For a randomized test not yet stored in CPGist</small></span></button>
   </div>

   {mode==="live"?<div className="ab-trust warn"><AlertTriangle size={15}/><div><b>Observational evidence only</b><span>Current CPGist data does not contain randomized control/test assignment. Retailer comparisons show observed differences; they are not causal A/B effects.</span></div></div>:<div className={"ab-trust "+(causal?"":"warn")}>{causal?<ShieldCheck size={15}/>:<AlertTriangle size={15}/>}<div><b>{causal?"Causal interpretation enabled":"Causal interpretation disabled"}</b><span>{causal?"Use only when treatment assignment was genuinely randomized or otherwise experimentally designed.":"Historical comparisons are associations, not causal effects."}</span></div></div>}

   <div className="card panel ab-context"><div className="ab-section-head"><div><span className="ab-kicker">01 · CONTEXT</span><b>Choose what you are testing</b><small>This connects the analysis to the CPGist dataset.</small></div><Target size={18}/></div>
    <div className="ab-context-grid">
     <label><span>Brand</span><select value={brandId} onChange={e=>setBrandId(e.target.value)} disabled={!brands.length}>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
     <label><span>Primary KPI</span><select value={metric} onChange={e=>setMetric(e.target.value as Metric)}>{(mode==="live"?["sales","units","margin"]:["conversion","sales","units","margin"]).map(k=><option key={k} value={k}>{metricMeta[k as Metric].label} ({metricMeta[k as Metric].unit})</option>)}</select></label>
     {mode==="live"?<><label><span>Control retailer</span><select value={controlRetailer} onChange={e=>setControlRetailer(e.target.value)}><option value="">Select control</option>{retailers.map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label><span>Test retailer</span><select value={testRetailer} onChange={e=>setTestRetailer(e.target.value)}><option value="">Select test</option>{retailers.map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label><span>Analysis window</span><select value={windowWeeks} onChange={e=>setWindowWeeks(e.target.value)}>{[4,8,13].map(w=><option key={w} value={w}>Latest {w} weeks</option>)}</select></label><label><span>Comparison unit</span><select value={unit} onChange={e=>setUnit(e.target.value)}><option>retailers</option><option>store clusters</option><option>regions</option></select></label></>:<><label><span>Experiment design</span><select value={design} onChange={e=>setDesign(e.target.value as Design)}><option value="randomized">Randomized A/B test</option><option value="observational">Historical / observational comparison</option></select></label><label><span>Comparison unit</span><select value={unit} onChange={e=>setUnit(e.target.value)}><option>stores / customers</option><option>households</option><option>retailers</option><option>regions</option><option>SKUs</option></select></label><label className="ab-wide"><span>Hypothesis</span><input value={hypothesis} onChange={e=>setHypothesis(e.target.value)}/></label><label><span>Experiment start <em>optional</em></span><input className="ab-date-input" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><label><span>Experiment end <em>optional</em></span><input className="ab-date-input" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label></>}
    </div>
    {mode==="live"&&<div className="ab-data-line"><Database size={13}/><span><b>{selectedBrand?.name||"Selected brand"}</b> · {selectedBrand?.category||"Category unavailable"} · {periodLabel}</span></div>}
   </div>

   <div className="ab-grid">
    <div className="card panel ab-setup"><div className="ab-section-head"><div><span className="ab-kicker">02 · MEASURE</span><b>{mode==="live"?"Connected KPI values":"Experiment inputs"}</b><small>{mode==="live"?"Calculated from selected brand, retailers and aligned weeks.":"Enter the observed Control and Test results."}</small></div><BarChart3 size={18}/></div>
     {mode==="live"?<div className="ab-values"><div className="ab-group control"><div className="ab-group-label"><span>CONTROL</span><small>{selectedControl?.name||"Select a retailer"}</small></div><div className="ab-live-value">{valid?value(live!.cv):"—"}</div><div className="ab-live-meta">{live?.c.observations||0} weekly rows · ACV {live?.c.distribution==null?"—":live.c.distribution.toFixed(1)+"%"}</div></div><div className="ab-arrow"><ArrowRight size={18}/></div><div className="ab-group test"><div className="ab-group-label"><span>TEST</span><small>{selectedTest?.name||"Select a retailer"}</small></div><div className="ab-live-value">{valid?value(live!.tv):"—"}</div><div className="ab-live-meta">{live?.t.observations||0} weekly rows · ACV {live?.t.distribution==null?"—":live.t.distribution.toFixed(1)+"%"}</div></div></div>:
     <><div className="ab-values"><div className="ab-group control"><div className="ab-group-label"><span>CONTROL</span><small>Baseline / current approach</small></div><label><span>{metricMeta[metric].short} ({metricMeta[metric].unit})</span><input type="number" step="any" value={controlValue} onChange={e=>setControlValue(e.target.value)}/></label><label><span>Observations</span><input type="number" min="1" value={controlN} onChange={e=>setControlN(e.target.value)}/></label></div><div className="ab-arrow"><ArrowRight size={18}/></div><div className="ab-group test"><div className="ab-group-label"><span>TEST</span><small>New price / promotion / variant</small></div><label><span>{metricMeta[metric].short} ({metricMeta[metric].unit})</span><input type="number" step="any" value={testValue} onChange={e=>setTestValue(e.target.value)}/></label><label><span>Observations</span><input type="number" min="1" value={testN} onChange={e=>setTestN(e.target.value)}/></label></div></div>{metric==="conversion"&&!manual.validRate&&<div className="ab-error"><AlertTriangle size={14}/><span>Conversion rate must be between 0% and 100%.</span></div>}
     {mode==="manual"&&<div className="ab-save-row"><button className="btn primary" onClick={saveExperiment} disabled={!brandId}>{saveStatus||"Save experiment evidence"}</button><span>Saved experiments: {savedExperiments.length}. Saving stores the entered experiment metadata/results; it does not turn observational data into causal evidence.</span></div>}</>}
    </div>

    <div className="card panel ab-result"><div className="ab-section-head"><div><span className="ab-kicker">03 · RESULT</span><b>What changed?</b><small>Recalculated from the current selections.</small></div><TrendingUp size={18}/></div>
     <div className="ab-result-banner"><div><span>{status}</span><small>{mode==="live"?"Connected CPGist observations":"Experiment inputs"}</small></div><strong>{valid&&result?.lift!=null?pct(result.lift):"—"}</strong><small>relative lift</small></div>
     <div className="ab-metric-cards"><div><span>CONTROL</span><strong>{valid?(mode==="live"?value(live!.cv):fmt(manual.c)):"—"}</strong><small>{mode==="live"?selectedControl?.name||"—":manual.cn.toLocaleString()+" observations"}</small></div><div><span>TEST</span><strong>{valid?(mode==="live"?value(live!.tv):fmt(manual.t)):"—"}</strong><small>{mode==="live"?selectedTest?.name||"—":manual.tn.toLocaleString()+" observations"}</small></div><div><span>ABSOLUTE CHANGE</span><strong>{valid?(mode==="live"?value(live!.diff):fmt(manual.diff)):"—"}</strong><small>test − control</small></div></div>
     <div className="ab-interpret"><CheckCircle2 size={15}/><div><b>{valid?(result!.diff>0?"Test is higher than control":result!.diff<0?"Test is lower than control":"Test equals control"):"Waiting for valid data"}</b><span>{valid&&result!.lift!=null?metricMeta[metric].short+": "+pct(result!.lift)+" vs control.":"Select valid inputs to calculate the comparison."}</span></div></div>
     {mode==="manual"&&metric==="conversion"&&valid?<div className={"ab-stat "+(manual.significant?"signal":"")}><Info size={15}/><div><b>{manual.significant?"Statistical signal at 95%":"No statistical signal at 95%"}</b><span>Two-proportion z-test · |z| = {manual.z?.toFixed(2)} · reference threshold = 1.96</span></div></div>:<div className="ab-stat neutral"><Info size={15}/><div><b>{mode==="live"?"No causal significance test from this dataset":"Lift is descriptive for this KPI"}</b><span>{mode==="live"?"The connected rows are observational retailer aggregates, not randomized experiment assignments.":"Formal uncertainty needs experiment-level variance or unit-level observations for the appropriate test."}</span></div></div>}
     <div className="ab-method"><Layers3 size={14}/><span><b>Evidence:</b> {mode==="live"?"cpgist_brand_retailer_weekly · live connected data":"manually entered experiment values"} · {unit}</span></div>
    </div>
   </div>

   {error&&<div className="ab-error ab-page-error"><AlertTriangle size={14}/><span>{error}</span></div>}{loading&&<div className="ab-loading">Loading connected CPGist data…</div>}

   <div className="ab-grid lower"><div className="card panel"><div className="ab-section-head"><div><span className="ab-kicker">04 · CPG USE CASES</span><b>Decisions you can test</b><small>Use connected data for discovery; use randomized assignment for causal proof.</small></div><TrendingUp size={18}/></div><div className="ab-usecases">{[["PRICE","Test price points","Compare a treatment price against a control price."],["PROMOTION","Test offer mechanics","Compare discount, bundle or display variants."],["PACK / SKU","Test variants","Compare pack, size or assortment changes."],["RETAILER","Test store clusters","Run treatment and control across comparable stores."]].map(([k,t,d])=><div key={k}><span>{k}</span><b>{t}</b><small>{d}</small></div>)}</div></div><div className="card panel"><div className="ab-section-head"><div><span className="ab-kicker">05 · GUARDRAILS</span><b>What CPGist can claim</b><small>Separate connected observations from experiment evidence.</small></div><Users size={18}/></div><ul className="ab-guardrails"><li><b>Connected data:</b> reports observed Control/Test differences, not causal effects.</li><li><b>Randomized test:</b> causal interpretation is possible only when assignment is valid.</li><li><b>No signal:</b> a measured lift is not automatically a proven improvement.</li><li><b>Missing evidence:</b> identify experiment-level fields still needed.</li></ul></div></div>

   <div className="card panel ab-workflow"><div className="ab-section-head"><div><span className="ab-kicker">06 · WORKFLOW</span><b>From business question to decision</b><small>Define → assign → measure → analyze → document.</small></div><ShieldCheck size={18}/></div><div className="ab-steps">{[["01","QUESTION","Does the new promotion improve sales?"],["02","DESIGN","Randomly assign comparable stores or customers."],["03","MEASURE","Capture the same KPI for both arms."],["04","ANALYZE","Calculate lift plus appropriate uncertainty."],["05","DECIDE","Use evidence and business materiality together."]].map(([a,b,c])=><div key={a}><i>{a}</i><span>{b}</span><b>{c}</b></div>)}</div></div>
  </section>
 </AppShell>;
}
