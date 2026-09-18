import {NextResponse} from "next/server";
import {CPG_TOOLS} from "@/lib/cpg-analytics";
export async function POST(req:Request){
 const {messages}=await req.json();
 const key=process.env.GROQ_API_KEY;
 if(!key)return NextResponse.json({error:"GROQ_API_KEY is not configured",demo:true},{status:503});
 const model=process.env.GROQ_MODEL||"openai/gpt-oss-120b";
 const system={role:"system",content:"You are CPGist AI Analyst. You are an analytical orchestrator. Never invent metrics. Use CPG tools for quantitative claims. Explain drivers from retrieved evidence. If evidence is missing, say what data is needed."};
 const body={model,messages:[system,...messages],temperature:.2,tools:CPG_TOOLS.map(t=>({type:"function",function:t})),tool_choice:"auto"};
 const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},body:JSON.stringify(body)});
 return NextResponse.json(await response.json(),{status:response.status});
}