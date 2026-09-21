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
 const rows:any[]=await get("cpgist_brand_weekly?brand_id=eq."+enc(id)+"&select=brand_id,category,week_ending,sales,units,distribution,avg_price,promo_rate&order=week_ending.asc&limit=100000");
 const periods=[...new Set(rows.map(r=>String(r.week_ending)).filter(Boolean))].sort();
 const latest=periods.slice(-13),prior=periods.slice(-26,-13),ls=new Set(latest),ps=new Set(prior);
 const agg=(rs:any[])=>{const sales=rs.reduce((a,r)=>a+n(r.sales),0),units=rs.reduce((a,r)=>a+n(r.units),0);return{sales,units,distribution:rs.length?rs.reduce((a,r)=>a+n(r.distribution),0)/rs.length:null,price:units?sales/units:null,promoRate:rs.length?rs.reduce((a,r)=>a+n(r.promo_rate),0)/rs.length:null}};
 const a=agg(rows.filter(r=>ls.has(String(r.week_ending)))),b=agg(rows.filter(r=>ps.has(String(r.week_ending))));
 let categorySales=0,categoryPriorSales=0;
 let categoryGrowth:number|null=null;
 let categoryWeekly:any[]=[];
 if(brand.category){try{
  const cr:any[]=await get("cpgist_category_weekly?category=ilike."+enc(brand.category)+"&select=week_ending,sales,units&order=week_ending.asc&limit=5000");
  categoryWeekly=cr.map(r=>({period:String(r.week_ending),sales:n(r.sales),units:n(r.units)}));
  categorySales=cr.filter(r=>ls.has(String(r.week_ending))).reduce((s,r)=>s+n(r.sales),0);
  categoryPriorSales=cr.filter(r=>ps.has(String(r.week_ending))).reduce((s,r)=>s+n(r.sales),0);
  categoryGrowth=categoryPriorSales?pct(categorySales,categoryPriorSales):null;
 }catch{}}
 const weekly=periods.map(w=>{const rr=rows.filter(r=>String(r.week_ending)===w);return{period:w,sales:rr.reduce((s,r)=>s+n(r.sales),0),units:rr.reduce((s,r)=>s+n(r.units),0)}});
 let products:any[]=[];
 try{
  const p:any[]=await get("cpgist_products?brand_id=eq."+enc(id)+"&select=id,brand_id,name,sku,category,subcategory,size,pack_count&order=name&limit=5000");
  const psum:any[]=await get("cpgist_product_summary?brand_id=eq."+enc(id)+"&select=product_id,sales_13w,units_13w,avg_price_13w,distribution_13w,promo_rate_13w,period_end&order=sales_13w.desc&limit=5000").catch(()=>[]);
  const sm=new Map<string,any>(psum.map((x:any)=>[String(x.product_id),x]));
  products=p.map((x:any)=>{const s=sm.get(String(x.id));return{...x,sales:s?.sales_13w??0,units:s?.units_13w??0,price:s?.avg_price_13w??null,distribution:s?.distribution_13w??null,promoRate:s?.promo_rate_13w??null}}).sort((x:any,y:any)=>n(y.sales)-n(x.sales));
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
   const cr:any[]=await get("cpgist_brand_weekly?select=brand_id,week_ending,sales,units,distribution&order=week_ending.asc&limit=100000");
   const byBrand=new Map<string,any[]>();
   for(const r of cr){const k=String(r.brand_id);if(!categoryBrandIds.has(k))continue;if(!byBrand.has(k))byBrand.set(k,[]);byBrand.get(k)!.push(r);}
   const rows=[...byBrand.entries()].map(([brandId,rs])=>{
    const cur=rs.filter(r=>ls.has(String(r.week_ending))),prev=rs.filter(r=>ps.has(String(r.week_ending)));
    const cs=cur.reduce((s,r)=>s+n(r.sales),0),psales=prev.reduce((s,r)=>s+n(r.sales),0);
    const cu=cur.reduce((s,r)=>s+n(r.units),0),pu=prev.reduce((s,r)=>s+n(r.units),0);
    const dist=cur.length?cur.reduce((s,r)=>s+n(r.distribution),0)/cur.length:null;
    return{brandId,sales:cs,priorSales:psales,growth:psales?pct(cs,psales):null,units:cu,priorUnits:pu,unitGrowth:pu?pct(cu,pu):null,distribution:dist};
   }).filter(r=>r.growth!=null);
   const peers=rows.filter(r=>String(r.brandId)!==String(id));
   const brandNameMap=new Map(categoryBrands.map((x:any)=>[String(x.id),x.name]));
   const med=(vals:number[])=>{const a=vals.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:null};
   const focalRow=rows.find(r=>String(r.brandId)===String(id));
   competitiveBenchmark={
    available:peers.length>0,
    // Named competitors are exposed only when they are directly present in the same
    // category/source and have complete aligned 13W + prior-13W coverage.
    competitors: rows.filter(r=>String(r.brandId)!==String(id) && r.growth!=null).sort((a,b)=>Number(b.sales)-Number(a.sales)).slice(0,15).map(r=>({brandId:r.brandId,name:brandNameMap.get(String(r.brandId))||"Competitor",sales:r.sales,priorSales:r.priorSales,growth:r.growth,units:r.units,unitGrowth:r.unitGrowth,distribution:r.distribution})),
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
 return{entity:"brand",source:"cpgist_compact",brand,periods,latestWindow:latest,priorWindow:prior,metrics:{sales:a.sales,priorSales:b.sales,growth:pct(a.sales,b.sales),units:a.units,distribution:a.distribution,price:a.price,promoRate:a.promoRate,categorySales,categoryPriorSales,categoryGrowth,share:categorySales?a.sales/categorySales*100:null,priorShare,shareChangePts:(categorySales&&categoryPriorSales)?(a.sales/categorySales*100)-(b.sales/categoryPriorSales*100):null},weekly,products,retailers,categoryWeekly,competitorSignals,competitiveBenchmark}
}

export async function GET(req:NextRequest){
 try{
  const p=req.nextUrl.searchParams,entity=p.get("entity")||"brand",q=(p.get("q")||"").trim(),id=p.get("id"),limit=Math.min(5000,Math.max(1,Number(p.get("limit")||5000)||5000)),offset=Math.max(0,Number(p.get("offset")||0)||0);
  let compact=false;try{const x=await get("cpgist_brands?select=id&limit=1");compact=Array.isArray(x)&&x.length>0}catch{}
  if(!compact)return NextResponse.json({error:"CPGist Free Dataset is not imported yet. Open Data Import and load CPGist_Supabase_Free_Dataset.zip before using the client workspace.",code:"COMPACT_DATASET_REQUIRED"},{status:503});

  if(entity==="brand"){
   const rows:any[]=await get("cpgist_brands?select=id,name,category,parent_company,home_regions,portfolio&order=name&limit=5000");
   if(id){const brand=rows.find(x=>String(x.id)===String(id));if(!brand)return NextResponse.json({error:"Brand not found."},{status:404});return NextResponse.json(await brandDetail(String(id),brand))}
   const results=rows.filter(x=>has(x.name,q)||has(x.category,q)||has(x.parent_company,q)||has(x.home_regions,q));
   return NextResponse.json({entity,source:"cpgist_compact",count:results.length,results:results.slice(offset,offset+limit)});
  }
  if(entity==="retailer"){
   const rows:any[]=await get("cpgist_retailers?select=id,name,channel,region,total_stores,retailer_group&order=name&limit=5000");
   const results=rows.filter(x=>has(x.name,q)||has(x.channel,q)||has(x.region,q)||has(x.retailer_group,q));
   return NextResponse.json({entity,source:"cpgist_compact",count:results.length,results:results.slice(offset,offset+limit)});
  }
  if(entity==="category"){
   const rows:any[]=await get("cpgist_categories?select=id,name,parent_category,subcategory_count&order=name&limit=5000");
   const results=rows.filter(x=>has(x.name,q)||has(x.parent_category,q));return NextResponse.json({entity,source:"cpgist_compact",count:results.length,results:results.slice(offset,offset+limit)});
  }
  if(entity==="region"){
   const rows:any[]=await get("cpgist_regions?select=id,name,country,region_group&order=name&limit=5000");
   const results=rows.filter(x=>has(x.name,q)||has(x.country,q)||has(x.region_group,q));return NextResponse.json({entity,source:"cpgist_compact",count:results.length,results:results.slice(offset,offset+limit)});
  }
  if(entity==="product"){
   const rows:any[]=await get("cpgist_products?select=id,brand_id,name,category,subcategory,size,sku&order=name&limit=10000");
   const results=rows.filter(x=>has(x.name,q)||has(x.category,q)||has(x.subcategory,q)||has(x.sku,q));return NextResponse.json({entity,source:"cpgist_compact",count:results.length,results:results.slice(offset,offset+limit)});
  }
  return NextResponse.json({error:"Unsupported entity."},{status:400});
 }catch(e:any){return NextResponse.json({error:e?.message||"Data explorer failed."},{status:500})}
}