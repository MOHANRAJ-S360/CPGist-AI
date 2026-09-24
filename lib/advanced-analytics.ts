const num=(v:any)=>Number(v??0)||0;
const pct=(a:number,b:number)=>b?((a/b)-1)*100:null;

async function get(path:string,token:string){
 const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!u||!k)throw new Error("Supabase environment is not configured.");
 if(!token)throw new Error("Your session has expired. Please sign in again.");
 const r=await fetch(u+"/rest/v1/"+path,{headers:{apikey:k,Authorization:"Bearer "+token},cache:"no-store"});
 if(!r.ok)throw new Error(await r.text());
 return r.json();
}
async function paged(path:string,token:string){
 const out:any[]=[];
 for(let offset=0;offset<100000;offset+=1000){
  const join=path.includes("?")?"&":"?";
  const rows:any[]=await get(path+join+"limit=1000&offset="+offset,token);
  out.push(...rows);
  if(rows.length<1000)break;
 }
 return out;
}
function actual(r:any){
 if(typeof r.is_actual==="boolean")return r.is_actual;
 if(String(r.data_quality_status||"").toLowerCase().includes("synthetic"))return false;
 if(String(r.data_quality_status||"").toLowerCase().includes("observ"))return true;
 return null;
}
function provenance(rows:any[],key="week_ending"){
 const m=new Map<string,boolean|null>();
 rows.forEach(r=>{const p=String(r[key]||"");if(p&&!m.has(p))m.set(p,actual(r))});
 const a=[...m].filter(x=>x[1]===true),s=[...m].filter(x=>x[1]===false);
 return {actualWeeks:a.length,syntheticWeeks:s.length,totalWeeks:m.size,mixed:a.length>0&&s.length>0,status:s.length?"mixed":"actual",label:s.length?s.length+" of "+m.size+" weeks in this view are projected, not observed":null};
}
function windows(rows:any[],status:boolean){
 const periods=[...new Set(rows.filter(r=>actual(r)===status).map(r=>String(r.week_ending)).filter(Boolean))].sort();
 return {latest:periods.slice(-13),prior:periods.slice(-26,-13)};
}
function sum(rows:any,key:string){return rows.reduce((s,r)=>s+num(r[key]),0)}
function avg(rows:any,key:string){return rows.length?sum(rows,key)/rows.length:null}

export async function runAdvancedAnalytics(type:string,token:string,p:any){
 if(type==="promo_lift"){
  let events:any[]=[];
  try{
   let q="cpgist_promotion_events?select=*&order=date_start.asc";
   if(p.brandId)q+="&brand_id=eq."+encodeURIComponent(p.brandId);
   if(p.retailerId)q+="&retailer_id=eq."+encodeURIComponent(p.retailerId);
   if(p.sku)q+="&product_id=eq."+encodeURIComponent(p.sku);
   events=await paged(q,token);
  }catch{}
  if(events.length){
   const detail=events.map(e=>{
    const incSales=e.incremental_sales!=null?num(e.incremental_sales):num(e.incremental_units)*num(e.promo_price);
    const incMargin=e.incremental_margin!=null?num(e.incremental_margin):(e.margin_percent!=null?incSales*num(e.margin_percent):null);
    const spend=e.trade_spend==null?null:num(e.trade_spend);
    return {...e,incrementalSales:incSales,incrementalMargin:incMargin,roi:spend&&incMargin!=null?incMargin/spend:null};
   });
   const incSales=sum(detail,"incrementalSales"),incMargin=sum(detail,"incrementalMargin"),spend=sum(detail,"trade_spend");
   const groups:any={};
   detail.forEach(e=>{const k=String(e.promo_type||"Unclassified");const x=groups[k]||{group:k,events:0,incrementalSales:0,incrementalMargin:0,tradeSpend:0};x.events++;x.incrementalSales+=num(e.incrementalSales);x.incrementalMargin+=num(e.incrementalMargin);x.tradeSpend+=num(e.trade_spend);groups[k]=x});
   const byPromoType=Object.keys(groups).map(k=>{const x=groups[k];return {...x,roi:x.tradeSpend?x.incrementalMargin/x.tradeSpend:null}}).sort((a,b)=>b.incrementalSales-a.incrementalSales);
   return {available:true,eventDetailAvailable:true,detail,summary:{events:detail.length,incrementalSales:incSales,incrementalMargin:incMargin,tradeSpend:spend,roi:spend?incMargin/spend:null},byPromoType,provenance:provenance(events,"date_start"),evidence:{source:"cpgist_promotion_events",grain:"promotion event",rowCount:events.length}};
  }
  let q="cpgist_brand_weekly?select=brand_id,week_ending,incremental_sales,incremental_units,gross_margin,margin_percent,trade_spend,promo_events,is_actual,data_quality_status&order=week_ending.asc";
  if(p.brandId)q+="&brand_id=eq."+encodeURIComponent(p.brandId);
  const rows=await paged(q,token);
  const detail=rows.filter(r=>num(r.promo_events)>0).map(r=>({week:r.week_ending,incrementalSales:num(r.incremental_sales),incrementalUnits:num(r.incremental_units),incrementalMargin:r.margin_percent!=null?num(r.incremental_sales)*num(r.margin_percent):null,tradeSpend:r.trade_spend==null?null:num(r.trade_spend),isActual:actual(r)}));
  const incSales=sum(detail,"incrementalSales"),incMargin=sum(detail,"incrementalMargin"),spend=sum(detail,"tradeSpend");
  return {available:detail.length>0,eventDetailAvailable:false,detail,summary:{events:detail.length,incrementalSales:incSales,incrementalMargin:incMargin,tradeSpend:spend,roi:spend?incMargin/spend:null},byPromoType:[],provenance:provenance(rows),warnings:["Promotion-event detail is not populated; weekly aggregate fallback is shown."]};
 }
 if(type==="sku_growth"){
  let q="cpgist_product_weekly?select=product_id,brand_id,week_ending,sales,units,is_actual&order=week_ending.asc";
  if(p.brandId)q+="&brand_id=eq."+encodeURIComponent(p.brandId);
  const rows=await paged(q,token);
  if(!rows.length)return{available:false,products:[],warnings:["Product-weekly data is not populated. Re-import the extended dataset to enable SKU growth."]};
  const out:any[]=[];
  for(const status of [true,false]){
   const w=windows(rows,status);if(w.latest.length!==13||w.prior.length!==13)continue;
   const ls=new Set(w.latest),ps=new Set(w.prior),map:any={};
   rows.filter(r=>actual(r)===status).forEach(r=>{const id=String(r.product_id);const x=map[id]||{productId:r.product_id,latestSales:0,priorSales:0,latestUnits:0,priorUnits:0,isActual:status};if(ls.has(String(r.week_ending))){x.latestSales+=num(r.sales);x.latestUnits+=num(r.units)}else if(ps.has(String(r.week_ending))){x.priorSales+=num(r.sales);x.priorUnits+=num(r.units)}map[id]=x});
   Object.values(map).forEach((x:any)=>{x.salesGrowth=pct(x.latestSales,x.priorSales);x.unitGrowth=pct(x.latestUnits,x.priorUnits);out.push(x)});
  }
  const ids=out.map(x=>x.productId).join(",");
  const master=ids?await get("cpgist_products?select=id,name,sku,subcategory,size,launch_date&id=in.("+ids+")",token):[];
  const mm:any={};master.forEach(x=>mm[String(x.id)]=x);
  return{available:true,products:out.map(x=>({...x,...(mm[String(x.productId)]||{})})).sort((a,b)=>b.latestSales-a.latestSales),provenance:provenance(rows),evidence:{source:"cpgist_product_weekly",grain:"product-week",rowCount:rows.length}};
 }
 if(type==="category_context"){
  const category=String(p.category||p.categoryId||"");if(!category)throw new Error("category is required");
  let categoryRows:any[]=[];
  try{categoryRows=await paged("cpgist_category_aggregates?select=*&category=eq."+encodeURIComponent(category)+"&order=week.asc",token)}catch{}
  if(!categoryRows.length)categoryRows=await paged("cpgist_category_weekly?select=category,week_ending,sales,units,is_actual&category=eq."+encodeURIComponent(category)+"&order=week_ending.asc",token);
  let brandRows=await paged("cpgist_brand_weekly?select=brand_id,category,week_ending,sales,is_actual,data_quality_status&category=eq."+encodeURIComponent(category)+"&order=week_ending.asc",token);
  if(p.brandId)brandRows=brandRows.filter(r=>String(r.brand_id)===String(p.brandId));
  const status=brandRows.length?actual(brandRows[brandRows.length-1]):actual(categoryRows[categoryRows.length-1]);
  const c=categoryRows.map(r=>({...r,week_ending:r.week||r.week_ending,is_actual:typeof r.is_actual==="boolean"?r.is_actual:status}));
  const w=windows(c,status===false?false:true),ls=new Set(w.latest),ps=new Set(w.prior);
  const cr=c.filter(r=>ls.has(String(r.week_ending))),cp=c.filter(r=>ps.has(String(r.week_ending)));
  const br=brandRows.filter(r=>ls.has(String(r.week_ending))),bp=brandRows.filter(r=>ps.has(String(r.week_ending)));
  const cs=sum(cr,"total_category_sales")+sum(cr,"sales"),cps=sum(cp,"total_category_sales")+sum(cp,"sales"),bs=sum(br,"sales"),bps=sum(bp,"sales");
  const categorySales=cr.some(r=>r.total_category_sales!=null)?sum(cr,"total_category_sales"):sum(cr,"sales");
  const priorCategorySales=cp.some(r=>r.total_category_sales!=null)?sum(cp,"total_category_sales"):sum(cp,"sales");
  const share=categorySales?bs/categorySales*100:null,priorShare=priorCategorySales?bps/priorCategorySales*100:null;
  return{available:true,observedCategory:true,category,categorySales,categoryPriorSales:priorCategorySales,categoryGrowth:pct(categorySales,priorCategorySales),brandSales:bs,brandGrowth:pct(bs,bps),brandShare:share,priorBrandShare:priorShare,shareChangePts:share!=null&&priorShare!=null?share-priorShare:null,provenance:provenance(c),evidence:{source:categoryRows.length&&categoryRows[0].total_category_sales!=null?"cpgist_category_aggregates":"cpgist_category_weekly",grain:"category-week",rowCount:c.length},warnings:["Observed category coverage is bounded by tracked brands; it is not total-market category measurement."]};
 }
 if(type==="channel_breakdown"){
  let rows:any[]=await paged("cpgist_brand_retailer_weekly?select=brand_id,retailer_id,week_ending,sales,units,is_actual&order=week_ending.asc"+(p.brandId?"&brand_id=eq."+encodeURIComponent(p.brandId):""),token);
  if(!rows.length)return{available:false,channels:[],warnings:["Brand-retailer weekly data is not populated. Re-import the extended dataset to enable channel rollups."]};
  const ids=[...new Set(rows.map(r=>r.retailer_id))].join(",");
  const retailers=ids?await get("cpgist_retailers?select=id,channel&id=in.("+ids+")",token):[];const rm:any={};retailers.forEach(r=>rm[String(r.id)]=r.channel||"Unclassified");
  rows=rows.map(r=>({...r,channel:rm[String(r.retailer_id)]||"Unclassified"}));
  const out:any[]=[];
  for(const status of [true,false]){
   const w=windows(rows,status);if(!w.latest.length||!w.prior.length)continue;const ls=new Set(w.latest),ps=new Set(w.prior),map:any={};
   rows.filter(r=>actual(r)===status).forEach(r=>{const k=r.channel,x=map[k]||{channel:k,latestSales:0,priorSales:0,latestUnits:0,priorUnits:0,isActual:status};if(ls.has(String(r.week_ending))){x.latestSales+=num(r.sales);x.latestUnits+=num(r.units)}else if(ps.has(String(r.week_ending))){x.priorSales+=num(r.sales);x.priorUnits+=num(r.units)}map[k]=x});
   Object.values(map).forEach((x:any)=>{x.salesGrowth=pct(x.latestSales,x.priorSales);x.unitGrowth=pct(x.latestUnits,x.priorUnits);out.push(x)});
  }
  return{available:true,channels:out.sort((a,b)=>b.latestSales-a.latestSales),provenance:provenance(rows),evidence:{source:"cpgist_brand_retailer_weekly + cpgist_retailers",grain:"channel-week",rowCount:rows.length}};
 }
 if(type==="margin"){
  let q="cpgist_brand_weekly?select=brand_id,week_ending,sales,gross_margin,margin_percent,is_actual,data_quality_status&order=week_ending.asc";
  if(p.brandId)q+="&brand_id=eq."+encodeURIComponent(p.brandId);
  const rows=await paged(q,token),summary:any[]=[];
  for(const status of [true,false]){const w=windows(rows,status);if(!w.latest.length)continue;const ls=new Set(w.latest),ps=new Set(w.prior),cur=rows.filter(r=>actual(r)===status&&ls.has(String(r.week_ending))),prior=rows.filter(r=>actual(r)===status&&ps.has(String(r.week_ending))),sales=sum(cur,"sales"),margin=sum(cur,"gross_margin"),priorMargin=sum(prior,"gross_margin"),priorSales=sum(prior,"sales");summary.push({isActual:status,sales,margin,marginPercent:sales?margin/sales:null,marginGrowth:pct(margin,priorMargin),marginPercentChangePts:sales&&priorSales?((margin/sales)-(priorMargin/priorSales))*100:null})}
  return{available:rows.length>0,summary,marginAtRisk:[],provenance:provenance(rows),evidence:{source:"cpgist_brand_weekly",grain:"brand-week profitability",rowCount:rows.length},warnings:["SKU/retailer margin-at-risk requires populated product/retailer margin fields."]};
 }
 if(type==="launch"){
  let q="cpgist_products?select=id,name,sku,brand_id,launch_date&launch_date=not.is.null&limit=5000";
  if(p.brandId)q+="&brand_id=eq."+encodeURIComponent(p.brandId);
  const products=await get(q,token);if(!products.length)return{available:false,launches:[],warnings:["No non-null launch_date records are available."]};
  const skus=products.map(x=>x.sku).filter(Boolean),tr=skus.length?await get("cpgist_trial_repeat?select=*&sku=in.("+skus.map(x=>encodeURIComponent('"'+x+'"')).join(",")+")&order=week.asc",token):[];
  const launches=products.map(x=>{const rows=tr.filter(r=>String(r.sku)===String(x.sku));return{...x,weeks:rows,trialRate:rows.length?rows.reduce((s,r)=>s+num(r.trial_rate),0)/rows.length:null,repeatRate:rows.length?rows.reduce((s,r)=>s+num(r.repeat_rate),0)/rows.length:null}});
  return{available:true,launches,evidence:{source:"cpgist_products + cpgist_trial_repeat",grain:"SKU-week launch metrics",rowCount:tr.length}};
 }
 if(type==="panel"){
  const clauses=p.brand?"&brand=eq."+encodeURIComponent(p.brand):"";
  let rows:any[]=[];try{rows=await paged("cpgist_panel_weekly?select=*&order=week.asc"+clauses,token)}catch{}
  return{available:rows.length>0,rows,provenance:{status:"synthetic",syntheticPanel:true,label:"Synthetic panel (illustrative only, not real household data)",actualWeeks:0,syntheticWeeks:[...new Set(rows.map(r=>r.week))].length,totalWeeks:[...new Set(rows.map(r=>r.week))].length},evidence:{source:"cpgist_panel_weekly derived from panel_household_synthetic.csv",grain:"brand-week panel aggregate",rowCount:rows.length}};
 }
 if(type==="macro"){
  const rows=await paged("cpgist_macro_signals?select=*&order=week.asc"+(p.region?"&region=eq."+encodeURIComponent(p.region):""),token);
  return{available:rows.length>0,rows,provenance:{status:"synthetic",syntheticMacro:true,label:"Illustrative synthetic macro trend — not tied to real economic data"},evidence:{source:"cpgist_macro_signals",grain:"region-week",rowCount:rows.length}};
 }
 throw new Error("Unknown advanced analytics type.");
}
