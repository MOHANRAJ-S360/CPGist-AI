import {NextResponse} from "next/server";
export async function GET(req:Request){
 const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!u||!k)return NextResponse.json({configured:false});
 const url=new URL(req.url),org=url.searchParams.get("organizationId");const qs=new URLSearchParams({select:"period,sales_value,units,price,distribution,brand_id,brand_id,category_id,retailer_id",order:"period.asc",limit:"10000"});if(org)qs.set("organization_id","eq."+org);
 const res=await fetch(u+"/rest/v1/sales_facts?"+qs,{headers:{apikey:k,Authorization:"Bearer "+k},cache:"no-store"});if(!res.ok)return NextResponse.json({error:"Dashboard data query failed"},{status:500});
 const rows=await res.json() as any[];const sales=rows.reduce((a,r)=>a+Number(r.sales_value||0),0),units=rows.reduce((a,r)=>a+Number(r.units||0),0);
 const validPrice=rows.filter(r=>r.price!=null),validDist=rows.filter(r=>r.distribution!=null);
 const price=units?validPrice.reduce((a,r)=>a+Number(r.price||0)*Number(r.units||0),0)/units:null;
 const distribution=validDist.length?validDist.reduce((a,r)=>a+Number(r.distribution||0),0)/validDist.length:null;
 const periods=[...new Set(rows.map(r=>String(r.period)))].sort();const latest=periods.at(-1),prior=periods.at(-2);
 const sum=(p:string|undefined)=>rows.filter(r=>String(r.period)===p).reduce((a,r)=>a+Number(r.sales_value||0),0);
 const growth=prior&&sum(prior)?(sum(latest)-sum(prior))/sum(prior):null;
 const byBrand=new Map<string,{sales:number,units:number}>();for(const r of rows){const id=String(r.brand_id||"unassigned");const x=byBrand.get(id)||{sales:0,units:0};x.sales+=Number(r.sales_value||0);x.units+=Number(r.units||0);byBrand.set(id,x);}
 return NextResponse.json({configured:true,rowCount:rows.length,kpis:{sales,units,price,distribution,growth},periods,brands:Array.from(byBrand.entries()).sort((a,b)=>b[1].sales-a[1].sales).map(([brandId,v])=>({brandId,...v}))});
}