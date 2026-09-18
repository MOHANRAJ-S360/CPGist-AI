import {NextResponse} from "next/server";
import {CPG_TOOLS} from "../../../lib/cpg-analytics";

const toolNames=new Set(CPG_TOOLS.map(t=>t.name));
type Args=Record<string,string|undefined>;

async function queryFacts(args:Args){
 const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key) throw new Error("Supabase server environment is not configured.");
 const params=new URLSearchParams({select:"period,sales_value,units,price,distribution,brand_id,category_id,retailer_id",order:"period.asc",limit:"5000"});
 const filters:[string,string][]=[
  ["brand_id",args.brandId||""],["category_id",args.categoryId||""],["retailer_id",args.retailerId||""]
 ];
 for(const [field,value] of filters)if(value)params.set(field,"eq."+value);
 if(args.startDate)params.set("period","gte."+args.startDate);
 if(args.endDate)params.append("period","lte."+args.endDate);
 const res=await fetch(base+"/rest/v1/sales_facts?"+params,{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store"});
 if(!res.ok)throw new Error("Supabase query failed: "+await res.text());
 return await res.json() as Array<Record<string,number|string|null>>;
}

async function executeTool(name:string,args:Args){
 const rows=await queryFacts(args);
 if(name==="get_sales"){
  const byPeriod=new Map<string,{sales:number,units:number}>();
  for(const r of rows){const p=String(r.period);const x=byPeriod.get(p)||{sales:0,units:0};x.sales+=Number(r.sales_value||0);x.units+=Number(r.units||0);byPeriod.set(p,x);}
  return {tool:name,rows:Array.from(byPeriod.entries()).map(([period,v])=>({period,...v}))};
 }
 if(name==="get_distribution"){
  const valid=rows.filter(r=>r.distribution!=null); return {tool:name,weighted_distribution:valid.length?valid.reduce((a,r)=>a+Number(r.distribution||0),0)/valid.length:null,observations:valid.length};
 }
 if(name==="get_price"){
  const valid=rows.filter(r=>r.price!=null);const units=valid.reduce((a,r)=>a+Number(r.units||0),0);
  return {tool:name,average_price:units?valid.reduce((a,r)=>a+Number(r.price||0)*Number(r.units||0),0)/units:null,observations:valid.length};
 }
 if(name==="analyze_drivers"){
  const byBrand=new Map<string,number>(); for(const r of rows){const k=String(r.brand_id||"unassigned");byBrand.set(k,(byBrand.get(k)||0)+Number(r.sales_value||0));}
  return {tool:name,brand_sales:Array.from(byBrand.entries()).map(([brandId,sales])=>({brandId,sales})).sort((a,b)=>b.sales-a.sales)};
 }
 if(name==="detect_anomalies"){
  const by=new Map<string,number>();for(const r of rows){const p=String(r.period);by.set(p,(by.get(p)||0)+Number(r.sales_value||0));}
  const vals=Array.from(by.values()),mean=vals.reduce((a,b)=>a+b,0)/(vals.length||1),sd=Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/(vals.length||1));
  return {tool:name,anomalies:Array.from(by.entries()).filter(([,v])=>sd>0&&Math.abs(v-mean)/sd>=2).map(([period,sales])=>({period,sales,zScore:(sales-mean)/sd}))};
 }
 if(name==="forecast_sales"){
  const horizon=Math.max(1,Math.min(26,Number(args.horizon||4)));const by=new Map<string,number>();for(const r of rows){const p=String(r.period);by.set(p,(by.get(p)||0)+Number(r.sales_value||0));}
  const vals=Array.from(by.values());const n=vals.length;if(n<2)return {tool:name,forecast:[],reason:"At least two periods are required."};const xm=(n-1)/2,ym=vals.reduce((a,b)=>a+b,0)/n;let num=0,den=0;vals.forEach((y,x)=>{num+=(x-xm)*(y-ym);den+=(x-xm)**2});const slope=den?num/den:0,intercept=ym-slope*xm;return {tool:name,forecast:Array.from({length:horizon},(_,i)=>({periodOffset:i+1,sales:Math.max(0,intercept+slope*(n+i))})),method:"linear trend"};
 }
 if(name==="run_scenario"){
  const priceChange=Number(args.priceChangePct||0)/100,distChange=Number(args.distributionChangePts||0);const sales=rows.reduce((a,r)=>a+Number(r.sales_value||0),0),units=rows.reduce((a,r)=>a+Number(r.units||0),0),dist=rows.filter(r=>r.distribution!=null).reduce((a,r)=>a+Number(r.distribution||0),0)/(rows.filter(r=>r.distribution!=null).length||1);
  const elasticity=-1;const volumeFactor=1+elasticity*priceChange+distChange/100;return {tool:name,baselineSales:sales,baselineUnits:units,baselineDistribution:dist,assumptions:{priceElasticity:elasticity,distributionLift:distChange},scenarioSales:sales*volumeFactor*(1+priceChange),salesDelta:sales*(volumeFactor*(1+priceChange)-1)};
 }
 if(name==="get_market_share"){
  const brandRows=rows; const totalRows=await queryFacts({...args,brandId:undefined}); const brandSales=brandRows.reduce((a,r)=>a+Number(r.sales_value||0),0);const totalSales=totalRows.reduce((a,r)=>a+Number(r.sales_value||0),0);
  return {tool:name,brand_sales:brandSales,category_sales:totalSales,market_share:totalSales?brandSales/totalSales:null};
 }
 if(!toolNames.has(name))throw new Error("Unsupported tool");
 throw new Error("Tool execution not implemented: "+name);
}

export async function POST(req:Request){
 const {messages=[]}=await req.json();const key=process.env.GROQ_API_KEY;
 if(!key)return NextResponse.json({error:"GROQ_API_KEY is not configured",demo:true},{status:503});
 const model=process.env.GROQ_MODEL||"openai/gpt-oss-120b";
 const system={role:"system",content:"You are CPGist AI Analyst. Never invent metrics. For quantitative claims, use the available CPG tools. Explain conclusions from returned evidence. If evidence is missing, say what data is needed. Market share is returned as a decimal; convert to percentage when presenting it."};
 let thread=[system,...messages];
 for(let round=0;round<4;round++){
  const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},body:JSON.stringify({model,messages:thread,temperature:.2,tools:CPG_TOOLS.map(t=>({type:"function",function:t})),tool_choice:"auto"})});
  const data=await response.json();if(!response.ok)return NextResponse.json(data,{status:response.status});
  const choice=data.choices?.[0];thread.push(choice.message);
  const calls=choice.message?.tool_calls||[];
  if(!calls.length)return NextResponse.json(data);
  for(const call of calls){
   try{const args=JSON.parse(call.function.arguments||"{}");const result=await executeTool(call.function.name,args);thread.push({role:"tool",tool_call_id:call.id,name:call.function.name,content:JSON.stringify(result)});}
   catch(error){thread.push({role:"tool",tool_call_id:call.id,name:call.function.name,content:JSON.stringify({error:String(error)})});}
  }
 }
 return NextResponse.json({error:"Analyst tool loop exceeded its safety limit."},{status:500});
}