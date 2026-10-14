import {NextRequest,NextResponse} from "next/server";
import {requireSupabaseUser} from "../../../lib/require-supabase-user";

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

export async function GET(req:NextRequest){const authResult=await requireSupabaseUser(req);if("response" in authResult)return authResult.response;
  try{
    const p=req.nextUrl.searchParams;
    if(p.get("mode")==="experiments"){
      const brandId=p.get("brand_id")||"";
      const where=brandId?"?brand_id=eq."+enc(brandId)+"&order=created_at.desc&limit=200":"?order=created_at.desc&limit=200";
      return NextResponse.json({experiments:await get("cpgist_experiments"+where)});
    }
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


export async function POST(req:NextRequest){const authResult=await requireSupabaseUser(req);if("response" in authResult)return authResult.response;
  try{
    const body=await req.json();
    const {u,k}=base();
    if(!u||!k) throw new Error("Supabase server environment is not configured.");
    if(!body?.experiment_id||!body?.brand_id) return NextResponse.json({error:"experiment_id and brand_id are required."},{status:400});
    const payload={
      experiment_id:String(body.experiment_id),
      brand_id:Number(body.brand_id),
      category:body.category||null,
      hypothesis:body.hypothesis||null,
      design:body.design||"observational",
      unit_of_randomization:body.unit_of_randomization||null,
      treatment:body.treatment||null,
      control:body.control||null,
      primary_kpi:body.primary_kpi||null,
      start_date:body.start_date||null,
      end_date:body.end_date||null,
      control_value:body.control_value===""?null:Number(body.control_value),
      test_value:body.test_value===""?null:Number(body.test_value),
      control_observations:body.control_observations===""?null:Number(body.control_observations),
      test_observations:body.test_observations===""?null:Number(body.test_observations),
      assignment_validated:Boolean(body.assignment_validated),
      notes:body.notes||null
    };
    const r=await fetch(u+"/rest/v1/cpgist_experiments",{method:"POST",headers:{apikey:k,Authorization:"Bearer "+k,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(payload),cache:"no-store"});
    const data=await r.json().catch(()=>null);
    if(!r.ok) return NextResponse.json({error:data?.message||data?.hint||"Experiment save failed."},{status:r.status});
    return NextResponse.json({experiment:Array.isArray(data)?data[0]:data});
  }catch(e:any){return NextResponse.json({error:e?.message||"Experiment save failed."},{status:500});}
}
