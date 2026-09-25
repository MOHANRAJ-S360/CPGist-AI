import {NextRequest,NextResponse} from "next/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const base=()=>({u:process.env.NEXT_PUBLIC_SUPABASE_URL,k:process.env.SUPABASE_SERVICE_ROLE_KEY});
async function get(path:string){
  const {u,k}=base();
  if(!u||!k) throw new Error("Supabase server environment is not configured.");
  const r=await fetch(u+"/rest/v1/"+path,{headers:{apikey:k,Authorization:"Bearer "+k},cache:"no-store"});
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}
async function getAll(path:string,pageSize=1000,maxRows=20000){
  const clean=path.replace(/([&?])limit=\d+/,"$1").replace(/&&/g,"&").replace(/[?&]$/,"");
  const out:any[]=[];
  for(let offset=0;offset<maxRows;offset+=pageSize){
    const sep=clean.includes("?")?"&":"?";
    const page=await get(clean+sep+"limit="+pageSize+"&offset="+offset);
    if(!Array.isArray(page)||!page.length) break;
    out.push(...page);
    if(page.length<pageSize) break;
  }
  return out.slice(0,maxRows);
}
const enc=(v:any)=>encodeURIComponent(String(v??""));
const n=(v:any)=>Number(v??0)||0;

export async function GET(req:NextRequest){
  try{
    const p=req.nextUrl.searchParams;
    const brandId=p.get("brand_id")||"";
    if(!brandId) return NextResponse.json({error:"brand_id is required."},{status:400});

    const [brands,rows,retailers]=await Promise.all([
      get("cpgist_brands?select=id,name,category&limit=5000"),
      getAll("cpgist_brand_retailer_weekly?brand_id=eq."+enc(brandId)+"&select=brand_id,retailer_id,category,week_ending,sales,units,distribution,price,promo_rate,gross_margin,margin_percent,is_actual&order=week_ending.asc",1000,20000),
      get("cpgist_retailers?select=id,name,channel,region,retailer_group,total_stores&limit=5000")
    ]);
    const brand=(brands as any[]).find(x=>String(x.id)===String(brandId));
    if(!brand) return NextResponse.json({error:"Brand not found."},{status:404});

    const rm=new Map((retailers as any[]).map(r=>[String(r.id),r]));
    const periods=[...new Set((rows as any[]).map(r=>String(r.week_ending)).filter(Boolean))].sort();
    const latest13=periods.slice(-13);
    const prior13=periods.slice(-26,-13);
    const byRetailer=new Map<string,any[]>();
    for(const r of rows as any[]){
      const key=String(r.retailer_id);
      if(!byRetailer.has(key)) byRetailer.set(key,[]);
      byRetailer.get(key)!.push(r);
    }
    const agg=(rs:any[],weeks:string[])=>{
      const x=rs.filter(r=>weeks.includes(String(r.week_ending)));
      const sales=x.reduce((s,r)=>s+n(r.sales),0);
      const units=x.reduce((s,r)=>s+n(r.units),0);
      const margin=x.reduce((s,r)=>s+n(r.gross_margin),0);
      return {
        sales,units,grossMargin:margin,
        marginPercent:sales?margin/sales*100:null,
        avgDistribution:x.length?x.reduce((s,r)=>s+n(r.distribution),0)/x.length:null,
        avgPrice:units?sales/units:null,
        avgPromoRate:x.length?x.reduce((s,r)=>s+n(r.promo_rate),0)/x.length:null,
        weeks:x.length,
        actual:x.length>0&&x.every(r=>r.is_actual===true)
      };
    };
    const retailerSummary=[...byRetailer.entries()].map(([id,rs])=>{
      const master=rm.get(id)||{};
      const latest=agg(rs,latest13),prior=agg(rs,prior13);
      return {
        id,name:master.name||("Retailer "+id),channel:master.channel||"",region:master.region||"",
        totalStores:master.total_stores??null,latest,prior,
        growth:prior.sales?((latest.sales/prior.sales)-1)*100:null
      };
    }).filter(x=>x.latest.weeks>0).sort((a,b)=>b.latest.sales-a.latest.sales);

    return NextResponse.json({
      brand:{id:brand.id,name:brand.name,category:brand.category},
      source:"cpgist_brand_retailer_weekly",
      periods,latest13,prior13,
      retailers:retailerSummary,
      rows
    });
  }catch(e:any){
    return NextResponse.json({error:e?.message||"A/B Testing data load failed."},{status:500});
  }
}
