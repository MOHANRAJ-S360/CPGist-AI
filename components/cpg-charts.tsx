"use client";

type Point={label:string;value:number};
const compact=(v:number)=>new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:1}).format(v);
export function LineChart({points,height=230}:{points:Point[];height?:number}){
 if(!points.length)return <div className="chart-empty">No chart data available.</div>;
 const w=760,h=height,pad=32,max=Math.max(...points.map(x=>x.value),1),min=Math.min(...points.map(x=>x.value),0),span=Math.max(max-min,1);
 const xy=(p:Point,i:number)=>({x:pad+(i/Math.max(points.length-1,1))*(w-pad*2),y:h-pad-((p.value-min)/span)*(h-pad*2)});
 const coords=points.map(xy),d=coords.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ");
 const area=d+" L "+coords[coords.length-1].x+" "+(h-pad)+" L "+coords[0].x+" "+(h-pad)+" Z";
 const labels=points.filter((_,i)=>i===0||i===points.length-1||i%Math.max(1,Math.floor(points.length/5))===0);
 return <div className="svg-chart"><svg viewBox={"0 0 "+w+" "+h} role="img" aria-label="Trend chart"><defs><linearGradient id="cpgist-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6d5dfc" stopOpacity=".20"/><stop offset="100%" stopColor="#6d5dfc" stopOpacity="0"/></linearGradient></defs>{[0,.25,.5,.75,1].map(t=><line key={t} x1={pad} x2={w-pad} y1={pad+t*(h-pad*2)} y2={pad+t*(h-pad*2)} stroke="#e9edf3"/>) }<path d={area} fill="url(#cpgist-area)"/><path d={d} fill="none" stroke="#6d5dfc" strokeWidth="3" strokeLinecap="round"/>{coords.filter((_,i)=>i===0||i===coords.length-1||i%Math.max(1,Math.floor(coords.length/5))===0).map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#fff" stroke="#6d5dfc" strokeWidth="2"/>)}</svg><div className="chart-axis">{labels.map((p,i)=><span key={i}>{p.label}</span>)}</div></div>
}
export function BarChart({items}:{items:{label:string;value:number;change?:number}[]}){
 const max=Math.max(...items.map(x=>x.value),1);
 return <div className="bar-chart">{items.map((x,i)=><div className="bar-row" key={i}><div className="bar-label" title={x.label}>{x.label}</div><div className="bar-track"><div className="bar-fill" style={{width:(x.value/max*100)+"%"}}/></div><div className="bar-value">{compact(x.value)}</div>{x.change!=null&&<div className={"bar-change "+(x.change>=0?"up":"down")}>{x.change>=0?"+":""}{x.change.toFixed(1)}%</div>}</div>)}</div>
}
export function Donut({share,centerLabel}:{share:number;centerLabel:string}){
 const r=42,c=2*Math.PI*r,offset=c-(Math.max(0,Math.min(100,share))/100)*c;
 return <div className="donut-wrap"><svg viewBox="0 0 110 110"><circle cx="55" cy="55" r={r} fill="none" stroke="#edf0f5" strokeWidth="11"/><circle cx="55" cy="55" r={r} fill="none" stroke="#6d5dfc" strokeWidth="11" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 55 55)"/><text x="55" y="52" textAnchor="middle" className="donut-number">{share.toFixed(1)}%</text><text x="55" y="68" textAnchor="middle" className="donut-label">{centerLabel}</text></svg></div>
}
