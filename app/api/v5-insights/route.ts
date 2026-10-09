import {NextRequest,NextResponse} from "next/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const base=()=>({u:process.env.NEXT_PUBLIC_SUPABASE_URL,k:process.env.SUPABASE_SERVICE_ROLE_KEY});
async function get(path:string){
  const {u,k}=base();if(!u||!k)throw new Error("Supabase server environment is not configured.");
  const r=await fetch(u+"/rest/v1/"+path,{headers:{apikey:k,Authorization:"Bearer "+k},cache:"no-store"});
  if(!r.ok)throw new Error(await r.text());
  return r.json();
}
const enc=(v:any)=>encodeURIComponent(String(v??""));
const count=async(table:string)=>{
  const {u,k}=base();if(!u||!k)return null;
  const r=await fetch(u+"/rest/v1/"+table+"?select=*",{method:"HEAD",headers:{apikey:k,Authorization:"Bearer "+k,Prefer:"count=exact",Range:"0-0"},cache:"no-store"});
  if(!r.ok)return null;
  const range=r.headers.get("content-range")||"";
  const match=range.match(/\/(\d+)$/);return match?Number(match[1]):null;
};

export async function GET(req:NextRequest){
 try{
  const p=req.nextUrl.searchParams,mode=p.get("mode")||"distribution";
  const coverage=await Promise.all([
    count("cpgist_v5_distribution_efficiency_13w"),
    count("cpgist_v5_first_purchase_share"),
    count("cpgist_v5_media_brand_market_week"),
    count("cpgist_v5_availability_counts")
  ]);
  const status={ready:coverage.every(x=>x!==null&&x>0),distributionRows:coverage[0],firstPurchaseRows:coverage[1],mediaRows:coverage[2],availabilityRows:coverage[3],note:"v5 additions are synthetic or derived; estimates and scenario outputs are not measured customer outcomes."};
  if(mode==="distribution"){
    const anchor=p.get("anchor")==="ALL"?"ALL":"ACTUAL",win=p.get("win")==="P13W"?"P13W":"L13W";
    const terms=["anchor=eq."+anchor,"win=eq."+win];
    if(p.get("category"))terms.push("category=eq."+enc(p.get("category")));
    if(p.get("geography"))terms.push("geographic_scope=eq."+enc(p.get("geography")));
    if(p.get("quadrant"))terms.push("quadrant=eq."+enc(p.get("quadrant")));
    const rows=await get("cpgist_v5_distribution_efficiency_13w?select=anchor,win,upc,market_id,geographic_scope,category,weeks_present,dollar_sales,unit_sales,acv_avg,stores_selling_avg,velocity_units_per_store_week,velocity_dollars_per_store_week,sales_per_acv_point_week,peer_median_velocity,distribution_efficiency_index,peer_acv_p75,acv_gap_points,lost_sales_estimate_weekly,quadrant,is_estimate&"+terms.join("&")+"&order=lost_sales_estimate_weekly.desc&limit=1000");
    const options=await get("cpgist_v5_distribution_efficiency_13w?anchor=eq.ACTUAL&win=eq.L13W&select=category,geographic_scope&limit=1000");
    const categories=[...new Set(options.map((x:any)=>x.category).filter(Boolean))].sort();
    const geographies=[...new Set(options.map((x:any)=>x.geographic_scope).filter(Boolean))].sort();
    const totals=rows.reduce((a:any,x:any)=>{a.sales+=Number(x.dollar_sales)||0;a.lostSales+=Number(x.lost_sales_estimate_weekly)||0;a.rows++;return a;},{sales:0,lostSales:0,rows:0});
    return NextResponse.json({mode,status,rows,categories,geographies,totals,limited:true});
  }
  if(mode==="first-purchase"){
    const rows=await get("cpgist_v5_first_purchase_share?select=brand,geographic_scope,quarter_ending,first_observed_purchases,total_purchases,first_purchase_share,avg_price_paid_first,avg_price_paid_repeat,avg_size_volume_first,avg_size_volume_repeat,top_market_share_first,top_market_share_repeat,is_synthetic_flag,low_sample&order=quarter_ending.desc&limit=1000");
    return NextResponse.json({mode,status,rows,warning:"First purchase means first observed within a closed synthetic panel, not a verified first-ever brand purchase. Burn-in effects make many cells sparse; use for demo/logic validation only."});
  }
  if(mode==="media"){
    const channels=await get("cpgist_v5_media_channel_dictionary?select=channel,funnel_stage,assumed_cpm,assumed_ctr,assumed_roas_min,assumed_roas_max,notes&order=channel&limit=50");
    return NextResponse.json({mode,status,channels,warning:"CPM, CTR and ROAS are illustrative assumptions. The media overlay is synthetic, not measured media performance or causal attribution."});
  }
  if(mode==="availability"){
    const rows=await get("cpgist_v5_availability_counts?select=week_ending,market_id,upc,sampled_stores,listed_stores,in_stock_stores,is_synthetic_flag&order=week_ending.desc&limit=1000");
    return NextResponse.json({mode,status,rows,warning:"Coverage represents 12 sampled markets and one synthetic snapshot only. Do not generalize it to all markets or weeks."});
  }
  return NextResponse.json({error:"Unsupported v5 insight mode."},{status:400});
 }catch(e:any){
  const message=e?.message||"Could not load v5 insights.";
  if(/does not exist|schema cache|cpgist_v5_/.test(message))return NextResponse.json({error:"V5 extension tables are not ready. Apply migration 20261009090000_cpgist_v5_free_tier_extensions.sql, then import CPGist Canonical Dataset v5.",code:"V5_NOT_READY"},{status:503});
  return NextResponse.json({error:message},{status:500});
 }
}
