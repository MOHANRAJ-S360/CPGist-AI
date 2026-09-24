type AnyRow=Record<string,any>;

const n=(v:any)=>Number(v??0)||0;
const pct=(a:number,b:number)=>b?((a/b)-1)*100:null;

async function read(path:string,token:string){
 const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!base||!key)throw new Error("Supabase environment is not configured.");
 const res=await fetch(base+"/rest/v1/"+path,{headers:{apikey:key,Authorization:"Bearer "+token},cache:"no-store"});
 if(!res.ok)throw new Error(await res.text());
 return await res.json();
}
function actual(row:AnyRow):boolean|null{
 if(typeof row.is_actual==="boolean")return row.is_actual;
 const status=String(row.data_quality_status||"").toLowerCase();
 if(status.includes("synthetic"))return false;
 if(status.includes("observ"))return true;
 return null;
}
function provenance(rows:AnyRow[],dateKey:string="week_ending"){
 const map:Record<string,boolean|null>={};
 rows.forEach(row=>{const date=String(row[dateKey]||"");if(date&&map[date]===undefined)map[date]=actual(row)});
 const dates=Object.keys(map);
 const actualCount=dates.filter(d=>map[d]===true).length;
 const syntheticCount=dates.filter(d=>map[d]===false).length;
 return {actualWeeks:actualCount,syntheticWeeks:syntheticCount,totalWeeks:dates.length,mixed:actualCount>0&&syntheticCount>0,status:syntheticCount?"mixed":"actual",label:syntheticCount?syntheticCount+" of "+dates.length+" weeks in this view are projected, not observed":null};
}
function periods(rows:AnyRow[],status:boolean){
 const p=Array.from(new Set(rows.filter(r=>actual(r)===status).map(r=>String(r.week_ending)).filter(Boolean))).sort();
 return {latest:p.slice(-13),prior:p.slice(-26,-13)};
}
function total(rows:AnyRow[],key:string){return rows.reduce((s,r)=>s+n(r[key]),0)}

export async function runAdvancedAnalytics(type:string,token:string,args:AnyRow){
 if(type==="promo_lift"){
  let rows:AnyRow[]=[];
  try{
   let q="cpgist_promotion_events?select=*&order=date_start.asc";
   if(args.brandId)q+="&brand_id=eq."+encodeURIComponent(args.brandId);
   rows=await read(q,token);
  }catch{}
  if(rows.length){
   let incSales=0,incMargin=0,tradeSpend=0;
   rows.forEach(r=>{incSales+=n(r.incremental_sales);incMargin+=n(r.incremental_margin);tradeSpend+=n(r.trade_spend)});
   return {available:true,eventDetailAvailable:true,detail:rows,summary:{events:rows.length,incrementalSales:incSales,incrementalMargin:incMargin,tradeSpend,roi:tradeSpend?incMargin/tradeSpend:null},byPromoType:[],provenance:provenance(rows,"date_start"),evidence:{source:"cpgist_promotion_events",grain:"promotion event",rowCount:rows.length}};
  }
  let q="cpgist_brand_weekly?select=brand_id,week_ending,incremental_sales,incremental_units,gross_margin,margin_percent,trade_spend,promo_events,is_actual,data_quality_status&order=week_ending.asc";
  if(args.brandId)q+="&brand_id=eq."+encodeURIComponent(args.brandId);
  rows=await read(q,token);
  const detail=rows.filter(r=>n(r.promo_events)>0).map(r=>({week:r.week_ending,incrementalSales:n(r.incremental_sales),incrementalUnits:n(r.incremental_units),incrementalMargin:r.margin_percent==null?null:n(r.incremental_sales)*n(r.margin_percent),tradeSpend:r.trade_spend==null?null:n(r.trade_spend),isActual:actual(r)}));
  const incSales=total(detail,"incrementalSales"),incMargin=total(detail,"incrementalMargin"),spend=total(detail,"tradeSpend");
  return {available:detail.length>0,eventDetailAvailable:false,detail,summary:{events:detail.length,incrementalSales:incSales,incrementalMargin:incMargin,tradeSpend:spend,roi:spend?incMargin/spend:null},byPromoType:[],provenance:provenance(rows),warnings:["Promotion-event detail is not populated; weekly aggregate fallback is shown."]};
 }
 if(type==="sku_growth"){
  let q="cpgist_product_weekly?select=product_id,brand_id,week_ending,sales,units,is_actual&order=week_ending.asc";
  if(args.brandId)q+="&brand_id=eq."+encodeURIComponent(args.brandId);
  const rows:AnyRow[]=await read(q,token);
  if(!rows.length)return {available:false,products:[],provenance:provenance(rows),warnings:["Product-weekly data is not populated."]};
  const output:any[]=[];
  [true,false].forEach(status=>{
   const w=periods(rows,status);
   if(w.latest.length!==13||w.prior.length!==13)return;
   const latest=new Set(w.latest),prior=new Set(w.prior),by:Record<string,any>={};
   rows.filter(r=>actual(r)===status).forEach(r=>{const id=String(r.product_id);if(!by[id])by[id]={productId:r.product_id,latestSales:0,priorSales:0,latestUnits:0,priorUnits:0,isActual:status};if(latest.has(String(r.week_ending))){by[id].latestSales+=n(r.sales);by[id].latestUnits+=n(r.units)}if(prior.has(String(r.week_ending))){by[id].priorSales+=n(r.sales);by[id].priorUnits+=n(r.units)}});
   Object.keys(by).forEach(id=>{const x=by[id];x.salesGrowth=pct(x.latestSales,x.priorSales);x.unitGrowth=pct(x.latestUnits,x.priorUnits);output.push(x)});
  });
  return {available:true,products:output.sort((a,b)=>b.latestSales-a.latestSales),provenance:provenance(rows),evidence:{source:"cpgist_product_weekly",grain:"product-week",rowCount:rows.length}};
 }
 if(type==="category_context"){
  const category=String(args.category||args.categoryId||"");if(!category)throw new Error("category is required");
  let categoryRows:AnyRow[]=[];
  try{categoryRows=await read("cpgist_category_aggregates?select=*&category=eq."+encodeURIComponent(category)+"&order=week.asc",token)}catch{}
  if(!categoryRows.length)categoryRows=await read("cpgist_category_weekly?select=category,week_ending,sales,units,is_actual&category=eq."+encodeURIComponent(category)+"&order=week_ending.asc",token);
  let brandQ="cpgist_brand_weekly?select=brand_id,category,week_ending,sales,is_actual,data_quality_status&category=eq."+encodeURIComponent(category)+"&order=week_ending.asc";
  if(args.brandId)brandQ+="&brand_id=eq."+encodeURIComponent(args.brandId);
  const brandRows:AnyRow[]=await read(brandQ,token);
  const status=brandRows.length?actual(brandRows[brandRows.length-1]):true;
  const categoryRows2=categoryRows.map(r=>({...r,week_ending:r.week||r.week_ending,is_actual:typeof r.is_actual==="boolean"?r.is_actual:status}));
  const w=periods(categoryRows2,status),latest=new Set(w.latest),prior=new Set(w.prior);
  const currentCategory=categoryRows2.filter(r=>latest.has(String(r.week_ending))),previousCategory=categoryRows2.filter(r=>prior.has(String(r.week_ending)));
  const currentBrand=brandRows.filter(r=>latest.has(String(r.week_ending))),previousBrand=brandRows.filter(r=>prior.has(String(r.week_ending)));
  const catSales=currentCategory.reduce((s,r)=>s+n(r.total_category_sales!=null?r.total_category_sales:r.sales),0);
  const catPrior=previousCategory.reduce((s,r)=>s+n(r.total_category_sales!=null?r.total_category_sales:r.sales),0);
  const brandSales=total(currentBrand,"sales"),brandPrior=total(previousBrand,"sales");
  const share=catSales?brandSales/catSales*100:null,priorShare=catPrior?brandPrior/catPrior*100:null;
  return {available:true,category,observedCategory:true,categorySales:catSales,categoryPriorSales:catPrior,categoryGrowth:pct(catSales,catPrior),brandSales,brandGrowth:pct(brandSales,brandPrior),brandShare:share,priorBrandShare:priorShare,shareChangePts:share!=null&&priorShare!=null?share-priorShare:null,provenance:provenance(categoryRows2),warnings:["Observed category coverage is bounded by tracked brands; it is not total-market category measurement."],evidence:{source:categoryRows.length&&categoryRows[0].total_category_sales!=null?"cpgist_category_aggregates":"cpgist_category_weekly",grain:"category-week",rowCount:categoryRows2.length}};
 }
 if(type==="channel_breakdown"){
  let q="cpgist_brand_retailer_weekly?select=brand_id,retailer_id,week_ending,sales,units,is_actual&order=week_ending.asc";
  if(args.brandId)q+="&brand_id=eq."+encodeURIComponent(args.brandId);
  const rows:AnyRow[]=await read(q,token);
  if(!rows.length)return{available:false,channels:[],provenance:provenance(rows),warnings:["Brand-retailer weekly data is not populated."]};
  const ids=Array.from(new Set(rows.map(r=>String(r.retailer_id)))).join(",");
  const retailers=ids?await read("cpgist_retailers?select=id,channel&id=in.("+ids+")",token):[];
  const channelById:Record<string,string>={};retailers.forEach((r:any)=>channelById[String(r.id)]=r.channel||"Unclassified");
  const enriched=rows.map(r=>({...r,channel:channelById[String(r.retailer_id)]||"Unclassified"})),out:any[]=[];
  [true,false].forEach(status=>{
   const w=periods(enriched,status);if(!w.latest.length||!w.prior.length)return;
   const latest=new Set(w.latest),prior=new Set(w.prior),by:Record<string,any>={};
   enriched.filter(r=>actual(r)===status).forEach(r=>{const key=r.channel;if(!by[key])by[key]={channel:key,latestSales:0,priorSales:0,latestUnits:0,priorUnits:0,isActual:status};if(latest.has(String(r.week_ending))){by[key].latestSales+=n(r.sales);by[key].latestUnits+=n(r.units)}if(prior.has(String(r.week_ending))){by[key].priorSales+=n(r.sales);by[key].priorUnits+=n(r.units)}});
   Object.keys(by).forEach(k=>{const x=by[k];x.salesGrowth=pct(x.latestSales,x.priorSales);x.unitGrowth=pct(x.latestUnits,x.priorUnits);out.push(x)});
  });
  return{available:true,channels:out.sort((a,b)=>b.latestSales-a.latestSales),provenance:provenance(enriched),evidence:{source:"cpgist_brand_retailer_weekly + cpgist_retailers",grain:"channel-week",rowCount:rows.length}};
 }
 if(type==="margin"){
  let q="cpgist_brand_weekly?select=brand_id,week_ending,sales,gross_margin,margin_percent,is_actual,data_quality_status&order=week_ending.asc";
  if(args.brandId)q+="&brand_id=eq."+encodeURIComponent(args.brandId);
  const rows:AnyRow[]=await read(q,token),summary:any[]=[];
  [true,false].forEach(status=>{const w=periods(rows,status);if(!w.latest.length)return;const latest=new Set(w.latest),prior=new Set(w.prior),cur=rows.filter(r=>actual(r)===status&&latest.has(String(r.week_ending))),old=rows.filter(r=>actual(r)===status&&prior.has(String(r.week_ending)));const sales=total(cur,"sales"),margin=total(cur,"gross_margin"),oldSales=total(old,"sales"),oldMargin=total(old,"gross_margin");summary.push({isActual:status,sales,margin,marginPercent:sales?margin/sales:null,marginGrowth:pct(margin,oldMargin),marginPercentChangePts:sales&&oldSales?((margin/sales)-(oldMargin/oldSales))*100:null})});
  return{available:rows.length>0,summary,marginAtRisk:[],provenance:provenance(rows),evidence:{source:"cpgist_brand_weekly",grain:"brand-week profitability",rowCount:rows.length},warnings:["SKU/retailer margin-at-risk requires populated product/retailer margin fields."]};
 }
 if(type==="launch"){
  let q="cpgist_products?select=id,name,sku,brand_id,launch_date&launch_date=not.is.null&limit=5000";
  if(args.brandId)q+="&brand_id=eq."+encodeURIComponent(args.brandId);
  const products=await read(q,token);
  if(!products.length)return{available:false,launches:[],warnings:["No products with a non-null launch_date are available."]};
  return{available:true,launches:products,evidence:{source:"cpgist_products + cpgist_trial_repeat",grain:"SKU launch master",rowCount:products.length},warnings:["Trial/repeat detail is populated after the extended trial_repeat file is imported."]};
 }
 if(type==="panel"){
  const q="cpgist_panel_weekly?select=*&order=week.asc"+(args.brand?"&brand=eq."+encodeURIComponent(args.brand):"");
  let rows:any[]=[];try{rows=await read(q,token)}catch{}
  return{available:rows.length>0,rows,provenance:{status:"synthetic",syntheticPanel:true,label:"Synthetic panel (illustrative only, not real household data)",actualWeeks:0,syntheticWeeks:Array.from(new Set(rows.map(r=>String(r.week)))).length,totalWeeks:Array.from(new Set(rows.map(r=>String(r.week)))).length},evidence:{source:"cpgist_panel_weekly derived from panel_household_synthetic.csv",grain:"brand-week panel aggregate",rowCount:rows.length}};
 }
 if(type==="macro"){
  const q="cpgist_macro_signals?select=*&order=week.asc"+(args.region?"&region=eq."+encodeURIComponent(args.region):"");
  const rows=await read(q,token);
  return{available:rows.length>0,rows,provenance:{status:"synthetic",syntheticMacro:true,label:"Illustrative synthetic macro trend — not tied to real economic data"},evidence:{source:"cpgist_macro_signals",grain:"region-week",rowCount:rows.length}};
 }
 throw new Error("Unknown advanced analytics type.");
}
