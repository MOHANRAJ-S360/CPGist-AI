"use client";

import {useEffect,useMemo,useState} from "react";
import {Search,Check,BarChart3,ChevronDown,Info,ShieldCheck,TrendingUp} from "lucide-react";
import {useRouter} from "next/navigation";
import {AppShell} from "../../components/app-shell";
import {BarChart,LineChart} from "../../components/cpg-charts";
import {supabaseBrowser} from "../../lib/supabase-browser";

const n=(v:any)=>Number(v??0)||0;
const money=(v:any)=>v==null?"—":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}).format(n(v));
const pct=(v:any)=>v==null?"—":(n(v)>=0?"+":"")+n(v).toFixed(1)+"%";

export default function AdvancedAnalytics(){
 const [brands,setBrands]=useState<any[]>([]),[brandId,setBrandId]=useState(""),[d,setD]=useState<any>(null),[loading,setLoading]=useState(false),[error,setError]=useState(""),[brandQuery,setBrandQuery]=useState(""),[brandMenuOpen,setBrandMenuOpen]=useState(false);
 const router=useRouter();
 const selectedBrand=useMemo(()=>brands.find(b=>String(b.id)===String(brandId)),[brands,brandId]);
 const filteredBrands=useMemo(()=>{
   const q=brandQuery.trim().toLowerCase();
   if(!q)return brands;
   return brands.filter(b=>String(b.name||"").toLowerCase().includes(q)||String(b.category||"").toLowerCase().includes(q)||String(b.parent_company||"").toLowerCase().includes(q));
 },[brands,brandQuery]);
 useEffect(()=>{(async()=>{try{const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session)return;const r=await fetch("/api/explorer?entity=brand&limit=5000",{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});const x=await r.json();setBrands(Array.isArray(x.results)?x.results:[])}catch(e:any){setError(e?.message||"Brand directory failed.")}})()},[]);
 useEffect(()=>{const fromUrl=typeof window!=="undefined"?new URLSearchParams(window.location.search).get("brand_id"):null;if(fromUrl)setBrandId(fromUrl)},[]);
 useEffect(()=>{if(!brandId)return;let live=true;(async()=>{setLoading(true);setError("");try{const {data:{session}}=await supabaseBrowser().auth.getSession();if(!session)throw new Error("Please sign in again.");const r=await fetch("/api/advanced-analytics?brand_id="+encodeURIComponent(brandId),{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});const x=await r.json();if(!r.ok)throw new Error(x.error||"Could not load advanced analytics.");if(live)setD(x)}catch(e:any){if(live)setError(e?.message||"Advanced analytics failed.")}finally{if(live)setLoading(false)}})();return()=>{live=false}},[brandId]);

 const promoBars=useMemo(()=>((d?.promoLift?.byPromoType||[]).slice(0,8).map((x:any)=>({label:String(x.key||"Unknown"),value:Math.max(0,n(x.roi))}))),[d]);
 const syntheticLatest=useMemo(()=>{const rows=d?.syntheticPanel?.rows||[];return rows.at(-1)||null},[d]);
 const macroPoints=useMemo(()=>{const rows=d?.macroOverlay?.rows||[];return rows.slice(-26).map((x:any)=>({label:String(x.week||"").slice(5),value:n(x.inflationIndex)}))},[d]);
 const skuRows=(d?.skuGrowth?.products||[]).filter((x:any)=>String(x.is_actual).toLowerCase()==="false").slice(0,10);
 const actualSkuRows=(d?.skuGrowth?.products||[]).filter((x:any)=>String(x.is_actual).toLowerCase()==="true").slice(0,10);

 return <AppShell title="Advanced Analytics" subtitle="Commercial diagnostics from the connected CPGist analytical layer"><section className="content">
  <div className="intro"><div><div className="muted">ADVANCED ANALYTICS</div><h1>Go from reporting to commercial diagnostics.</h1><p>Promotion economics, SKU momentum, category context, channel, margin, launches and clearly separated synthetic context.</p></div><div className="scope-badge">Evidence-first · source anchored</div></div>
  <div className="card" style={{padding:18,marginBottom:16}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16}}><div><b>Brand scope</b><span style={{display:"block",fontSize:10,color:"#98a2b3",marginTop:4}}>All brands from the active dataset are available.</span></div><div className="brand-combobox advanced-brand-picker">
    <button type="button" className={"brand-combobox-trigger"+(brandMenuOpen?" open":"")} onClick={()=>setBrandMenuOpen(v=>!v)}>
      <span className="brand-combobox-icon"><Search size={15}/></span>
      <span className="brand-combobox-value">{selectedBrand?String(selectedBrand.name)+(selectedBrand.category?" · "+selectedBrand.category:""):"Select a brand…"}</span>
      <span className="brand-combobox-chevron"><ChevronDown size={16}/></span>
    </button>
    {brandMenuOpen&&<div className="brand-combobox-menu">
      <div className="brand-combobox-search"><Search size={14}/><input autoFocus value={brandQuery} onChange={e=>setBrandQuery(e.target.value)} placeholder="Search all brands…" onClick={e=>e.stopPropagation()}/></div>
      <div className="brand-combobox-list">
        {filteredBrands.length?filteredBrands.map(b=><button type="button" className={"brand-option"+(String(b.id)===String(brandId)?" selected":"")} key={b.id} onClick={()=>{setBrandId(String(b.id));setBrandMenuOpen(false);setBrandQuery("");router.replace("/advanced-analytics?brand_id="+encodeURIComponent(String(b.id)));}}>
          <span className="brand-option-avatar">{String(b.name||"B").slice(0,1).toUpperCase()}</span>
          <span className="brand-option-copy"><b>{b.name}</b><small>{b.category||"Unclassified"} · {b.parent_company||"Independent"}</small></span>
          {String(b.id)===String(brandId)&&<span className="brand-option-check"><Check size={15}/></span>}
        </button>):<div className="brand-combobox-empty">No matching brands found.</div>}
      </div>
    </div>}
  </div></div></div>
  {!brandId?<div className="card empty-detail"><BarChart3 size={24}/><h2>Select a brand</h2><p>Use the full brand selector to review promotion economics, SKU growth, channel, margin, launch and synthetic-context layers.</p></div>:loading?<div className="card loading-card">Loading advanced evidence…</div>:error?<div className="card form-error">{error}</div>:d&&<>
   {d.provenance?.label&&<div className="data-provenance"><ShieldCheck size={13}/><b>{d.provenance.label}</b><span>Projected/observed status is computed from is_actual.</span></div>}
   <div className="report-grid-kpis"><div className="card kpi"><span>13W sales</span><strong>{money(d.brandSummary?.latestSales??d.categoryContext?.context?.brandSales)}</strong><small>Source-aligned selected brand</small></div><div className="card kpi"><span>Promotion ROI</span><strong>{d.promoLift?.summary?.roi==null?"—":Number(d.promoLift.summary.roi).toFixed(2)+"x"}</strong><small>{d.promoLift?.available?"Incremental margin / trade spend":"Promotion economics unavailable"}</small></div><div className="card kpi"><span>Gross margin</span><strong>{d.margin?.marginPercent==null?"—":Number(d.margin.marginPercent).toFixed(2)+"%"}</strong><small>{d.margin?.marginAtRisk?.length||0} margin-at-risk SKUs</small></div><div className="card kpi"><span>Launches</span><strong>{d.launchPerformance?.products?.length||0}</strong><small>Products with launch_date</small></div></div>

   <div className="two-col">
    <div className="card panel"><div className="panel-head"><div><b>Promotion economics</b><span>Incremental sales, margin and ROI by promotion type · status-aligned</span></div></div>{d.promoLift?.available?<><div className="advanced-kpis"><div><span>Incremental sales</span><b>{money(d.promoLift.summary.incrementalSales)}</b></div><div><span>Incremental margin</span><b>{money(d.promoLift.summary.incrementalMargin)}</b></div><div><span>Trade spend</span><b>{money(d.promoLift.summary.tradeSpend)}</b></div><div><span>ROI</span><b>{d.promoLift.summary.roi==null?"—":Number(d.promoLift.summary.roi).toFixed(2)+"x"}</b></div></div>{promoBars.length?<BarChart items={promoBars}/>:<div className="empty-detail compact">No promotion-type ROI rows are populated.</div>}</>:<div className="empty-detail compact"><b>Promotion economics unavailable</b><span>Requires promotion events with aligned same-status sales, baseline and trade-spend evidence.</span></div>}</div>
    <div className="card panel"><div className="panel-head"><div><b>Observed category context</b><span>Bounded by aligned category source data, not total market</span></div><TrendingUp size={17}/></div>{d.categoryContext?.available?<div className="advanced-kpis"><div><span>Category growth</span><b>{pct(d.categoryContext.context.categoryGrowthPct)}</b></div><div><span>Brand growth</span><b>{pct(d.categoryContext.context.brandGrowthPct)}</b></div><div><span>Brand share</span><b>{d.categoryContext.context.brandSharePct==null?"—":Number(d.categoryContext.context.brandSharePct).toFixed(2)+"%"}</b></div></div>:<div className="empty-detail compact">Category context is unavailable for the selected source status/window.</div>}<p className="muted">{d.categoryContext?.disclaimer}</p></div>
   </div>

   <div className="two-col">
    <div className="card panel"><div className="panel-head"><div><b>SKU growth</b><span>Same-status 13W vs prior 13W — actual and projected kept separate</span></div></div>{d.skuGrowth?.products?.length?<><table><thead><tr><th>SKU</th><th>STATUS</th><th>13W SALES</th><th>GROWTH</th></tr></thead><tbody>{[...actualSkuRows,...skuRows].slice(0,10).map((x:any)=><tr key={String(x.productId)+"-"+x.is_actual}><td><b>{x.productId}</b></td><td>{x.is_actual?"Actual":"Projected"}</td><td>{money(x.latestSales)}</td><td>{pct(x.growthPct)}</td></tr>)}</tbody></table><div className="report-footnote">Growth is never calculated across an actual/projected boundary.</div></>:<div className="empty-detail compact">SKU-week growth is unavailable until product-weekly records are populated.</div>}</div>
    <div className="card panel"><div className="panel-head"><div><b>Channel breakdown</b><span>Latest 13-week retailer performance rolled up by retailer.channel</span></div></div>{d.channelBreakdown?.length?<table><thead><tr><th>CHANNEL</th><th>SALES</th><th>RETAILERS</th></tr></thead><tbody>{d.channelBreakdown.slice(0,10).map((x:any)=><tr key={x.channel}><td>{x.channel}</td><td>{money(x.sales)}</td><td>{x.retailerCount}</td></tr>)}</tbody></table>:<div className="empty-detail compact">Channel-level brand-retailer data is not populated yet.</div>}</div>
   </div>

   <div className="two-col">
    <div className="card panel"><div className="panel-head"><div><b>Margin / P&amp;L</b><span>Latest 13-week gross-margin dollars and margin-at-risk view</span></div></div>{d.margin?.available?<><div className="advanced-kpis"><div><span>Sales</span><b>{money(d.margin.totalSales)}</b></div><div><span>Gross margin</span><b>{money(d.margin.totalGrossMargin)}</b></div><div><span>Margin %</span><b>{d.margin.marginPercent==null?"—":Number(d.margin.marginPercent).toFixed(1)+"%"}</b></div></div>{d.margin.marginAtRisk?.length?<table><thead><tr><th>SKU</th><th>SALES</th><th>MARGIN %</th></tr></thead><tbody>{d.margin.marginAtRisk.slice(0,8).map((x:any)=><tr key={x.id}><td><b>{x.name}</b></td><td>{money(x.sales)}</td><td>{x.marginPercent==null?"—":Number(x.marginPercent).toFixed(2)+"%"}</td></tr>)}</tbody></table>:<div className="empty-detail compact">No populated margin-at-risk rows.</div>}</>:<div className="empty-detail compact">Margin detail is unavailable until SKU/retailer weekly margin fields are populated.</div>}</div>
    <div className="card panel"><div className="panel-head"><div><b>New-product / launch tracking</b><span>Trial, repeat and cumulative sales since launch</span></div></div>{d.launchPerformance?.products?.length?<table><thead><tr><th>PRODUCT</th><th>LAUNCH</th><th>TRIAL</th><th>REPEAT</th><th>CUM. SALES</th></tr></thead><tbody>{d.launchPerformance.products.slice(0,8).map((x:any)=>{const w=x.weekly?.at(-1);return <tr key={x.productId}><td><b>{x.name}</b></td><td>{x.launchDate}</td><td>{w?.trialRate==null?"—":Number(w.trialRate).toFixed(1)+"%"}</td><td>{w?.repeatRate==null?"—":Number(w.repeatRate).toFixed(1)+"%"}</td><td>{money(x.cumulativeSales)}</td></tr>})}</tbody></table>:<div className="empty-detail compact">No launch_date + trial_repeat records are populated.</div>}</div>
   </div>

   {d.syntheticPanel?.available&&<div className="card panel synthetic-panel"><div className="panel-head"><div><b>Synthetic shopper panel</b><span>Clearly separated from POS-based reporting</span></div><Info size={17}/></div><div className="data-provenance synthetic"><Info size={13}/><b>{d.syntheticPanel.label}</b></div>{syntheticLatest?<div className="advanced-kpis"><div><span>Household penetration</span><b>{syntheticLatest.penetrationPct==null?"—":Number(syntheticLatest.penetrationPct).toFixed(1)+"%"}</b></div><div><span>Purchase frequency</span><b>{syntheticLatest.purchaseFrequency==null?"—":Number(syntheticLatest.purchaseFrequency).toFixed(2)}</b></div><div><span>Week</span><b>{syntheticLatest.week}</b></div></div>:<div className="empty-detail compact">No synthetic panel week is available.</div>}<p className="muted">Illustrative only. This layer is not real NielsenIQ Homescan or other household-panel data.</p></div>}

   {d.macroOverlay?.available&&<div className="card panel synthetic-panel"><div className="panel-head"><div><b>Macro overlay</b><span>Optional contextual series</span></div><Info size={17}/></div><div className="data-provenance synthetic"><Info size={13}/><b>{d.macroOverlay.label}</b></div><LineChart points={macroPoints}/></div>}
  </>}
 </section></AppShell>
}
