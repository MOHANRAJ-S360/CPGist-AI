export type AdvancedRow = Record<string, any>;

const n = (v:any) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const pct = (now:number, old:number) => old ? (now / old - 1) * 100 : null;
const uniq = (xs:any[]) => [...new Set(xs.map(x=>String(x ?? "")).filter(Boolean))].sort();
const isActual = (v:any) => v === true || String(v).toLowerCase() === "true";

export function actualSyntheticProvenance(rows:AdvancedRow[], dateStart?:string|null, dateEnd?:string|null) {
  const filtered = rows.filter(r => (!dateStart || String(r.week ?? r.week_ending) >= dateStart) && (!dateEnd || String(r.week ?? r.week_ending) <= dateEnd));
  const byWeek = new Map<string, Set<boolean>>();
  filtered.forEach(r => {
    const w=String(r.week ?? r.week_ending ?? "");
    if(!w)return;
    if(!byWeek.has(w))byWeek.set(w,new Set());
    if(r.is_actual === true) byWeek.get(w)!.add(true);
    else if(r.is_actual === false) byWeek.get(w)!.add(false);
  });
  const periods=[...byWeek.keys()].sort();
  const actual=periods.filter(w=>byWeek.get(w)?.has(true) && !byWeek.get(w)?.has(false));
  const synthetic=periods.filter(w=>byWeek.get(w)?.has(false) && !byWeek.get(w)?.has(true));
  const mixed=periods.filter(w=>byWeek.get(w)?.has(true) && byWeek.get(w)?.has(false));
  const firstSynthetic=synthetic[0] ?? null;
  const lastActual=actual.at(-1) ?? null;
  return {
    totalWeeks:periods.length,
    actualWeeks:actual.length,
    syntheticWeeks:synthetic.length,
    mixedWeeks:mixed.length,
    firstSyntheticWeek:firstSynthetic,
    lastActualWeek:lastActual,
    status: synthetic.length || mixed.length ? (actual.length ? "mixed" : "synthetic") : "actual",
    label: synthetic.length || mixed.length ? `${synthetic.length + mixed.length} of ${periods.length} weeks in this view are projected, not observed` : null,
    periods,
    actualPeriods:actual,
    syntheticPeriods:synthetic,
    mixedPeriods:mixed,
    sourceOfTruth:"is_actual"
  };
}

function sameStatusWindows(rows:AdvancedRow[], weekKey="week_ending") {
  const statuses = [true,false].map(status => {
    const filtered=rows.filter(r=>isActual(r.is_actual)===status);
    const periods=uniq(filtered.map(r=>r[weekKey])).sort();
    const latest=periods.slice(-13);
    const prior=periods.slice(-26,-13);
    return {is_actual:status,periods,latest,prior};
  }).filter(x=>x.latest.length===13 && x.prior.length===13);
  return statuses;
}

export function getSkuGrowth(rows:AdvancedRow[]) {
  const windows=sameStatusWindows(rows);
  const results:any[]=[];
  for(const w of windows){
    const latestSet=new Set(w.latest),priorSet=new Set(w.prior);
    const byProduct=new Map<string,{latestSales:number;priorSales:number;latestUnits:number;priorUnits:number}>();
    rows.filter(r=>isActual(r.is_actual)===w.is_actual).forEach(r=>{
      const id=String(r.product_id ?? r.sku ?? "");
      if(!id)return;
      const x=byProduct.get(id) ?? {latestSales:0,priorSales:0,latestUnits:0,priorUnits:0};
      if(latestSet.has(String(r.week_ending))) {x.latestSales+=n(r.sales);x.latestUnits+=n(r.units);}
      if(priorSet.has(String(r.week_ending))) {x.priorSales+=n(r.sales);x.priorUnits+=n(r.units);}
      byProduct.set(id,x);
    });
    results.push(...[...byProduct.entries()].map(([productId,x])=>({
      productId,is_actual:w.is_actual,latestSales:x.latestSales,priorSales:x.priorSales,
      growthPct:pct(x.latestSales,x.priorSales),latestUnits:x.latestUnits,priorUnits:x.priorUnits,
      unitGrowthPct:pct(x.latestUnits,x.priorUnits),periodCount:26
    })));
  }
  return {products:results.sort((a,b)=>n(b.latestSales)-n(a.latestSales)),windows:windows.map(w=>({is_actual:w.is_actual,latest:w.latest,prior:w.prior}))};
}

export function getCategoryContext(categoryRows:AdvancedRow[], brandRows:AdvancedRow[], brandId?:string) {
  const rows=categoryRows;
  const byStatus=(status:boolean)=>{
    const cr=rows.filter(r=>isActual(r.is_actual)===status), br=brandRows.filter(r=>isActual(r.is_actual)===status && (!brandId || String(r.brand_id)===String(brandId)));
    const periods=uniq(cr.map(r=>r.week_ending)).sort();
    const latest=periods.slice(-13),prior=periods.slice(-26,-13),ls=new Set(latest),ps=new Set(prior);
    if(latest.length!==13 || prior.length!==13)return null;
    const sum=(rs:any[],key:string)=>rs.reduce((s,r)=>s+n(r[key]),0);
    const categorySales=sum(cr.filter(r=>ls.has(String(r.week_ending))),"total_category_sales");
    const categoryPriorSales=sum(cr.filter(r=>ps.has(String(r.week_ending))),"total_category_sales");
    const brandSales=sum(br.filter(r=>ls.has(String(r.week_ending))),"sales");
    const brandPriorSales=sum(br.filter(r=>ps.has(String(r.week_ending))),"sales");
    const share=categorySales?brandSales/categorySales*100:null;
    const priorShare=categoryPriorSales?brandPriorSales/categoryPriorSales*100:null;
    return {is_actual:status,categorySales,categoryPriorSales,categoryGrowthPct:pct(categorySales,categoryPriorSales),brandSales,brandPriorSales,brandGrowthPct:pct(brandSales,brandPriorSales),brandSharePct:share,priorBrandSharePct:priorShare,shareChangePts:share!=null&&priorShare!=null?share-priorShare:null,periodCount:13,periods:latest};
  };
  const brandStatuses=new Set(brandRows.filter(r=>!brandId || String(r.brand_id)===String(brandId)).map(r=>isActual(r.is_actual)));
  const preferred=brandStatuses.has(false)?false:true;
  const current=byStatus(preferred) ?? byStatus(!preferred);
  const observed=current?.is_actual===true;
  return {available:Boolean(current),observed,context:current,disclaimer:observed?"Observed category is bounded by tracked category aggregates; it is not a total-market category claim.":"Projected category context is based on the same-status weekly source layer; it is not an observed total-market category claim."};
}

export function getChannelBreakdown(rows:AdvancedRow[], retailers:AdvancedRow[], periods?:string[], statusFilter?:boolean) {
  const scoped=periods?.length?rows.filter(r=>periods.includes(String(r.week_ending)) && (isActual==null || isActual(r.is_actual)===isActual)):rows.filter(r=>isActual==null || r.is_actual===isActual);
  const names=new Map(retailers.map(r=>[String(r.id),r]));
  const map=new Map<string,{channel:string;sales:number;units:number;distributionSum:number;distributionCount:number;retailers:Set<string>}>();
  scoped.forEach(r=>{
    const retailer=names.get(String(r.retailer_id))||{};
    const channel=String(retailer.channel||r.channel||"Unclassified");
    const x=map.get(channel)||{channel,sales:0,units:0,distributionSum:0,distributionCount:0,retailers:new Set<string>()};
    x.sales+=n(r.sales);x.units+=n(r.units);
    if(r.distribution!=null){x.distributionSum+=n(r.distribution);x.distributionCount++;}
    x.retailers.add(String(r.retailer_id||""));
    map.set(channel,x);
  });
  return [...map.values()].map(x=>({channel:x.channel,sales:x.sales,units:x.units,avgDistribution:x.distributionCount?x.distributionSum/x.distributionCount:null,retailerCount:[...x.retailers].filter(Boolean).length})).sort((a,b)=>b.sales-a.sales);
}

export function getMarginPnl(rows:AdvancedRow[], productMaster:AdvancedRow[]=[], retailerMaster:AdvancedRow[]=[]) {
  const products=new Map(productMaster.map(x=>[String(x.id),x]));
  const retailers=new Map(retailerMaster.map(x=>[String(x.id),x]));
  const totalSales=rows.reduce((s,r)=>s+n(r.sales),0);
  const totalGrossMargin=rows.reduce((s,r)=>s+n(r.gross_margin),0);
  const bySku=new Map<string,any>(), byRetailer=new Map<string,any>();
  for(const r of rows){
    const sku=String(r.product_id ?? r.sku ?? "Unknown SKU");
    const retailer=String(r.retailer_id ?? "Unknown retailer");
    const add=(m:Map<string,any>,id:string,name:string)=>{
      const x=m.get(id)||{id,name,sales:0,grossMargin:0,units:0,marginPctValues:[]};
      x.sales+=n(r.sales);x.grossMargin+=n(r.gross_margin);x.units+=n(r.units);
      if(r.margin_percent!=null)x.marginPctValues.push(n(r.margin_percent));
      m.set(id,x);
    };
    add(bySku,sku,products.get(sku)?.name||products.get(sku)?.sku||sku);
    add(byRetailer,retailer,retailers.get(retailer)?.name||retailer);
  }
  const finish=(m:Map<string,any>)=>[...m.values()].map(x=>({...x,marginPercent:x.sales?x.grossMargin/x.sales*100:null,avgMarginPercent:x.marginPctValues.length?x.marginPctValues.reduce((a:number,b:number)=>a+b,0)/x.marginPctValues.length:null,marginPctValues:undefined})).sort((a,b)=>b.sales-a.sales);
  const skus=finish(bySku), retailer=finish(byRetailer);
  const marginAtRisk=skus.filter(x=>x.sales>0 && x.marginPercent!=null && x.marginPercent<20).slice(0,10);
  return {available:rows.length>0,totalSales,totalGrossMargin,marginPercent:totalSales?totalGrossMargin/totalSales*100:null,skus,retailer,marginAtRisk};
}

export function getLaunchPerformance(products:AdvancedRow[], trialRows:AdvancedRow[], salesRows:AdvancedRow[]) {
  const launched=products.filter(p=>p.launch_date);
  const trial=new Map<string,AdvancedRow[]>();
  trialRows.forEach(r=>{const k=String(r.sku||"");if(!trial.has(k))trial.set(k,[]);trial.get(k)!.push(r)});
  const salesByProduct=new Map<string,AdvancedRow[]>();
  salesRows.forEach(r=>{const k=String(r.product_id||"");if(!salesByProduct.has(k))salesByProduct.set(k,[]);salesByProduct.get(k)!.push(r)});
  const out=launched.map(p=>{
    const ts=(trial.get(String(p.sku))||[]).sort((a,b)=>String(a.week).localeCompare(String(b.week)));
    const ss=(salesByProduct.get(String(p.id))||[]).filter(r=>String(r.week_ending)>=String(p.launch_date)).sort((a,b)=>String(a.week_ending).localeCompare(String(b.week_ending)));
    let cumulative=0;const weekly=ts.map(t=>{const s=ss.find(x=>String(x.week_ending)===String(t.week));cumulative+=n(s?.sales);return{week:t.week,trialRate:t.trial_rate==null?null:n(t.trial_rate)*100,repeatRate:t.repeat_rate==null?null:n(t.repeat_rate)*100,cumulativeSales:cumulative,is_actual:t.is_actual}}).filter(x=>x.trialRate!=null||x.repeatRate!=null);
    return {productId:p.id,name:p.name,sku:p.sku,launchDate:p.launch_date,weekly,cumulativeSales:weekly.at(-1)?.cumulativeSales??0};
  });
  return {available:out.length>0,products:out};
}

export function getSyntheticPanel(panelRows:AdvancedRow[]) {
  const byWeekBrand=new Map<string,any>();
  for(const r of panelRows){
    const key=[r.week,r.region,r.brand,r.category].join("|");
    const x=byWeekBrand.get(key)||{week:String(r.week),region:r.region,brand:r.brand,category:r.category,households:new Set<string>(),buyers:new Set<string>(),units:0};
    x.households.add(String(r.household_id));
    x.units+=n(r.units);
    if(n(r.units)>0)x.buyers.add(String(r.household_id));
    byWeekBrand.set(key,x);
  }
  const rows=[...byWeekBrand.values()].map(x=>({week:x.week,region:x.region,brand:x.brand,category:x.category,panelHouseholds:x.households.size,buyers:x.buyers.size,penetrationPct:x.households.size?x.buyers.size/x.households.size*100:null,purchaseFrequency:x.buyers.size?x.units/x.buyers.size:null,units:x.units,isSyntheticPanel:true}));
  return {available:rows.length>0,rows,label:"Synthetic panel (illustrative only, not real household data)"};
}

export function getMacroOverlay(rows:AdvancedRow[]) {
  return {available:rows.length>0,rows:rows.map(r=>({week:r.week,region:r.region,inflationIndex:r.inflation_index,categoryPriceIndex:r.category_price_index})),label:"Illustrative synthetic macro trend — not tied to real economic data"};
}

export function getPromoLift(events:AdvancedRow[], salesRows:AdvancedRow[], baselineRows:AdvancedRow[], tradeRows:AdvancedRow[]) {
  const tradeByKey=new Map<string,number>();
  tradeRows.forEach(r=>{const k=[r.product_id,r.brand_id,r.retailer_id,r.week].join("|");tradeByKey.set(k,(tradeByKey.get(k)||0)+n(r.trade_spend))});
  const eventRows=events.map(e=>{
    const start=String(e.date_start||""),end=String(e.date_end||"");
    const matchesFor=(status:boolean)=>{
      const sales=salesRows.filter(s=>String(s.product_id)===String(e.product_id)&&String(s.brand_id)===String(e.brand_id)&&String(s.retailer_id)===String(e.retailer_id)&&String(s.week_ending)>=start&&String(s.week_ending)<=end&&s.is_actual===status);
      const base=baselineRows.filter(b=>String(b.product_id)===String(e.product_id)&&String(b.brand_id)===String(e.brand_id)&&String(b.retailer_id)===String(e.retailer_id)&&String(b.week)>=start&&String(b.week)<=end&&b.is_actual===status);
      return {sales,base};
    };
    const eventActual=isActual(e.is_actual),preferred=matchesFor(eventActual),alternate=matchesFor(!eventActual);
    const chosen=preferred.sales.length&&preferred.base.length?{...preferred,status:e.is_actual===true}:alternate.sales.length&&alternate.base.length?{...alternate,status:e.is_actual!==true}:null;
    const relevant=chosen?.sales||[],baseRows=chosen?.base||[];
    const actualSales=relevant.reduce((s,r)=>s+n(r.sales),0),actualUnits=relevant.reduce((s,r)=>s+n(r.units),0),actualMargin=relevant.reduce((s,r)=>s+n(r.gross_margin),0);
    const baselineSales=baseRows.reduce((s,r)=>s+n(r.baseline_sales),0)||n(e.baseline_units)*n(e.promo_price);
    const baselineUnits=baseRows.reduce((s,r)=>s+n(r.baseline_units),0)||n(e.baseline_units);
    const incrementalSales=actualSales-baselineSales,incrementalUnits=actualUnits-baselineUnits;
    const marginRate=actualSales?actualMargin/actualSales:null,incrementalMargin=marginRate!=null?incrementalSales*marginRate:null;
    const tradeSpend=baseRows.reduce((s,r)=>s+(tradeByKey.get([r.product_id,r.brand_id,r.retailer_id,r.week].join("|"))??0),0)||n(e.trade_spend)||0;
    const roi=tradeSpend>0&&incrementalMargin!=null?incrementalMargin/tradeSpend:null;
    return {promotionId:e.promotion_id,brandId:e.brand_id,productId:e.product_id,retailerId:e.retailer_id,promoType:e.promo_type,dateStart:start,dateEnd:end,is_actual:e.is_actual,analysisStatus:chosen?.status??null,available:Boolean(chosen),actualSales,actualUnits,baselineSales,baselineUnits,incrementalSales,incrementalUnits,grossMargin:actualMargin,incrementalMargin,tradeSpend,roi,discountPct:e.discount_pct,promoPrice:e.promo_price,source:"promotion + same-status sales_weekly + same-status baseline_sales + trade_spend"};
  });
  const valid=eventRows.filter(x=>x.available);
  const rollup=(key:"promoType"|"retailerId")=>{const m=new Map<string,any>();valid.forEach(x=>{const k=String(x[key]??"Unknown"),v=m.get(k)||{key:k,events:0,incrementalSales:0,incrementalMargin:0,tradeSpend:0,roi:null};v.events++;v.incrementalSales+=n(x.incrementalSales);v.incrementalMargin+=n(x.incrementalMargin);v.tradeSpend+=n(x.tradeSpend);m.set(k,v)});return[...m.values()].map(v=>({...v,roi:v.tradeSpend?v.incrementalMargin/v.tradeSpend:null})).sort((a,b)=>b.incrementalSales-a.incrementalSales)};
  const spend=valid.reduce((s,x)=>s+n(x.tradeSpend),0),margin=valid.reduce((s,x)=>s+n(x.incrementalMargin),0);
  const statuses=[...new Set(valid.map(x=>x.analysisStatus).filter(v=>v===true||v===false))];
  const status=statuses.length===1?(statuses[0]?"actual":"projected"):statuses.length>1?"mixed":null;
  return {available:valid.length>0,status,events:valid,unmatchedEvents:eventRows.filter(x=>!x.available).length,summary:{events:valid.length,incrementalSales:valid.reduce((s,x)=>s+n(x.incrementalSales),0),incrementalUnits:valid.reduce((s,x)=>s+n(x.incrementalUnits),0),incrementalMargin:margin,tradeSpend:spend,roi:spend?margin/spend:null},byPromoType:rollup("promoType"),byRetailer:rollup("retailerId")};
}
