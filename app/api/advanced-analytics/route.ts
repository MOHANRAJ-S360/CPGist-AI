import {NextResponse} from "next/server";
export const runtime="nodejs";
export async function GET(){return NextResponse.json({available:false,features:"Advanced analytics layer is wired but awaiting extended dataset import."});}
