"use client";

import {Suspense,useEffect,useState} from "react";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {Download,FileText,Presentation,RefreshCw,Search,ShieldCheck,TrendingUp} from "lucide-react";
import {AppShell} from "../../components/app-shell";
import {BarChart,Donut,LineChart} from "../../components/cpg-charts";
import {supabaseBrowser} from "../../lib/supabase-browser";

const money=(n:any)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}).format(Number(n)||0);
const pct=(n:any)=>((Number(n)||0)>=0?"+":"")+((Number(n)||0).toFixed(1))+"%";

function ReportsContent(){
 const [d,setD]=useState<any>(null),[loading,setLoading]=useState(true),[q,setQ]=useState(""),[brandResults,setBrandResults]=useState<any[]>([]);
 const searchParams=useSearchParams();
 const brandId=searchParams.get("brand_id");
 async function auth(){const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session)throw new Error("Please sign in again.");return session.access_token}
 async function load(){
  setLoading(true);
  try{
   const token=await auth();
   if(brandId){
    const r=await fetch("/api/explorer?entity=brand&id="+encodeURIComponent(brandId),{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    const x=await r.json();if(!r.ok)throw new Error(x.error||"Brand report data failed.");
    setD({scope:"brand",source:x.source||"cpgist_compact",compactDataset:x.source==="cpgist_compact",brand:x.brand,totalSales:x.metrics.sales,totalUnits:x.metrics.units,avgDistribution:x.metrics.distribution,price:x.metrics.price,promoRate:x.metrics.promoRate,categorySales:x.metrics.categorySales,brandShare:x.metrics.share,priorShare:x.metrics.priorShare,shareChangePts:x.metrics.shareChangePts,growth:x.metrics.growth,periods:x.periods,weekly:x.weekly,topBrands:[{name:x.brand.name,sales:x.metrics.sales,share:100,growth:x.metrics.growth}],products:x.products,retailers:x.retailers,competitorSignals:x.competitorSignals,competitiveBenchmark:x.competitiveBenchmark,competitivePeers:x.competitiveBenchmark?.competitors||[]});
   }else{
    const r=await fetch("/api/dashboard",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    const x=await r.json();if(!r.ok)throw new Error(x.error||"Report data failed.");setD({...x,scope:"market"});
   }
  }catch(e:any){setD({error:e.message||"Report data failed."})}finally{setLoading(false)}
 }
 useEffect(()=>{load()},[brandId]);
 useEffect(()=>{let live=true;(async()=>{if(!q.trim()){setBrandResults([]);return}try{const token=await auth();const r=await fetch("/api/explorer?entity=brand&q="+encodeURIComponent(q),{headers:{Authorization:"Bearer "+token},cache:"no-store"});const x=await r.json();if(live)setBrandResults(Array.isArray(x.results)?x.results.slice(0,6):[])}catch{if(live)setBrandResults([])}})();return()=>{live=false}},[q]);
 function printPdf(){window.print()}
 async function powerpoint(){
  if(!d||d.error)return;
  try{
   const mod=await import("pptxgenjs"); const PptxGenJS:any=mod.default||mod; const pptx=new PptxGenJS();
   pptx.layout="LAYOUT_WIDE"; pptx.author="CPGist"; pptx.company="CPGist"; pptx.subject="Client-ready CPG business review"; pptx.title=(d.scope==="brand"?d.brand.name+" Brand Performance":"CPGist Executive Market Performance")+" Review"; pptx.lang="en-US";
   const dark="0E1728",accent="6D5DFC",text="101828",muted="667085",line="E5E8EF",soft="F7F8FA",green="067647",red="B42318";
   const brandName=d.scope==="brand"?String(d.brand?.name||"Selected Brand"):"Market";
   const categoryName=d.scope==="brand"?String(d.brand?.category||"Category not available"):"Market";
   const periods=Array.isArray(d.periods)?d.periods:[], latest=periods.slice(-13), prior=periods.slice(-26,-13);
   const products=Array.isArray(d.products)?d.products:[], retailers=Array.isArray(d.retailers)?d.retailers:[], signals=Array.isArray(d.competitorSignals)?d.competitorSignals:[], peer=d.competitiveBenchmark||null;
   const topProduct=products[0], topRetailer=retailers[0];
   const topProductMix=topProduct&&Number(d.totalSales)>0?Number(topProduct.sales||0)/Number(d.totalSales)*100:null;
   const retailerTotal=retailers.reduce((s:number,x:any)=>s+Number(x.sales||0),0);
   const topRetailerShare=topRetailer&&retailerTotal>0?Number(topRetailer.sales||0)/retailerTotal*100:null;
   const median=(vals:number[])=>{const a=vals.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:null};
   const retailerDistMedian=median(retailers.map((x:any)=>Number(x.distribution)).filter(Number.isFinite));
   const money0=(n:any)=>n==null?"—":money(n);
   const pct0=(n:any)=>n==null?"—":pct(n);
   const addHeader=(s:any,t:string)=>{s.background={color:"FFFFFF"};s.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:.68,fill:{color:dark},line:{color:dark}});s.addText("CPGist",{x:.55,y:.18,w:1.2,h:.2,color:"FFFFFF",bold:true,fontSize:13,fit:"shrink"});s.addText(t,{x:2,y:.18,w:10.7,h:.2,color:"FFFFFF",bold:true,fontSize:12,fit:"shrink"});};
   const footer=(s:any)=>s.addText("CPGist · Source-anchored · "+String(periods[0]||"—")+" → "+String(periods.at(-1)||"—"),{x:.5,y:7.1,w:12.3,h:.12,color:"98A2B3",fontSize:6,align:"right"});
   const note=(s:any,t:string)=>s.addText(t,{x:.7,y:6.48,w:11.7,h:.3,color:muted,fontSize:7.5,fit:"shrink"});
   const kpis=(s:any,cards:any[])=>{const count=cards.length;const gap=count>=5?.15:.27;const w=count>=5?2.34:2.75;const total=count*w+(count-1)*gap;const start=(13.333-total)/2;cards.forEach((c:any,i:number)=>{const x=start+i*(w+gap);s.addShape(pptx.ShapeType.roundRect,{x,y:1.52,w,h:1.02,rectRadius:.05,fill:{color:soft},line:{color:line}});s.addText(c[0],{x:x+.2,y:1.72,w:w-.4,h:.16,fontSize:7,color:muted,bold:true,fit:"shrink"});s.addText(String(c[1]),{x:x+.2,y:2.02,w:w-.4,h:.25,fontSize:16,color:c[2]||text,bold:true,fit:"shrink"});});};
   const unavailable=(s:any,t:string)=>s.addText(t,{x:.7,y:2.55,w:11.6,h:.55,fontSize:14,color:muted,bold:true,fit:"shrink"});
   const bullets=(s:any,items:string[],x=.75,y=3.0,w=11.6)=>items.forEach((t,i)=>s.addText("• "+t,{x,y:y+i*.58,w,h:.38,fontSize:12,color:text,fit:"shrink"}));
   const title=(s:any,t:string,sub?:string)=>{s.addText(t,{x:.7,y:1.00,w:11.7,h:.30,fontSize:21,bold:true,color:text,fit:"shrink"});if(sub)s.addText(sub,{x:.7,y:1.34,w:11.5,h:.22,fontSize:9,color:muted,fit:"shrink"});};

   // 1 — Executive Summary
   {const s=pptx.addSlide();addHeader(s,"Executive Summary");title(s,brandName,categoryName);kpis(s,[["Latest 13W",money0(d.totalSales)],["13W growth",pct0(d.growth),Number(d.growth||0)<0?red:green],["Category share",d.brandShare==null?"—":Number(d.brandShare).toFixed(1)+"%"],["Distribution",d.avgDistribution==null?"—":Number(d.avgDistribution).toFixed(1)+"%"]]);
    const takeaways=[
      brandName+" generated "+money0(d.totalSales)+" in the latest 13 weeks, "+pct0(d.growth)+" versus the prior 13 weeks.",
      d.brandShare==null?"Category share is unavailable in the current source.":"Observed category share is "+Number(d.brandShare).toFixed(1)+"% based on the reported category sales.",
      topProduct?String(topProduct.name)+" contributes "+Number(topProductMix||0).toFixed(1)+"% of brand sales; product-level growth is not exposed in the current summary.":"Product driver detail is unavailable.",
      topRetailer?String(topRetailer.name)+" is the largest observed retailer by sales in the brand scope; retailer share is "+(topRetailerShare==null?"unavailable":topRetailerShare.toFixed(1)+"% of listed retailer sales."):"Retailer contribution detail is unavailable."
    ];
    bullets(s,takeaways,.75,2.85,11.7);note(s,"Executive takeaways are descriptive signals from the connected source; they are not causal claims.");footer(s);}

   // 2 — What Changed
   {const s=pptx.addSlide();addHeader(s,"What Changed");title(s,"What changed in the latest 13 weeks","Observed movement versus the preceding 13-week period.");kpis(s,[["Sales",money0(d.totalSales)],["13W vs prior",pct0(d.growth),Number(d.growth||0)<0?red:green],["Units",new Intl.NumberFormat().format(Number(d.totalUnits||0))],["Realized price",money0(d.price)],["Distribution",d.avgDistribution==null?"—":Number(d.avgDistribution).toFixed(1)+"%"]]);
    const pts=(d.weekly||[]).slice(-26);if(pts.length)s.addChart(pptx.ChartType.line,[{name:"Sales",labels:pts.map((x:any)=>String(x.period).slice(5)),values:pts.map((x:any)=>Number(x.sales)||0)}],{x:.7,y:2.85,w:8.1,h:3.05,showLegend:false,showTitle:false,catAxisLabelFontSize:7,valAxisLabelFontSize:7,chartColors:[accent],showValue:false});
    s.addText("Interpretation",{x:9.1,y:2.9,w:3,h:.25,fontSize:11,bold:true,color:text});bullets(s,[Number(d.growth||0)<0?"Sales momentum is negative versus the prior 13 weeks.":"Sales momentum is positive versus the prior 13 weeks.","Price and distribution are observed commercial measures; the current report does not establish causal contribution.","Weekly trend shows the timing of movement without attributing the movement to a single driver."],9.1,3.3,3.3);footer(s);}

   // 3 — Category Context
   {const s=pptx.addSlide();addHeader(s,"Category Context");title(s,categoryName,"Brand position within the observed category context.");kpis(s,[["Category growth",d.metrics?.categoryGrowth==null?"—":pct(d.metrics.categoryGrowth)],["Brand share",d.brandShare==null?"—":Number(d.brandShare).toFixed(1)+"%"],["Brand growth",pct0(d.growth)],["Category sales",d.metrics?.categorySales==null?"—":money(d.metrics.categorySales)]]);
    const catGrowth=d.metrics?.categoryGrowth;
    if(catGrowth==null)unavailable(s,"Category growth is not available for the current source/period scope.");
    else s.addText("Category growth is "+pct(catGrowth)+" across the latest versus prior 13 weeks.",{x:.75,y:2.55,w:11.5,h:.35,fontSize:15,color:text,bold:true});
    if(peer?.available)s.addText("Competitive movement: anonymized peer benchmark is available for this category.",{x:.75,y:3.45,w:11.4,h:.35,fontSize:12,color:text,bold:true,fit:"shrink"});
    else s.addText("Competitive movement: no validated same-category peer benchmark is available in the connected source.",{x:.75,y:3.2,w:11.4,h:.45,fontSize:12,color:muted,fit:"shrink"});
    note(s,"No market-share claim is made beyond the observed brand-share calculation. Missing category/competitive fields are shown explicitly.");footer(s);}

   // 4 — Brand / Product Drivers
   {const s=pptx.addSlide();addHeader(s,"Brand / Product Drivers");title(s,brandName,"SKU contribution, mix and distribution; product growth is shown only when supported.");if(products.length){
      const headers=["PRODUCT / SKU","SIZE","13W SALES","MIX","DISTRIBUTION","GROWTH"];headers.forEach((h,i)=>s.addText(h,{x:[.55,4.0,5.35,7.0,8.15,10.1][i],y:1.78,w:[3.3,1.1,1.35,.9,1.6,1.3][i],h:.18,fontSize:7,bold:true,color:muted}));
      products.slice(0,7).forEach((p:any,i:number)=>{const y=2.14+i*.50;s.addText(String(p.name||"—")+" "+(p.sku?"· "+p.sku:""),{x:.55,y,w:3.3,h:.28,fontSize:9,color:text,bold:true,fit:"shrink"});s.addText(String(p.size||"—"),{x:4.0,y,w:1.1,h:.28,fontSize:9,color:muted,fit:"shrink"});s.addText(money0(p.sales),{x:5.35,y,w:1.35,h:.28,fontSize:9,color:text,bold:true,fit:"shrink"});s.addText(Number(d.totalSales)>0?(Number(p.sales||0)/Number(d.totalSales)*100).toFixed(1)+"%":"—",{x:7.0,y,w:.9,h:.28,fontSize:9,color:text,fit:"shrink"});s.addText(p.distribution==null?"—":Number(p.distribution).toFixed(1)+"%",{x:8.15,y,w:1.6,h:.28,fontSize:9,color:text,fit:"shrink"});s.addText("Unavailable",{x:10.1,y,w:1.3,h:.28,fontSize:9,color:muted,fit:"shrink"});});
    }else unavailable(s,"Product/SKU detail is not populated in the current source.");
    note(s,"The current product summary exposes 13W sales, units, price, distribution and promotion, but not a prior-period SKU series; SKU growth/decline is therefore not fabricated.");footer(s);}

   // 5 — Retailer Performance
   {const s=pptx.addSlide();addHeader(s,"Retailer Performance");title(s,brandName,"Sales, distribution and descriptive whitespace signals by observed retailer.");if(retailers.length){
      const headers=["RETAILER","CHANNEL","SALES","SALES SHARE","DISTRIBUTION","WHITESPACE SIGNAL"];headers.forEach((h,i)=>s.addText(h,{x:[.55,3.55,5.05,6.65,8.15,9.85][i],y:1.78,w:[2.8,1.3,1.3,1.2,1.5,2.5][i],h:.18,fontSize:7,bold:true,color:muted}));
      retailers.slice(0,7).forEach((r:any,i:number)=>{const y=2.14+i*.50;const dist=Number(r.distribution);const whitespace=retailerDistMedian!=null&&Number.isFinite(dist)&&dist<retailerDistMedian; s.addText(String(r.name||"—"),{x:.55,y,w:2.8,h:.28,fontSize:9,color:text,bold:true,fit:"shrink"});s.addText(String(r.channel||"—"),{x:3.55,y,w:1.3,h:.28,fontSize:9,color:muted,fit:"shrink"});s.addText(money0(r.sales),{x:5.05,y,w:1.3,h:.28,fontSize:9,color:text,bold:true,fit:"shrink"});s.addText(retailerTotal>0?(Number(r.sales||0)/retailerTotal*100).toFixed(1)+"%":"—",{x:6.65,y,w:1.2,h:.28,fontSize:9,color:text,fit:"shrink"});s.addText(r.distribution==null?"—":Number(r.distribution).toFixed(1)+"%",{x:8.15,y,w:1.5,h:.28,fontSize:9,color:text,fit:"shrink"});s.addText(whitespace?"Below observed retailer median":"No signal",{x:9.85,y,w:2.5,h:.28,fontSize:9,color:whitespace?red:muted,fit:"shrink"});});
    }else unavailable(s,"Retailer-level detail is not populated in the current source.");
    note(s,"Whitespace signal = retailer distribution below the median of listed retailers for this brand. It is a prioritization signal, not proof of incremental opportunity.");footer(s);}

   // 6 — Price & Promotion
   {const s=pptx.addSlide();addHeader(s,"Price & Promotion");title(s,brandName,"Observed commercial levers and descriptive driver signals.");kpis(s,[["Realized price",money0(d.price)],["Promo rate",d.promoRate==null?"—":Number(d.promoRate).toFixed(1)+"%"],["Distribution",d.avgDistribution==null?"—":Number(d.avgDistribution).toFixed(1)+"%"],["13W growth",pct0(d.growth),Number(d.growth||0)<0?red:green]]);
    bullets(s,[
      "Realized price = latest 13W sales divided by latest 13W units for the selected brand.",
      d.promoRate==null?"Promotion rate is unavailable in the current report scope.":"Promotion activity is observed at "+Number(d.promoRate).toFixed(1)+"% in the latest 13 weeks.",
      "The current report does not estimate incremental promotional lift, ROI or causal price elasticity.",
      d.growth!=null&&Number(d.growth)<0?"Negative sales growth should be tested against distribution, price, promotion and retailer mix rather than assigned to one cause.":"Positive sales growth should be tested against distribution, price, promotion and retailer mix before attributing a driver."
     ],.75,2.85,11.5);note(s,"Driver signals are descriptive. Causal effectiveness is intentionally not inferred from the available fields.");footer(s);}

   // 7 — Competitive Context (named, validated)
   {const s=pptx.addSlide();addHeader(s,"Competitive Context");title(s,categoryName,"Selected brand versus the top same-category brands with aligned 13W and prior-13W data.");const peers=Array.isArray(d.competitivePeers)?d.competitivePeers:[];
    if(peers.length){
      kpis(s,[["Selected brand",brandName],["13W sales",money0(d.totalSales)],["Brand growth",pct0(d.growth),Number(d.growth||0)<0?red:green],["Category growth",d.metrics?.categoryGrowth==null?"—":pct(d.metrics.categoryGrowth)],["Competitors shown",String(peers.length)]]);
      s.addText("Competitive comparison",{x:.7,y:2.78,w:4,h:.25,fontSize:12,bold:true,color:text});
      const headers=["BRAND","13W SALES","SALES GROWTH","UNIT GROWTH","DISTRIBUTION","GROWTH VS SELECTED"];headers.forEach((h,i)=>s.addText(h,{x:[.55,3.25,5.0,6.7,8.45,10.15][i],y:3.12,w:[2.5,1.55,1.45,1.45,1.45,2.45][i],h:.18,fontSize:6.5,bold:true,color:muted,fit:"shrink"}));
      const compRows=[{name:brandName,sales:d.totalSales,growth:d.growth,unitGrowth:peer.focalUnitGrowth,distribution:d.avgDistribution,selected:true},...peers];
      compRows.slice(0,7).forEach((r:any,i:number)=>{const y=3.45+i*.42;const gap=r.growth!=null&&d.growth!=null?Number(r.growth)-Number(d.growth):null;const label=r.selected?brandName:"Competitor "+i;s.addText(label,{x:.55,y,w:2.5,h:.24,fontSize:8.5,color:text,bold:true,fit:"shrink"});s.addText(money0(r.sales),{x:3.25,y,w:1.55,h:.24,fontSize:8.5,color:text,fit:"shrink"});s.addText(pct0(r.growth),{x:5.0,y,w:1.45,h:.24,fontSize:8.5,color:r.selected?text:(Number(r.growth||0)>0?green:red),fit:"shrink"});s.addText(pct0(r.unitGrowth),{x:6.7,y,w:1.45,h:.24,fontSize:8.5,color:text,fit:"shrink"});s.addText(r.distribution==null?"—":Number(r.distribution).toFixed(1)+"%",{x:8.45,y,w:1.45,h:.24,fontSize:8.5,color:text,fit:"shrink"});s.addText(r.selected?"Selected brand":gap==null?"—":(gap>0?"+":"")+gap.toFixed(1)+" pts",{x:10.15,y,w:2.45,h:.24,fontSize:8.5,color:gap!=null&&gap>0?green:gap!=null&&gap<0?red:muted,fit:"shrink"});});
      s.addText("Competitor names are intentionally anonymized in client deliverables. Metrics are shown only for validated same-category brands with complete aligned 13W and prior-13W coverage.",{x:.75,y:6.45,w:11.6,h:.32,fontSize:7.5,color:muted,fit:"shrink"});
    }else unavailable(s,"No validated same-category competitors have complete aligned 13W and prior-13W data in the connected source.");
    note(s,"Competitor names and metrics are shown only when the connected source directly identifies the brand and provides aligned periods. This comparison is descriptive; it does not establish causality.");footer(s);}

   // 8 — Opportunities
   {const s=pptx.addSlide();addHeader(s,"Opportunities");title(s,brandName,"Evidence-backed investigation opportunities from the current data.");const opps:string[]=[];
    if(topProduct)opps.push("Review "+String(topProduct.name)+" because it contributes "+Number(topProductMix||0).toFixed(1)+"% of latest 13W brand sales; validate whether concentration is intentional and supported by distribution.");
    const ws=retailers.filter((r:any)=>retailerDistMedian!=null&&Number.isFinite(Number(r.distribution))&&Number(r.distribution)<retailerDistMedian).slice(0,3);if(ws.length)opps.push("Investigate distribution whitespace at "+ws.map((r:any)=>String(r.name)).join(", ")+"; each is below the observed retailer distribution median.");
    if(d.promoRate!=null)opps.push("Review promotion mix at "+Number(d.promoRate).toFixed(1)+"% observed promo rate and compare against sales movement by retailer/product before concluding on effectiveness.");
    if(d.growth!=null&&Number(d.growth)<0)opps.push("Prioritize a driver decomposition of the "+pct(d.growth)+" sales decline across distribution, retailer mix, product mix and commercial levers.");
    if(!opps.length)opps.push("No additional evidence-backed opportunity can be identified from the currently exposed report fields without adding more granular category, SKU or retailer history.");
    bullets(s,opps,.75,2.0,11.6);note(s,"Opportunities are framed as actions to investigate, not guaranteed incremental growth.");footer(s);}

   // 9 — Risks
   {const s=pptx.addSlide();addHeader(s,"Risks");title(s,brandName,"Observed risks and explicit data limitations.");const risks:string[]=[];
    if(d.growth!=null&&Number(d.growth)<0)risks.push("Sales are down "+Math.abs(Number(d.growth)).toFixed(1)+"% versus the prior 13 weeks.");
    if(d.avgDistribution!=null&&Number(d.avgDistribution)<50)risks.push("Average distribution is "+Number(d.avgDistribution).toFixed(1)+"%; distribution may warrant deeper retailer-level investigation.");
    if(!d.metrics?.categoryGrowth)risks.push("Category growth is unavailable, limiting separation of brand-specific movement from category movement.");
    if(!signals.length)if(!(Array.isArray(d.competitivePeers)&&d.competitivePeers.length))risks.push("Validated competitive comparison is unavailable for this category in the connected source.");
    risks.push("SKU growth/decline is unavailable from the current 13W product summary; product-level trend conclusions should not be fabricated.");
    risks.push("The current dataset does not establish causal promotion lift, price elasticity or ROI.");
    bullets(s,risks,.75,1.95,11.6);note(s,"Risk statements distinguish observed performance from what the dataset cannot yet explain.");footer(s);}

   // 10 — Management Actions
   {const s=pptx.addSlide();addHeader(s,"Management Actions");title(s,brandName,"What to investigate, what to monitor, and the next-best questions.");const cols=[
      ["INVESTIGATE",[
       "Why is the latest 13W sales movement occurring?",
       "Which retailer/product combinations explain the change?",
       "Is distribution whitespace concentrated in specific accounts?"
      ]],
      ["MONITOR",[
       "13W sales and units trend",
       "Distribution and retailer mix",
       "Price and promotion signals",
       "Product concentration"
      ]],
      ["NEXT-BEST QUESTIONS",[
       "Which retailers are losing momentum?",
       "Which SKUs are growing or declining versus prior periods?",
       "Is the category moving with or against the brand?",
       "What competitive signals changed most recently?"
      ]]
    ];
    cols.forEach((col:any,i:number)=>{const x=.65+i*4.15;s.addShape(pptx.ShapeType.roundRect,{x,y:1.65,w:3.75,h:4.5,rectRadius:.04,fill:{color:soft},line:{color:line}});s.addText(col[0],{x:x+.25,y:1.95,w:3.2,h:.2,fontSize:8,bold:true,color:accent});col[1].forEach((t:string,j:number)=>s.addText("• "+t,{x:x+.25,y:2.45+j*.78,w:3.2,h:.48,fontSize:10,color:text,fit:"shrink"}));});
    note(s,"Use AI Analyst to answer these questions with the controlled analytical tools and source evidence; unsupported domains remain explicitly unavailable.");footer(s);}
   await pptx.writeFile({fileName:(d.scope==="brand"?String(d.brand.name).replace(/[^a-z0-9]+/gi,"_")+"_CPG_Business_Review":"CPGist_CPG_Business_Review")+".pptx"});
  }catch(e:any){alert("PowerPoint export failed: "+(e?.message||"Unknown error"))}
 }
 if(loading)return <AppShell title="Reports" subtitle="Decision-ready client reporting"><section className="content"><div className="card panel loading-card">Building report from live source data…</div></section></AppShell>;
 if(d?.error)return <AppShell title="Reports"><section className="content"><div className="card panel error-card">{d.error}</div></section></AppShell>;
 const lead=(d.topBrands||[])[0];
 return <AppShell title="Reports" subtitle="Decision-ready client reporting"><section className="content">
  <div className="report-hero card"><div><div className="eyebrow">{d.scope==="brand"?"BRAND REPORT":"EXECUTIVE REPORTING"}</div><h1>{d.scope==="brand"?d.brand.name+" — Brand Performance Review":"CPGist Executive Market Performance Review"}</h1><p>{d.scope==="brand"?"A focused client report containing only the selected brand's quantitative story.":"A market report that can be narrowed to a specific brand before delivery."}</p><div className="report-meta"><span><ShieldCheck size={14}/>Source-anchored</span><span><TrendingUp size={14}/>Quantitative story</span><span><FileText size={14}/>Client-ready</span></div></div><div className="report-actions"><Link className="secondary-btn" href={"/ai-analyst?brand_id="+encodeURIComponent(String(brandId||""))+"&brand_name="+encodeURIComponent(String(d?.brand?.name||""))+"&prompt="+encodeURIComponent("Prepare my monthly business review for "+String(d?.brand?.name||"the selected brand")+". Start with executive summary, then category context, brand performance, price and promotion, distribution, retailer and SKU opportunities, competitive signals, risks and next questions.")}><TrendingUp size={16}/>Prepare monthly review</Link><button className="primary" onClick={powerpoint}><Presentation size={16}/>PowerPoint</button><button className="secondary-btn" onClick={printPdf}><Download size={16}/>PDF / Print</button><button className="icon-btn report-refresh" onClick={load}><RefreshCw size={16}/></button></div></div>
  <div className="card report-scope"><div><b>Report scope</b><span>Find a brand before exporting when the client wants a brand-specific story.</span></div><div className="scope-search"><Search size={14}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search brand…"/>{q&&brandResults.length>0&&<div className="scope-results">{brandResults.map((b:any)=><Link key={b.id} href={"/reports?brand_id="+b.id} onClick={()=>setQ("")}><b>{b.name}</b><span>{b.category||"Unclassified"} · {b.parent_company||"Independent"}</span></Link>)}</div>}</div></div>
  <div className="report-grid-kpis"><div className="card kpi"><span>Latest 13W sales</span><strong>{money(d.totalSales)}</strong><small className={d.growth>=0?"positive":"negative"}>{pct(d.growth)} vs prior 13W</small></div><div className="card kpi"><span>{d.scope==="brand"?"Category share":"Units"}</span><strong>{d.scope==="brand"?(d.brandShare==null?"—":Number(d.brandShare).toFixed(1)+"%"):new Intl.NumberFormat().format(d.totalUnits||0)}</strong><small>{d.scope==="brand"?"Selected brand within its category":"Observed market"}</small></div><div className="card kpi"><span>Distribution</span><strong>{d.avgDistribution==null?"—":Number(d.avgDistribution).toFixed(1)+"%"}</strong><small>Average ACV</small></div><div className="card kpi"><span>{d.scope==="brand"?"Realized price":"Periods"}</span><strong>{d.scope==="brand"?(d.price==null?"—":money(d.price)):d.periods?.length||0}</strong><small>{d.scope==="brand"?"Sales / units":"Weekly source periods"}</small></div></div>
  <div className="two-col"><div className="card panel"><div className="panel-head"><div><b>{d.scope==="brand"?d.brand.name+" sales trend":"Market value trend"}</b><span>Last 26 completed source periods</span></div></div><LineChart points={(d.weekly||[]).slice(-26).map((x:any)=>({label:String(x.period).slice(5),value:Number(x.sales)||0}))}/></div><div className="card panel"><div className="panel-head"><div><b>{d.scope==="brand"?"Selected brand":"Brand concentration"}</b><span>Observed value share</span></div></div><div className="share-focus"><Donut share={Number(lead?.share||0)} centerLabel={d.scope==="brand"?"selected":"leader share"}/><div><strong>{lead?.name||"—"}</strong><p>{money(lead?.sales||0)} · {pct(lead?.growth||0)}</p><span>{d.scope==="brand"?"100% of this report is the selected brand.":"Select a brand above to remove unrelated brand context."}</span></div></div></div></div>
  {d.scope==="brand"&&<div className="card panel report-retailer-panel"><div className="panel-head"><div><b>{d.brand.name} retailer footprint</b><span>Latest observed retailer contribution within the selected brand scope</span></div></div>{(d.retailers||[]).length?<table><thead><tr><th>RETAILER</th><th>CHANNEL</th><th>REGION</th><th>SALES</th></tr></thead><tbody>{(d.retailers||[]).map((x:any)=><tr key={x.id}><td><b>{x.name}</b></td><td>{x.channel||"—"}</td><td>{x.region||"—"}</td><td>{money(x.sales)}</td></tr>)}</tbody></table>:<div className="empty-detail">Retailer-level data is not populated in the active dataset yet.</div>}</div>}
  {d.scope==="brand"&&<div className="card panel report-competitive-panel"><div className="panel-head"><div><b>Competitive context</b><span>Validated same-category competitors with aligned 13W and prior-13W coverage</span></div></div>{d.competitivePeers?.length?<><div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>BRAND</th><th>13W SALES</th><th>SALES GROWTH</th><th>UNIT GROWTH</th><th>DISTRIBUTION</th><th>POSITION VS SELECTED</th></tr></thead><tbody><tr><td><b>{d.brand.name}</b></td><td>{money(d.totalSales)}</td><td>{pct(d.growth)}</td><td>{d.competitiveBenchmark?.focalUnitGrowth==null?"—":pct(d.competitiveBenchmark.focalUnitGrowth)}</td><td>{d.avgDistribution==null?"—":Number(d.avgDistribution).toFixed(1)+"%"}</td><td>Selected brand</td></tr>{d.competitivePeers.map((x:any)=><tr key={x.brandId}><td><b>{x.name}</b></td><td>{money(x.sales)}</td><td>{pct(x.growth)}</td><td>{pct(x.unitGrowth)}</td><td>{x.distribution==null?"—":Number(x.distribution).toFixed(1)+"%"}</td><td>{x.growth!=null&&d.growth!=null?(Number(x.growth)>Number(d.growth)?"Higher sales growth":"Lower sales growth"):"—"}</td></tr>)}</tbody></table></div><div className="comparison-story"><b>How to read this</b><span>The table shows the selected brand alongside the top same-category brands by latest 13W sales. Use the growth, unit and distribution columns to identify where the selected brand differs and where further retailer/SKU investigation is warranted.</span></div></>:<div className="empty-detail">No validated same-category competitors have complete aligned 13W and prior-13W data in the connected source.</div>}</div>}
  <div className="two-col"><div className="card panel"><div className="panel-head"><div><b>{d.scope==="brand"?"Selected brand products":"Market performance"}</b><span>{d.scope==="brand"?"Mapped product master":"Client delivery uses anonymized market context"}</span></div></div>{d.scope==="brand"?<table><thead><tr><th>PRODUCT</th><th>SUBCATEGORY</th><th>13W SALES</th><th>UNITS</th><th>AVG PRICE</th><th>DISTRIBUTION</th><th>PROMO</th></tr></thead><tbody>{(d.products||[]).map((x:any)=><tr key={x.id}><td><b>{x.name}</b><small>{x.sku||""} · {x.size||"—"}</small></td><td>{x.subcategory||"—"}</td><td>{money(x.sales)}</td><td>{new Intl.NumberFormat().format(x.units||0)}</td><td>{x.price==null?"—":money(x.price)}</td><td>{x.distribution==null?"—":Number(x.distribution).toFixed(1)+"%"}</td><td>{x.promoRate==null?"—":Number(x.promoRate).toFixed(1)+"%"}</td></tr>)}</tbody></table>:<div className="empty-detail">Select the client's brand before exporting a client-facing report. Market-level delivery intentionally avoids naming or ranking other brands.</div>}</div><div className="card panel"><div className="panel-head"><div><b>Report narrative</b><span>Quantified, scoped, and traceable</span></div></div><div className="story-grid"><div><span>01 · OBSERVE</span><h3>Performance</h3><p>{d.scope==="brand"?d.brand.name+" generated "+money(d.totalSales)+" in the latest 13 weeks.":"Observed market sales are "+money(d.totalSales)+" in the latest 13 weeks."}</p></div><div><span>02 · DIAGNOSE</span><h3>Momentum</h3><p>The latest 13-week period is {pct(d.growth)} versus the prior 13 weeks. This is descriptive, not a causal attribution.</p></div><div><span>03 · ACT</span><h3>Next question</h3><p>{d.scope==="brand"?"Use AI Analyst to investigate periods, products, retailers, pricing, distribution and promotion for this brand.":"Select the client's brand above before exporting a client-facing story."}</p></div></div></div></div>
  <div className="report-footnote">Dataset: {d.compactDataset?"CPGist Free Dataset":"Legacy Syndicate Dataset"} · Source: {d.source||"syndicate"} · Coverage: {d.periods?.[0]||"—"} → {d.periods?.at(-1)||"—"} · Scope: {d.scope==="brand"?d.brand.name:"Market"}</div>
 </section></AppShell>
}

export default function Reports(){
 return <Suspense fallback={<AppShell title="Reports" subtitle="Decision-ready client reporting"><section className="content"><div className="card panel loading-card">Loading report workspace…</div></section></AppShell>}><ReportsContent/></Suspense>;
}
