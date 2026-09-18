import {NextResponse} from "next/server";
export async function POST(req:Request){
  const {messages}=await req.json();
  const key=process.env.GROQ_API_KEY;
  if(!key) return NextResponse.json({error:"GROQ_API_KEY is not configured",demo:true},{status:503});
  const model=process.env.GROQ_MODEL||"openai/gpt-oss-120b";
  const system={role:"system",content:"You are CPGist AI Analyst. Use only supplied analytical evidence. Never invent metrics. Explain business drivers and keep answers concise."};
  const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},body:JSON.stringify({model,messages:[system,...messages],temperature:0.2})});
  return NextResponse.json(await response.json(),{status:response.status});
}