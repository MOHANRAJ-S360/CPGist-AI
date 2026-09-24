import {NextResponse} from "next/server";
import {runAdvancedAnalytics} from "../../../lib/advanced-analytics";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(req:Request){
 try{
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const u=new URL(req.url),type=u.searchParams.get("type")||"";
  const params:any=Object.fromEntries(u.searchParams.entries());
  return NextResponse.json(await runAdvancedAnalytics(type,token,params));
 }catch(e:any){
  return NextResponse.json({error:e?.message||"Advanced analytics failed."},{status:500});
 }
}
