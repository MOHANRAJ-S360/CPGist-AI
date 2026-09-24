import {NextResponse} from "next/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";

async function get(path:string,token:string){
 const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!u||!k)throw new Error("Supabase environment is not configured.");
 if(!token)throw new Error("Your session has expired. Please sign in again.");
 const r=await fetch(u+"/rest/v1/"+path,{headers:{apikey:k,Authorization:"Bearer "+token},cache:"no-store"});
 if(!r.ok)throw new Error(await r.text());
 return r.json();
}
async function getPaged(path:string,token:string,pageSize=1000,maxPages=100){
 const out:any[]=[];
 for(let p=0;p<maxPages;p++){
  const join=path.includes("?")?"&":"?";
  const rows=await get(path+join+"limit="+pageSize+"&offset="+(p*pageSize),token);
  out.push(...rows);
  if(rows.length<pageSize)break;
 }
 return out;
}
const n=(v:any)=>Number(v??0)||0;
const growth=(a:number,b:number)=>b?((a/b)-1)*100:null;
const avg=(a:number[])=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;

function actualFlag(r:any):boolean|null{
 if(typeof r.is_actual==="boolean")return r.is_actual;
 if(typeof r.data_quality_status==="string"){
  if(r.data_quality_status.toLowerCase().includes("synthetic"))return false;
  if(r.data_quality_status.toLowerCase().includes("observ"))return true;
 }
 return null;
}
function provenance(rows:any[],periodKey="week_ending"){
 const by=new Map<string,boolean|null>();
 for(const r of rows){const p=String(r[periodKey]||"");if(p&&!by.has(p))by.set(p,actualFlag(r));}
 const actual=[...by.entries()].filter(([,v])=>v===true).map(([p])=>p).sort();
 const synthetic=[...by.entries()].filter(([,v])=>v===false).map(([p])=>p).sort();
 const unknown=[...by.entries()].filter(([,v])=>v==null).map(([p])=>p).sort();
 const total=actual.length+synthetic.length+unknown.length;
 return {
  actualWeeks:actual.length,syntheticWeeks:synthetic.length,unknownWeeks:unknown.length,totalWeeks:total,
  mixed:actual.length>0&&synthetic.length>0,
  actualStart:actual[0]||null,actualEnd:actual.at(-1)||null,
  syntheticStart:synthetic[0]||null,syntheticEnd:synthetic.at(-1)||null,
  label:synthetic.length?(`${synthetic.length} of ${total} weeks in this view are projected, not observed`):null,
  status:unknown.length?"unknown":synthetic.length?"mixed":"actual"
 };
}
function statusWindows(rows:any[],status:true|false){
 const periods=[...new Set(rows.filter(r=>actualFlag(r)===status).map(r=>String(r.week_ending)).filter(Boolean))].sort();
 return {latest:periods.slice(-13),prior:periods.slice(-26,-13)};
}
function periodSet(rows:any[],status:true|false){
 const w=statusWindows(rows,status);
 return {latestSet:new Set(w.latest),priorSet:new Set(w.prior),...w};
}
function pctShare(v:number,total:number){return total?v/total*100:null;}

async function promoLift(token:string,p:any){
 const clauses:string[]=[];
 if(p.brandId)clauses.push("brand_id=eq."+encodeURIComponent(p.brandId));
 if(p.retailerId)clauses.push("retailer_id=eq."+encodeURIComponent(p.retailerId));
 if(p.sku)clauses.push("product_id=eq."+encodeURIComponent(p.sku));
 if(p.startDate)clauses.push("date_start=gte."+encodeURIComponent(p.startDate));
 if(p.endDate)clauses.push("date_end=lte."+encodeURIComponent(p.endDate));
 let events:any[]=[];
 try{events=await getPaged("cpgist_promotion_events?select=*&order=date_start.asc"+(clauses.length?"&"+clauses.join("&"):""),token,1000,50)}catch{}
 if(events.length){
  const detail=events.map(e=>{
   const incUnits=e.incremental_units!=null?n(e.incremental_units):n(e.promo_units)-n(e.baseline_units);
   const incSales=e.incremental_sales!=null?n(e.incremental_sales):n(e.incremental_units)*n(e.promo_price);
   const marginPct=e.margin_percent!=null?n(e.margin_percent):null;
   const incMargin=e.incremental_margin!=null?n(e.incremental_margin):(marginPct==null?null:incSales*marginPct);
   const spend=e.trade_spend==null?null:n(e.trade_spend);
   return {...e,incrementalUnits:incUnits,incrementalSales:incSales,incrementalMargin:incMargin,roi:spend!=null&&spend>0&&incMargin!=null?incMargin/spend:null};
  });
  const valid=detail.filter(e=>e.roi!=null);
  const totalIncSales=detail.reduce((s,e)=>s+n(e.incrementalSales),0);
  const totalIncMargin=detail.reduce((s,e)=>s+(e.incrementalMargin==null?0:n(e.incrementalMargin)),0);
  const totalSpend=detail.reduce((s,e)=>s+(e.trade_spend==null?0:n(e.trade_spend)),0);
  const summaryBy=(key:string)=>Object.values(detail.reduce((m:any,e:any)=>{const k=String(e[key]||"Unclassified");const x=m[k]||{group:k,events:0,incrementalSales:0,incrementalMargin:0,tradeSpend:0};x.events++;x.incrementalSales+=n(e.incrementalSales);x.incrementalMargin+=n(e.incrementalMargin);x.tradeSpend+=n(e.trade_spend);m[k]=x;return m},{})).map((x:any)=>({...x,roi:x.tradeSpend>0?x.incrementalMargin/x.tradeSpend:null})).sort((a:any,b:any)=>n(b.incrementalSales)-n(a.incrementalSales));
  const prov=provenance(events,"date_start");
  return {available:true,detail,summary:{events:detail.length,incrementalSales:totalIncSales,incrementalMargin:totalIncMargin,tradeSpend:totalSpend,roi:totalSpend>0?totalIncMargin/totalSpend:null},byPromoType:summaryBy("promo_type"),byRetailer:summaryBy("retailer_id"),provenance:prov,evidence:{source:"cpgist_promotion_events",grain:"promotion event",rowCount:events.length}};
 }
 const clauses2:string[]=[];
 if(p.brandId)clauses2.push("brand_id=eq."+encodeURIComponent(p.brandId));
 if(p.startDate)clauses2.push("week_ending=gte."+encodeURIComponent(p.startDate));
 if(p.endDate)clauses2.push("week_ending=lte."+encodeURIComponent(p.endDate));
 const rows=await getPaged("cpgist_brand_weekly?select=brand_id,week_ending,sales,baseline_sales,incremental_sales,incremental_units,gross_margin,margin_percent,trade_spend,promo_events,promo_rate,is_actual,data_quality_status&order=week_ending.asc"+(clauses2.length?"&"+clauses2.join("&"):""),token);
 const detail=rows.filter((r:any)=>n(r.promo_events)>0).map((r:any)=>{const spend=r.trade_spend==null?null:n(r.trade_spend);const incMargin=r.gross_margin==null?null:n(r.incremental_sales)*n(r.margin_percent);return{week:String(r.week_ending),incrementalSales:n(r.incremental_sales),incrementalUnits:n(r.incremental_units),incrementalMargin:incMargin,tradeSpend:spend,roi:spend!=null&&spend>0&&incMargin!=null?incMargin/spend:null,isActual:actualFlag(r)}}); 
 const incSales=detail.reduce((s,e)=>s+e.incrementalSales,0),incMargin=detail.reduce((s,e)=>s+(e.incrementalMargin||0),0),spend=detail.reduce((s,e)=>s+(e.tradeSpend||0),0);
 return {available:detail.length>0,eventDetailAvailable:false,detail,summary:{events:detail.length,incrementalSales:incSales,incrementalMargin:incMargin,tradeSpend:spend,roi:spend>0?incMargin/spend:null},byPromoType:[],byRetailer:[],provenance:provenance(rows),evidence:{source:"cpgist_brand_weekly",grain:"brand-week aggregate",rowCount:rows.length},warnings:["Promotion event-level detail is not populated; this view is a weekly aggregate fallback. Re-import the extended dataset to expose promotion-event detail."]};
}

async function skuGrowth(token:string,p:any){
 const clauses:string[]=[];
 if(p.brandId)clauses.push("brand_id=eq."+encodeURIComponent(p.brandId));
 if(p.startDate)clauses.push("week_ending=gte."+encodeURIComponent(p.startDate));
 if(p.endDate)clauses.push("week_ending=lte."+encodeURIComponent(p.endDate));
 const rows=await getPaged("cpgist_product_weekly?select=product_id,brand_id,week_ending,sales,units,distribution,is_actual&order=week_ending.asc"+(clauses.length?"&"+clauses.join("&"):""),token);
 if(!rows.length)return{available:false,products:[],provenance:provenance(rows),warnings:["Product-weekly data is not populated. Re-import the extended dataset to calculate SKU growth."]};
 const statusResults:any[]=[];
 for(const status of [true,false] as const){
  const {latestSet,priorSet,latest,prior}=periodSet(rows,status);
  if(latest.length!==13||prior.length!==13)continue;
  const by=new Map<number,any>();
  for(const r of rows.filter((x:any)=>actualFlag(x)===status)){
   const id=n(r.product_id);const x=by.get(id)||{productId:id,latestSales:0,priorSales:0,latestUnits:0,priorUnits:0};
   if(latestSet.has(String(r.week_ending))){x.latestSales+=n(r.sales);x.latestUnits+=n(r.units)}
   else if(priorSet.has(String(r.week_ending))){x.priorSales+=n(r.sales);x.priorUnits+=n(r.units)}
   by.set(id,x);
  }
  statusResults.push(...[...by.values()].filter(x=>x.latestSales||x.priorSales).map(x=>({...x,isActual:status,salesGrowth:growth(x.latestSales,x.priorSales),unitGrowth:growth(x.latestUnits,x.priorUnits)})));
 }
 const ids=[...new Set(statusResults.map(x=>x.productId))].join(",");
 const master=ids?await get("cpgist_products?select=id,name,sku,subcategory,size,launch_date&id=in."+encodeURIComponent("("+ids+")"),token):[];
 const mm=Object.fromEntries(master.map((x:any)=>[String(x.id),x]));
 return {available:true,products:statusResults.sort((a,b)=>n(b.latestSales)-n(a.latestSales)).map(x=>({...x,...(mm[String(x.productId)]||{})})),provenance:provenance(rows),evidence:{source:"cpgist_product_weekly",grain:"product-week",rowCount:rows.length}};
}

async function categoryContext(token:string,p:any){
 const category=String(p.category||p.categoryId||"").trim();
 if(!category)return{available:false,warnings:["category is required"]};
 let aggRows:any[]=[];
 try{aggRows=await getPaged("cpgist_category_aggregates?select=*&category=eq."+encodeURIComponent(category)+"&order=week.asc",token)}catch{}
 const categoryRows=aggRows.length?aggRows:await getPaged("cpgist_category_weekly?select=category,week_ending,sales,units,distribution&category=eq."+encodeURIComponent(category)+"&order=week_ending.asc",token);
 const brandRows=await getPaged("cpgist_brand_weekly?select=brand_id,category,week_ending,sales,units,is_actual,data_quality_status&category=eq."+encodeURIComponent(category)+"&order=week_ending.asc",token);
 const brandId=p.brandId?String(p.brandId):"";
 const brandScoped=brandId?brandRows.filter(r=>String(r.brand_id)===brandId):[];
 const status=brandScoped.length?actualFlag(brandScoped.at(-1)):actualFlag(categoryRows.at(-1));
 const cRows=categoryRows.map(r=>({...r,week_ending:r.week||r.week_ending,is_actual:typeof r.is_actual==="boolean"?r.is_actual:status}));
 const {latestSet,priorSet,latest,prior}=periodSet(cRows,status===false?false:true);
 const cLatest=cRows.filter(r=>latestSet.has(String(r.week_ending))),cPrior=cRows.filter(r=>priorSet.has(String(r.week_ending)));
 const catSales=cLatest.reduce((s,r)=>s+n(r.total_category_sales??r.sales),0),catPrior=cPrior.reduce((s,r)=>s+n(r.total_category_sales??r.sales),0);
 const bLatest=brandScoped.filter(r=>latestSet.has(String(r.week_ending))),bPrior=brandScoped.filter(r=>priorSet.has(String(r.week_ending)));
 const brandSales=bLatest.reduce((s,r)=>s+n(r.sales),0),brandPrior=bPrior.reduce((s,r)=>s+n(r.sales),0);
 const p=growth(brandSales,brandPrior),cg=growth(catSales,catPrior);
 return {available:true,category,observedCategory:true,categorySales:catSales,categoryPriorSales:catPrior,categoryGrowth:cg,brandSales,brandGrowth:p,brandShare:pctShare(brandSales,catSales),priorBrandShare:pctShare(brandPrior,catPrior),shareChangePts:pctShare(brandSales,catSales)!=null&&pctShare(brandPrior,catPrior)!=null?pctShare(brandSales,catSales)-pctShare(brandPrior,catPrior):null,provenance:provenance([...cRows,...brandScoped]),evidence:{source:aggRows.length?"cpgist_category_aggregates":"cpgist_category_weekly",grain:"category-week",rowCount:cRows.length},warnings:["Category context is observed category coverage bounded by tracked brands in the connected category dataset; it is not a claim about total market category sales."]};
}

async function channelBreakdown(token:string,p:any){
 const brandId=p.brandId?String(p.brandId):"";
 let rows:any[]=[];
 try{
  const q="cpgist_brand_retailer_weekly?select=brand_id,retailer_id,week_ending,sales,units,distribution,is_actual&order=week_ending.asc"+(brandId?"&brand_id=eq."+encodeURIComponent(brandId):"");
  rows=await getPaged(q,token);
 }catch{}
 if(!rows.length)return{available:false,channels:[],warnings:["Brand-retailer weekly data is not populated. Re-import the extended dataset to enable channel rollups."]};
 const ids=[...new Set(rows.map(r=>r.retailer_id).filter(Boolean))].join(",");
 const retailers=ids?await getPaged("cpgist_retailers?select=id,name,channel,region,retailer_group&id=in."+encodeURIComponent("("+ids+")"),token):[];
 const rm=Object.fromEntries(retailers.map((r:any)=>[String(r.id),r]));
 const enriched=rows.map(r=>({...r,channel:rm[String(r.retailer_id)]?.channel||"Unclassified"}));
 const prov=provenance(enriched), out:any[]=[];
 for(const status of [true,false] as const){
  const {latestSet,priorSet,latest,prior}=periodSet(enriched,status);
  if(!latest.length||!prior.length)continue;
  const map=new Map<string,any>();
  for(const r of enriched.filter(x=>actualFlag(x)===status)){const k=String(r.channel);const x=map.get(k)||{channel:k,latestSales:0,priorSales:0,latestUnits:0,priorUnits:0};if(latestSet.has(String(r.week_ending))){x.latestSales+=n(r.sales);x.latestUnits+=n(r.units)}else if(priorSet.has(String(r.week_ending))){x.priorSales+=n(r.sales);x.priorUnits+=n(r.units)}map.set(k,x)}
  out.push(...[...map.values()].map(x=>({...x,isActual:status,salesGrowth:growth(x.latestSales,x.priorSales),unitGrowth:growth(x.latestUnits,x.priorUnits)})));
 }
 return{available:true,channels:out.sort((a,b)=>n(b.latestSales)-n(a.latestSales)),provenance:prov,evidence:{source:"cpgist_brand_retailer_weekly + cpgist_retailers",grain:"channel-week",rowCount:rows.length}};
}

async function marginReport(token:string,p:any){
 const brandId=p.brandId?String(p.brandId):"";
 const clauses=brandId?"&brand_id=eq."+encodeURIComponent(brandId):"";
 const rows=await getPaged("cpgist_brand_weekly?select=brand_id,week_ending,sales,units,unit_cost,gross_margin,margin_percent,is_actual,data_quality_status&order=week_ending.asc"+clauses,token);
 const prov=provenance(rows);
 const latestByStatus:any[]=[];
 for(const status of [true,false] as const){
  const {latestSet,priorSet}=periodSet(rows,status);
  if(!latestSet.size)continue;
  const latest=rows.filter(r=>actualFlag(r)===status&&latestSet.has(String(r.week_ending)));
  const prior=rows.filter(r=>actualFlag(r)===status&&priorSet.has(String(r.week_ending)));
  const sales=latest.reduce((s,r)=>s+n(r.sales),0),margin=latest.reduce((s,r)=>s+n(r.gross_margin),0),priorMargin=prior.reduce((s,r)=>s+n(r.gross_margin),0);
  const marginPct=sales?margin/sales:null,priorPct=(prior.reduce((s,r)=>s+n(r.sales),0))?priorMargin/prior.reduce((s,r)=>s+n(r.sales),0):null;
  latestByStatus.push({isActual:status,sales,margin,marginPercent:marginPct,priorMargin,priorMarginPercent:priorPct,marginGrowth:growth(margin,priorMargin),marginPercentChangePts:marginPct!=null&&priorPct!=null?(marginPct-priorPct)*100:null});
 }
 const riskRows=latestByStatus.length?latestByStatus:[];
 return{available:rows.length>0,summary:riskRows,marginAtRisk:[],provenance:prov,evidence:{source:"cpgist_brand_weekly",grain:"brand-week profitability",rowCount:rows.length},warnings:["Margin-at-risk by SKU/retailer is exposed when product/retailer weekly margin fields are populated."]};
}

async function launchPerformance(token:string,p:any){
 const sku=p.sku?String(p.sku):"";
 const brandId=p.brandId?String(p.brandId):"";
 const prodQ="cpgist_products?select=id,name,sku,brand_id,launch_date"+(sku?"&sku=eq."+encodeURIComponent(sku):"")+(brandId?"&brand_id=eq."+encodeURIComponent(brandId):"")+"&launch_date=not.is.null&limit=5000";
 const products=await get(prodQ,token);
 if(!products.length)return{available:false,launches:[],warnings:["No products with a non-null launch_date are available for the requested scope."]};
 const skus=products.map((x:any)=>String(x.sku||"")).filter(Boolean);
 const tr=skus.length?await getPaged("cpgist_trial_repeat?select=*&sku=in."+encodeURIComponent("("+skus.map((x:string)=>'"'+x+'"').join(",")+")")+"&order=week.asc",token):[];
 const launches=products.map((p:any)=>{const rows=tr.filter((x:any)=>String(x.sku)===String(p.sku));return{...p,weeks:rows,cumulativeSales:null,trialRate:avg(rows.map((x:any)=>n(x.trial_rate))),repeatRate:avg(rows.map((x:any)=>n(x.repeat_rate))),provenance:provenance(rows,"week")}}); 
 return{available:true,launches,evidence:{source:"cpgist_products + cpgist_trial_repeat",grain:"SKU-week launch metrics",rowCount:tr.length}};
}

async function panelReport(token:string,p:any){
 const clauses:string[]=[];
 if(p.brand)clauses.push("brand=eq."+encodeURIComponent(p.brand));
 if(p.region)clauses.push("region=eq."+encodeURIComponent(p.region));
 const rows=await getPaged("cpgist_panel_household?select=*&order=week.asc"+(clauses.length?"&"+clauses.join("&"):""),token);
 if(!rows.length)return{available:false,rows:[],warnings:["Synthetic panel data is not populated."]};
 const weeks=[...new Set(rows.map(r=>String(r.week)))].sort();
 const agg=weeks.map(w=>{const x=rows.filter(r=>String(r.week)===w),hh=new Set(x.map(r=>String(r.household_id)));const brands=new Set(x.map(r=>String(r.brand)));const units=x.reduce((s,r)=>s+n(r.units),0);return{week:w,households:hh.size,brands:brands.size,units,penetrationPct:hh.size?brands.size/hh.size*100:null,frequency:hh.size?units/hh.size:null}}); 
 return{available:true,rows:agg,provenance:{...provenance(rows,"week"),syntheticPanel:true,label:"Synthetic panel (illustrative only, not real household data)"},evidence:{source:"cpgist_panel_household",grain:"household-week",rowCount:rows.length}};
}

async function macroOverlay(token:string,p:any){
 const clauses:string[]=[];
 if(p.region)clauses.push("region=eq."+encodeURIComponent(p.region));
 const rows=await getPaged("cpgist_macro_signals?select=*&order=week.asc"+(clauses.length?"&"+clauses.join("&"):""),token);
 return{available:rows.length>0,rows,provenance:{status:"synthetic",syntheticMacro:true,label:"Illustrative synthetic macro trend — not tied to real economic data"},evidence:{source:"cpgist_macro_signals",grain:"region-week",rowCount:rows.length}};
}

export async function GET(req:Request){
 try{
  const auth=req.headers.get("authorization")||"";
  const token=auth.replace(/^Bearer\s+/i,"");
  const u=new URL(req.url),p:any=Object.fromEntries(u.searchParams.entries()),type=String(p.type||"");
  let result:any;
  if(type==="promo_lift")result=await promoLift(token,p);
  else if(type==="sku_growth")result=await skuGrowth(token,p);
  else if(type==="category_context")result=await categoryContext(token,p);
  else if(type==="channel_breakdown")result=await channelBreakdown(token,p);
  else if(type==="margin")result=await marginReport(token,p);
  else if(type==="launch")result=await launchPerformance(token,p);
  else if(type==="panel")result=await panelReport(token,p);
  else if(type==="macro")result=await macroOverlay(token,p);
  else return NextResponse.json({error:"Unknown advanced analytics type."},{status:400});
  return NextResponse.json(result);
 }catch(e:any){return NextResponse.json({error:e?.message||"Advanced analytics failed."},{status:500});}
}
