import type {SupabaseClient} from "@supabase/supabase-js";
import {importDatasetZip} from "./syndicate-import";

type Listener=(state:ImportState)=>void;
export type ImportState={busy:boolean;status:string;result:any;error:string};

let job:Promise<any>|null=null;
let state:ImportState={busy:false,status:"",result:null,error:""};
const listeners=new Set<Listener>();

function emit(next:Partial<ImportState>){
  state={...state,...next};
  listeners.forEach(fn=>fn(state));
}
export function getImportState(){return state}
export function subscribeImport(fn:Listener){
  listeners.add(fn); fn(state);
  return()=>listeners.delete(fn);
}
export function startDatasetImport(sb:SupabaseClient,file:File){
  if(job)return job;
  emit({busy:true,status:"Validating CPGist dataset package…",error:"",result:null});
  job=(async()=>{
    try{
      const {data:{session}}=await sb.auth.getSession();
      if(!session)throw new Error("Please sign in first.");
      const result=await importDatasetZip(sb,file,(status)=>emit({status}));
      emit({busy:false,status:"Import completed successfully. The client workspace now uses the CPGist Free Dataset.",result,error:""});
      return result;
    }catch(e:any){
      const message=e?.message||"Import failed. You can retry safely.";
      emit({busy:false,status:"",error:message,result:null});
      throw e;
    }finally{
      job=null;
    }
  })();
  return job;
}