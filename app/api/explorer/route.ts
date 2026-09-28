import {NextRequest,NextResponse} from "next/server";

const base=()=>({u:process.env.NEXT_PUBLIC_SUPABASE_URL,k:process.env.SUPABASE_SERVICE_ROLE_KEY});
async function get(path:string){
 const {u,k}=base();if(!u||!k)throw new Error("Supabase server environment is not configured.");
 const r=await fetch(u+"/rest/v1/"+path,{headers:{apikey:k,Authorization:"Bearer "+k},cache:"no-store"});
 if(!r.ok)throw new Error(await r.text());return r.json();
}
const n=(v:any)=>Number(v??0)||0;
const pct=(a:number,b:number)=>b?((a-b)/b)*100:0;
const enc=(v:any)=>encodeURIComponent(String(v??""));
const has=(v:any,q:string)=>!q||String(v??"").toLowerCase().includes(q.toLowerCase());

async function brandDetail(id:string,brand:any){
 const rows:any[]=await get("cpgist_brand_weekly?brand_id=eq."+enc(id)+"&select=brand_id,category,week_ending,sales,units,distribution,avg_price,promo_rate,baseline_sales,incremental_sales,incremental_units,gross_margin,margin_percent,trade_spend,promo_events,is_actual,data_quality_status&order=week_ending.asc&limit=100000");
 const periods=[...new Set(rows.map(r=>String(r.week_ending)).filter(Boolean))].sort();
 const latest=periods.slice(-13),prior=periods.slice(-26,-13),ls=new Set(latest),ps=new Set(prior);
 const agg=(rs:any[])=>{const sales=rs.reduce((a,r)=>a+n(r.sales),0),units=rs.reduce((a,r)=>a+n(r.units),0);return{sales,units,distribution:rs.length?rs.reduce((a,r)=>a+n(r.distribution),0)/rs.length:null,price:units?sales/units:null,promoRate:rs.length?rs.reduce((a,r)=>a+n(r.promo_rate),0)/rs.length:null}};
 const a=agg(rows.filter(r=>ls.has(String(r.week_ending)))),b=agg(rows.filter(r=>ps.has(String(r.week_ending))));
 let categorySales=0,categoryPriorSales=0;
 let categoryGrowth:number|null=null;
 let categoryWeekly:any[]=[];
 if(brand.category){try{
  const cr:any[]=await get("cpgist_category_weekly?category=eq."+enc(brand.category)+"&select=week_ending,sales,units&order=week_ending.asc&limit=5000");
  categoryWeekly=cr.map(r=>({period:String(r.week_ending),sales:n(r.sales),units:n(r.units)}));
  categorySales=cr.filter(r=>ls.has(String(r.week_ending))).reduce((s,r)=>s+n(r.sales),0);
  categoryPriorSales=cr.filter(r=>ps.has(String(r.week_ending))).reduce((s,r)=>s+n(r.sales),0);
  categoryGrowth=categoryPriorSales?pct(categorySales,categoryPriorSales):null;
 }catch{}}
 const weekly=periods.map(w=>{const rr=rows.filter(r=>String(r.week_ending)===w);return{period:w,sales:rr.reduce((s,r)=>s+n(r.sales),0),units:rr.reduce((s,r)=>s+n(r.units),0),promoRate:rr.length?rr.reduce((s,r)=>s+n(r.promo_rate),0)/rr.length:null,is_actual:rr.length&&rr.every(r=>r.is_actual===true)?true:(rr.some(r=>r.is_actual===false)?false:null)}});
 let products:any[]=[];
 try{
  const p:any[]=await get("cpgist_products?brand_id=eq."+enc(id)+"&select=id,brand_id,name,sku,category,subcategory,size,pack_count&order=name&limit=5000");
  const psum:any[]=await get("cpgist_product_summary?brand_id=eq."+enc(id)+"&select=product_id,sales_13w,units_13w,avg_price_13w,distribution_13w,promo_rate_13w,period_end&order=sales_13w.desc&limit=5000").catch(()=>[]);
  const sm=new Map<string,any>(psum.map((x:any)=>[String(x.product_id),x]));
  products=p.map((x:any)=>{const s=sm.get(String(x.id));return{...x,sales:s?.sales_13w??null,units:s?.units_13w??null,price:s?.avg_price_13w??null,distribution:s?.distribution_13w??null,promoRate:s?.promo_rate_13w??null,summaryAvailable:Boolean(s)}}).sort((x:any,y:any)=>n(y.sales)-n(x.sales));
 }catch{}
 let retailers:any[]=[];
 try{
  const rr:any[]=await get("cpgist_brand_retailer_summary?brand_id=eq."+enc(id)+"&select=retailer_id,category,period_end,sales_13w,units_13w,avg_price_13w,distribution_13w,promo_rate_13w&order=sales_13w.desc&limit=5000").catch(()=>[]);
  const rm:any[]=await get("cpgist_retailers?select=id,name,channel,region,retailer_group,total_stores&order=name&limit=2000");
  retailers=rr.map(x=>{const z=rm.find(v=>String(v.id)===String(x.retailer_id))||{};return{id:x.retailer_id,name:z.name||("Retailer "+x.retailer_id),channel:z.channel||"",region:z.region||"",retailer_group:z.retailer_group||"",total_stores:z.total_stores??null,sales:x.sales_13w,units:x.units_13w,price:x.avg_price_13w,distribution:x.distribution_13w,promoRate:x.promo_rate_13w}}).sort((x:any,y:any)=>n(y.sales)-n(x.sales));
 }catch{}
 let competitorSignals:any[]=[];
 try{
  competitorSignals=await get("syndicate_competitor_signals?category=ilike."+enc(brand.category||"")+"&select=brand_id,category,retailer_id,region,signal_date,signal_type,magnitude_pct,description&order=signal_date.desc&limit=25");
 }catch{}

 // Same-source, anonymized competitive peer benchmark. Peer brand names never leave this API.
 let competitiveBenchmark:any=null;
 try{
  if(brand.category && latest.length===13 && prior.length===13){
   // Resolve the category membership from the brand master first. This avoids
   // relying on a REST text filter for category names containing characters such as "&".
   const categoryBrands:any[]=await get("cpgist_brands?select=id,name,category&limit=5000");
   const categoryBrandIds=new Set(categoryBrands.filter((x:any)=>String(x.category||"").toLowerCase()===String(brand.category||"").toLowerCase()).map((x:any)=>String(x.id)));
   const benchmarkStart=prior[0];
   const cr:any[]=await get("cpgist_brand_weekly?category=eq."+enc(brand.category)+"&week_ending=gte."+enc(benchmarkStart)+"&select=brand_id,week_ending,sales,units,distribution&order=week_ending.asc&limit=5000");
   const byBrand=new Map<string,any[]>();
   for(const r of cr){const k=String(r.brand_id);if(!categoryBrandIds.has(k))continue;if(!byBrand.has(k))byBrand.set(k,[]);byBrand.get(k)!.push(r);}
   const rows=[...byBrand.entries()].map(([brandId,rs])=>{
    const cur=rs.filter(r=>ls.has(String(r.week_ending))),prev=rs.filter(r=>ps.has(String(r.week_ending)));
    const cs=cur.reduce((s,r)=>s+n(r.sales),0),psales=prev.reduce((s,r)=>s+n(r.sales),0);
    const cu=cur.reduce((s,r)=>s+n(r.units),0),pu=prev.reduce((s,r)=>s+n(r.units),0);
    const dist=cur.length?cur.reduce((s,r)=>s+n(r.distribution),0)/cur.length:null;
    return{brandId,sales:cs,priorSales:psales,growth:psales?pct(cs,psales):null,units:cu,priorUnits:pu,unitGrowth:pu?pct(cu,pu):null,distribution:dist,curCount:cur.length,prevCount:prev.length};
   }).filter(r=>r.curCount===13 && r.prevCount===13 && r.growth!=null);
   const peers=rows.filter(r=>String(r.brandId)!==String(id));
   const brandNameMap=new Map(categoryBrands.map((x:any)=>[String(x.id),x.name]));
   const med=(vals:number[])=>{const a=vals.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:null};
   const focalRow=rows.find(r=>String(r.brandId)===String(id));
   competitiveBenchmark={
    available:peers.length>0,
    // Named competitors are exposed only when they are directly present in the same
    // category/source and have complete aligned 13W + prior-13W coverage.
    competitors: rows.filter(r=>String(r.brandId)!==String(id) && r.growth!=null).sort((a,b)=>Number(b.sales)-Number(a.sales)).slice(0,15).map((r,i)=>({brandId:r.brandId,name:"Competitor "+(i+1),sales:r.sales,priorSales:r.priorSales,growth:r.growth,units:r.units,unitGrowth:r.unitGrowth,distribution:r.distribution})),
    peerCount:peers.length,
    focalMatched:Boolean(focalRow),
    focalGrowth:focalRow?.growth??null,
    focalUnitGrowth:focalRow?.unitGrowth??null,
    peerMedianGrowth:med(peers.map(r=>Number(r.growth))),
    peerMedianSales:med(peers.map(r=>Number(r.sales))),
    peerMedianUnitGrowth:med(peers.map(r=>Number(r.unitGrowth))),
    peerMedianDistribution:med(peers.map(r=>Number(r.distribution))),
    peersGrowing:peers.filter(r=>Number(r.growth)>0).length,
    peersDeclining:peers.filter(r=>Number(r.growth)<0).length,
    peerGrowthRange:peers.length?{min:Math.min(...peers.map(r=>Number(r.growth))),max:Math.max(...peers.map(r=>Number(r.growth)))}:null,
    source:"cpgist_brand_weekly",
    periodCount:13
   };
  }
 }catch{}

 const priorShare=categoryPriorSales?b.sales/categoryPriorSales*100:null;
 const incSales=a.sales?rows.filter(r=>ls.has(String(r.week_ending))).reduce((s,r)=>s+n(r.incremental_sales),0):0;
 const incMargin=rows.filter(r=>ls.has(String(r.week_ending))).reduce((s,r)=>s+(r.margin_percent==null?0:n(r.incremental_sales)*n(r.margin_percent)),0);
 const tradeSpend=rows.filter(r=>ls.has(String(r.week_ending))).reduce((s,r)=>s+n(r.trade_spend),0);
 const grossMargin=rows.filter(r=>ls.has(String(r.week_ending))).reduce((s,r)=>s+n(r.gross_margin),0);
 const advanced={incrementalSales:incSales,incrementalMargin:incMargin,tradeSpend,roi:tradeSpend?incMargin/tradeSpend:null,grossMargin,marginPercent:a.sales?grossMargin/a.sales:null,promoEvents:rows.filter(r=>ls.has(String(r.week_ending))).reduce((s,r)=>s+n(r.promo_events),0)};
 const actualWeeks=periods.filter(w=>rows.filter(r=>String(r.week_ending)===w).every(r=>r.is_actual===true));
 const syntheticWeeks=periods.filter(w=>rows.filter(r=>String(r.week_ending)===w).some(r=>r.is_actual===false));
 const provenance={actualWeeks:actualWeeks.length,syntheticWeeks:syntheticWeeks.length,totalWeeks:periods.length,mixed:actualWeeks.length>0&&syntheticWeeks.length>0,status:syntheticWeeks.length?"mixed":"actual",label:syntheticWeeks.length?syntheticWeeks.length+" of "+periods.length+" weeks in this view are projected, not observed":null};
 return{entity:"brand",source:"cpgist_compact",brand,periods,latestWindow:latest,priorWindow:prior,metrics:{sales:a.sales,priorSales:b.sales,growth:pct(a.sales,b.sales),units:a.units,distribution:a.distribution,price:a.price,promoRate:a.promoRate,categorySales,categoryPriorSales,categoryGrowth,share:categorySales?a.sales/categorySales*100:null,priorShare,shareChangePts:(categorySales&&categoryPriorSales)?(a.sales/categorySales*100)-(b.sales/categoryPriorSales*100):null},advanced,provenance,weekly,products,retailers,categoryWeekly,competitorSignals,competitiveBenchmark}
}

export async function GET(req:NextRequest){
 try{
  const p=req.nextUrl.searchParams,entity=p.get("entity")||"brand",q=(p.get("q")||"").trim(),id=p.get("id"),categoryFilter=(p.get("category")||"").trim(),subcategoryFilter=(p.get("subcategory")||"").trim(),limit=Math.min(5000,Math.max(1,Number(p.get("limit")||5000)||5000)),offset=Math.max(0,Number(p.get("offset")||0)||0);
  let compact=false;try{const x=await get("cpgist_brands?select=id&limit=1");compact=Array.isArray(x)&&x.length>0}catch{}
  if(!compact)return NextResponse.json({error:"CPGist Free Dataset is not imported yet. Open Data Import and load CPGist dataset ZIP before using the client workspace.",code:"COMPACT_DATASET_REQUIRED"},{status:503});

  if(entity==="brand"){
   const rows:any[]=await get("cpgist_brands?select=id,name,category,parent_company,home_regions,portfolio&order=name&limit=5000");
   if(id){const brand=rows.find(x=>String(x.id)===String(id));if(!brand)return NextResponse.json({error:"Brand not found."},{status:404});return NextResponse.json(await brandDetail(String(id),brand))}
   const results=rows.filter(x=>has(x.name,q)||has(x.category,q)||has(x.parent_company,q)||has(x.home_regions,q));
   return NextResponse.json({entity,source:"cpgist_compact",count:results.length,results:results.slice(offset,offset+limit)});
  }
  if(entity==="retailer"){
   const rows:any[]=await get("cpgist_retailers?select=id,name,channel,region,total_stores,retailer_group&order=name&limit=5000");
   if(id){
    const retailer=rows.find(x=>String(x.id)===String(id));
    if(!retailer)return NextResponse.json({error:"Retailer not found."},{status:404});
    const weekly:any[]=await get("cpgist_retailer_weekly?retailer_id=eq."+enc(id)+"&select=week_ending,sales,units,distribution&order=week_ending.desc&limit=5000").catch(()=>[]);
    const summary:any[]=await get("cpgist_brand_retailer_summary?retailer_id=eq."+enc(id)+"&select=brand_id,sales_13w,units_13w,distribution_13w,period_end&limit=10000").catch(()=>[]);
    const periods=[...new Set(weekly.map(x=>String(x.week_ending)).filter(Boolean))].sort();
    const latest=periods.slice(-13),prior=periods.slice(-26,-13);
    const agg=(ws:any[])=>({sales:ws.reduce((a,x)=>a+n(x.sales),0),units:ws.reduce((a,x)=>a+n(x.units),0),distribution:ws.length?ws.reduce((a,x)=>a+n(x.distribution),0)/ws.length:null});
    const cur=agg(weekly.filter(x=>latest.includes(String(x.week_ending)))),prev=agg(weekly.filter(x=>prior.includes(String(x.week_ending))));
    const summarySales=summary.reduce((a,x)=>a+n(x.sales_13w),0),summaryUnits=summary.reduce((a,x)=>a+n(x.units_13w),0);
    const weeklyComplete=latest.length===13;
    const has13wCoverage=summary.length>0 || weeklyComplete;
    const sales=summary.length?summarySales:(weeklyComplete?cur.sales:null);
    const units=summary.length?summaryUnits:(weeklyComplete?cur.units:null);
    const summaryEnd=summary.map(x=>String(x.period_end||"")).filter(Boolean).sort().at(-1)||null;
    const latestWindow=summaryEnd?(()=>{const d=new Date(summaryEnd+"T00:00:00Z");const out:string[]=[];for(let i=12;i>=0;i--){const z=new Date(d);z.setUTCDate(z.getUTCDate()-7*i);out.push(z.toISOString().slice(0,10));}return out})():latest;
    return NextResponse.json({entity,source:summary.length?"cpgist_brand_retailer_summary":"cpgist_retailer_weekly",retailer,metrics:{sales,units,distribution:cur.distribution,growth:(sales!=null&&prev.sales)?pct(sales,prev.sales):null,priorSales:prev.sales,weeksAvailable:has13wCoverage?13:latest.length,has13wCoverage},periods,latestWindow});

   }
   const results=rows.filter(x=>has(x.name,q)||has(x.channel,q)||has(x.region,q)||has(x.retailer_group,q));
   return NextResponse.json({entity,source:"cpgist_compact",count:results.length,results:results.slice(offset,offset+limit)});
  }
  if(entity==="category"){
   const rows:any[]=await get("cpgist_categories?select=id,name,parent_category,subcategory_count&order=name&limit=5000");
   const products:any[]=await get("cpgist_products?select=id,name,category,subcategory,size,sku,brand_id&order=name&limit=10000");
   const enriched=rows.map((c:any)=>{
    const ps=products.filter((p:any)=>String(p.category||"").toLowerCase()===String(c.name||"").toLowerCase());
    const counts=new Map<string,any[]>();
    for(const p of ps){const key=String(p.subcategory||"Unclassified");if(!counts.has(key))counts.set(key,[]);counts.get(key)!.push(p);}
    return{...c,product_count:ps.length,subcategories:[...counts.entries()].sort((x,y)=>y[1].length-x[1].length).map(([name,items])=>({name,product_count:items.length,products:items.map(p=>({id:p.id,name:p.name,sku:p.sku||null,size:p.size||null,brand_id:p.brand_id}))}))};
   });
   const results=enriched.filter(x=>has(x.name,q)||has(x.parent_category,q));return NextResponse.json({entity,source:"cpgist_compact",count:results.length,results:results.slice(offset,offset+limit)});
  }
  if(entity==="region"){
   const rows:any[]=await get("cpgist_regions?select=id,name,country,region_group&order=name&limit=5000");
   const brands:any[]=await get("cpgist_brands?select=id,name,category,home_regions&limit=5000");
   const products:any[]=await get("cpgist_products?select=id,brand_id,name,category,subcategory&limit=10000");
   if(id){
    const region=rows.find(x=>String(x.id)===String(id));
    if(!region)return NextResponse.json({error:"Region not found."},{status:404});
    const rb=brands.filter((b:any)=>String(b.home_regions||"").toLowerCase().includes(String(region.name||"").toLowerCase()));
    const ids=new Set(rb.map((b:any)=>String(b.id)));
    const regionRetailers:any[]=await get("cpgist_retailers?region=eq."+enc(region.name)+"&select=id,total_stores&limit=5000").catch(()=>[]);
    const retailerIds=new Set(regionRetailers.map((r:any)=>String(r.id)));
    // Use the compact brand-retailer 13W summary rather than retailer-weekly.
    // retailer-weekly is only populated for a subset of retailer masters, which
    // previously made some valid regions appear to have no 13W sales.
    const summaries:any[]=retailerIds.size
      ? await get("cpgist_brand_retailer_summary?select=retailer_id,sales_13w,units_13w,period_end&retailer_id=in.("+encodeURIComponent([...retailerIds].join(","))+")&limit=10000").catch(()=>[])
      : [];
    const regionLatestSales=summaries.reduce((a:any,x:any)=>a+n(x.sales_13w),0);
    const regionLatestUnits=summaries.reduce((a:any,x:any)=>a+n(x.units_13w),0);
    const periodEnd=summaries.map((x:any)=>String(x.period_end||"")).filter(Boolean).sort().at(-1)||null;
    const latestPeriods=periodEnd?(()=>{const d=new Date(periodEnd+"T00:00:00Z");const out:string[]=[];for(let i=12;i>=0;i--){const z=new Date(d);z.setUTCDate(z.getUTCDate()-7*i);out.push(z.toISOString().slice(0,10));}return out})():[];
    const weeksAvailable=regionLatestSales||regionLatestUnits?summaries.length>0?13:0:0;
    return NextResponse.json({entity,source:"cpgist_brand_retailer_summary",region,brands:rb,productCount:products.filter((p:any)=>ids.has(String(p.brand_id))).length,retailerCount:retailerIds.size,totalStores:regionRetailers.reduce((a:number,r:any)=>a+n(r.total_stores),0),metrics:{sales:regionLatestSales,units:regionLatestUnits,weeksAvailable},latestWindow:latestPeriods,summaryRows:summaries.length});
   }
   const enriched=rows.map((r:any)=>{const rb=brands.filter((b:any)=>String(b.home_regions||"").toLowerCase().includes(String(r.name||"").toLowerCase()));const ids=new Set(rb.map((b:any)=>String(b.id)));return{...r,brand_count:rb.length,product_count:products.filter((p:any)=>ids.has(String(p.brand_id))).length}});
   const results=enriched.filter(x=>has(x.name,q)||has(x.country,q)||has(x.region_group,q));return NextResponse.json({entity,source:"cpgist_compact",count:results.length,results:results.slice(offset,offset+limit)});
  }
  if(entity==="product"){
   const rows:any[]=await get("cpgist_products?select=id,brand_id,name,category,subcategory,size,sku,launch_date&order=name&limit=10000");
   if(id){
    const product=rows.find(x=>String(x.id)===String(id));
    if(!product)return NextResponse.json({error:"Product not found."},{status:404});
    const weekly:any[]=await get("cpgist_product_weekly?product_id=eq."+enc(id)+"&select=retailer_id,week_ending,sales,units,price,distribution,promo_rate,gross_margin,margin_percent,is_actual&order=week_ending.desc&limit=5000").catch(()=>[]);
    const retailers:any[]=await get("cpgist_retailers?select=id,name,channel,region,total_stores&limit=5000").catch(()=>[]);
    const byRetailer=new Map(retailers.map((r:any)=>[String(r.id),r]));
    // Prefer the imported product-level 13W summary. This is the authoritative
    // compact metric and remains available even when some retailer-week rows are sparse.
    const summary:any[]=await get("cpgist_product_summary?product_id=eq."+enc(id)+"&select=product_id,sales_13w,units_13w,avg_price_13w,distribution_13w,promo_rate_13w,period_end&limit=10").catch(()=>[]);
    const s=summary[0]||null;
    const periods=[...new Set(weekly.map(x=>String(x.week_ending)).filter(Boolean))].sort();
    const latestPeriods=s?.period_end?(()=>{const d=new Date(String(s.period_end)+"T00:00:00Z");const out:string[]=[];for(let i=12;i>=0;i--){const z=new Date(d);z.setUTCDate(z.getUTCDate()-7*i);out.push(z.toISOString().slice(0,10));}return out})():periods.slice(-13);
    const priorPeriods=periods.slice(-26,-13);
    const latest=weekly.filter(x=>latestPeriods.includes(String(x.week_ending)));
    const sales=s?.sales_13w!=null?n(s.sales_13w):latest.reduce((a,x)=>a+n(x.sales),0);
    const units=s?.units_13w!=null?n(s.units_13w):latest.reduce((a,x)=>a+n(x.units),0);
    const priorSales=weekly.filter(x=>priorPeriods.includes(String(x.week_ending))).reduce((a,x)=>a+n(x.sales),0);
    const retailerAgg=new Map<string,any>();
    for(const x of latest){const k=String(x.retailer_id);const z=retailerAgg.get(k)||{sales:0,units:0};z.sales+=n(x.sales);z.units+=n(x.units);retailerAgg.set(k,z);}
    const weeksAvailable=s?13:new Set(latest.map(x=>String(x.week_ending))).size;
    return NextResponse.json({entity,source:s?"cpgist_product_summary":"cpgist_product_weekly",product,metrics:{sales,priorSales,growth:priorSales?pct(sales,priorSales):null,units,avgPrice:s?.avg_price_13w??(units?sales/units:null),avgDistribution:s?.distribution_13w??(latest.length?latest.reduce((a,x)=>a+n(x.distribution),0)/latest.length:null),avgMargin:latest.length?latest.reduce((a,x)=>a+n(x.margin_percent),0)/latest.length:null,weeksAvailable},retailers:[...retailerAgg.entries()].map(([rid,z])=>({...byRetailer.get(rid),sales:z.sales,units:z.units})).filter((x:any)=>x.id),latestWindow:latestPeriods,priorWindow:priorPeriods});
   }
   const results=rows.filter(x=>(!categoryFilter||String(x.category||"").toLowerCase()===categoryFilter.toLowerCase())&&(!subcategoryFilter||String(x.subcategory||"").toLowerCase()===subcategoryFilter.toLowerCase())&&(has(x.name,q)||has(x.category,q)||has(x.subcategory,q)||has(x.sku,q)));return NextResponse.json({entity,source:"cpgist_compact",count:results.length,results:results.slice(offset,offset+limit),filters:{category:categoryFilter||null,subcategory:subcategoryFilter||null}});
  }
  return NextResponse.json({error:"Unsupported entity."},{status:400});
 }catch(e:any){return NextResponse.json({error:e?.message||"Data explorer failed."},{status:500})}
}