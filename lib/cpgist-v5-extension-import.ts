import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string,string>;
type Progress = (message:string)=>void;

function basename(path:string){const i=path.lastIndexOf("/");return i>=0?path.slice(i+1):path;}
function clean(v:any){return String(v??"").trim();}
function number(r:Row,...keys:string[]){for(const k of keys){const raw=clean(r[k]);if(raw!==""){const n=Number(raw);if(Number.isFinite(n))return n;}}return 0;}
function pick(r:Row,...keys:string[]){for(const k of keys){const v=clean(r[k]);if(v!=="")return v;}return "";}
function bool(v:any,fallback=false){const s=clean(v).toLowerCase();if(["true","1","yes","y"].includes(s))return true;if(["false","0","no","n",""].includes(s))return false;return fallback;}
function bytes(zip:Record<string,Uint8Array>,name:string){const k=Object.keys(zip).find(x=>basename(x).toLowerCase()===name.toLowerCase());return k?zip[k]:null;}

function parseSmall(input:Uint8Array):Row[]{
  const text=new TextDecoder().decode(input), rows:string[][]=[];let row:string[]=[],cell="",quoted=false;
  const flush=()=>{row.push(cell);cell="";};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===","&&!quoted)flush();
    else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;flush();if(row.some(Boolean))rows.push(row);row=[];}
    else cell+=c;
  }
  if(cell||row.length){flush();if(row.some(Boolean))rows.push(row);}
  const headers=(rows.shift()||[]).map(h=>String(h||"").replace(/^\uFEFF/,"").trim());
  return rows.map(values=>{const r:Row={};headers.forEach((h,i)=>r[h]=String(values[i]??"").trim());return r;});
}

async function scanCsv(input:Uint8Array,onRow:(r:Row)=>void,progress:Progress,label:string){
  const decoder=new TextDecoder();
  let headers:string[]|null=null,row:string[]=[],cellStart=0,quoted=false,rows=0;
  const emit=(end:number)=>{row.push(decoder.decode(input.subarray(cellStart,end)));cellStart=end+1;};
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(c===34){if(quoted&&input[i+1]===34)i++;else quoted=!quoted;continue;}
    if(c===44&&!quoted){emit(i);continue;}
    if((c===10||c===13)&&!quoted){
      emit(i);
      if(!headers)headers=row.map(h=>String(h||"").replace(/^\uFEFF/,"").trim());
      else if(row.length&&row.some(Boolean)){
        const r:Row={};headers.forEach((h,j)=>r[h]=String(row[j]??"").trim());onRow(r);rows++;
        if(rows%100000===0){progress("Processed "+rows.toLocaleString()+" rows from "+label+"…");await new Promise<void>(resolve=>setTimeout(resolve,0));}
      }
      row=[];
      if(c===13&&input[i+1]===10)i++;
      cellStart=i+1;
    }
  }
  if(cellStart<input.length||row.length){
    row.push(decoder.decode(input.subarray(cellStart)));
    if(!headers)headers=row.map(h=>String(h||"").replace(/^\uFEFF/,"").trim());
    else if(row.length&&row.some(Boolean)){const r:Row={};headers.forEach((h,j)=>r[h]=String(row[j]??"").trim());onRow(r);}
  }
}

async function insertBatches(sb:SupabaseClient,table:string,rows:any[],progress:Progress){
  const batchSize=1000,concurrency=3;let next=0,done=0;
  const worker=async()=>{
    while(true){
      const start=next;next+=batchSize;if(start>=rows.length)return;
      const batch=rows.slice(start,Math.min(start+batchSize,rows.length));let last="";
      for(let attempt=0;attempt<5;attempt++){
        const {error}=await sb.from(table).insert(batch);
        if(!error){last="";break;}
        last=error.message;
        if(attempt<4)await new Promise(r=>setTimeout(r,500*Math.pow(2,attempt)));
      }
      if(last)throw new Error(table+": "+last);
      done+=batch.length;
      if(done===rows.length||done%25000===0)progress("Loading "+table+": "+done.toLocaleString()+" / "+rows.length.toLocaleString()+"…");
    }
  };
  await Promise.all(Array.from({length:Math.min(concurrency,Math.max(1,Math.ceil(rows.length/batchSize)))},()=>worker()));
}

export async function importV5Extensions(sb:SupabaseClient,zip:Record<string,Uint8Array>,progress:Progress){
  const distributionBytes=bytes(zip,"Metric_Distribution_Efficiency_13W.csv");
  const firstPurchaseBytes=bytes(zip,"Metric_First_Purchase_Share.csv");
  const channelBytes=bytes(zip,"Media_Channel_Dictionary.csv");
  const mediaBytes=bytes(zip,"Media_Fact_Weekly.csv");
  const storesBytes=bytes(zip,"Store_SKU_Status.csv");
  const storeDictionaryBytes=bytes(zip,"Store_Dictionary.csv");
  const missing=[
    ["Metric_Distribution_Efficiency_13W.csv",distributionBytes],
    ["Metric_First_Purchase_Share.csv",firstPurchaseBytes],
    ["Media_Channel_Dictionary.csv",channelBytes],
    ["Media_Fact_Weekly.csv",mediaBytes],
    ["Store_SKU_Status.csv",storesBytes],
    ["Store_Dictionary.csv",storeDictionaryBytes]
  ].filter(([,v])=>!v).map(([n])=>n);
  if(missing.length)throw new Error("V5 extension package is incomplete. Missing: "+missing.join(", "));

  // Preflight before any write. The guard uses live pg_database_size and reserves
  // at least 80 MiB below Supabase Free's 500 MiB database quota.
  progress("Checking live Supabase database size before importing v5 extensions…");
  const guard=await sb.rpc("cpgist_v5_storage_guard",{p_estimated_increment_mb:100});
  if(guard.error)throw new Error("V5 storage guard is unavailable. Apply the v5 Free-tier migration before importing. "+guard.error.message);
  const guardRow=Array.isArray(guard.data)?guard.data[0]:guard.data;
  if(!guardRow?.allowed){
    const current=Number(guardRow?.current_db_bytes||0)/1048576;
    const projected=Number(guardRow?.projected_db_bytes||0)/1048576;
    throw new Error("V5 import stopped before writing because the Free-tier storage guard would be exceeded. Current database: "+current.toFixed(1)+" MiB; projected with the 100 MiB safety allowance: "+projected.toFixed(1)+" MiB; safe ceiling: 420 MiB. Remove redundant data or reduce the extension package first.");
  }
  const currentMiB=Number(guardRow.current_db_bytes)/1048576;
  const projectedMiB=Number(guardRow.projected_db_bytes)/1048576;
  progress("Storage guard passed: "+currentMiB.toFixed(1)+" MiB current · "+projectedMiB.toFixed(1)+" MiB conservative projection · 420 MiB import ceiling.");

  const distribution:any[]=[];
  await scanCsv(distributionBytes!,r=>distribution.push({
    anchor:pick(r,"anchor"),win:pick(r,"win"),upc:pick(r,"upc"),market_id:pick(r,"market_id"),
    geographic_scope:pick(r,"geographic_scope"),category:pick(r,"category"),weeks_present:number(r,"weeks_present"),
    dollar_sales:number(r,"dollar_sales"),unit_sales:number(r,"unit_sales"),acv_avg:number(r,"acv_avg"),
    stores_selling_avg:number(r,"stores_selling_avg"),velocity_units_per_store_week:number(r,"velocity_units_per_store_week"),
    velocity_dollars_per_store_week:number(r,"velocity_dollars_per_store_week"),sales_per_acv_point_week:number(r,"sales_per_acv_point_week"),
    peer_median_velocity:number(r,"peer_median_velocity"),distribution_efficiency_index:number(r,"distribution_efficiency_index"),
    peer_acv_p75:number(r,"peer_acv_p75"),acv_gap_points:number(r,"acv_gap_points"),
    lost_sales_estimate_weekly:number(r,"lost_sales_estimate_weekly"),quadrant:pick(r,"quadrant"),is_estimate:bool(r.is_estimate,true)
  }),progress,"Metric_Distribution_Efficiency_13W.csv");

  const firstPurchase:any[]=[];
  await scanCsv(firstPurchaseBytes!,r=>firstPurchase.push({
    brand:pick(r,"brand"),geographic_scope:pick(r,"geographic_scope"),quarter_ending:pick(r,"quarter_ending"),
    first_observed_purchases:number(r,"first_observed_purchases"),total_purchases:number(r,"total_purchases"),
    first_purchase_share:number(r,"first_purchase_share"),avg_price_paid_first:r.avg_price_paid_first===""?null:number(r,"avg_price_paid_first"),
    avg_price_paid_repeat:r.avg_price_paid_repeat===""?null:number(r,"avg_price_paid_repeat"),
    avg_size_volume_first:r.avg_size_volume_first===""?null:number(r,"avg_size_volume_first"),
    avg_size_volume_repeat:r.avg_size_volume_repeat===""?null:number(r,"avg_size_volume_repeat"),
    top_market_share_first:r.top_market_share_first===""?null:number(r,"top_market_share_first"),
    top_market_share_repeat:r.top_market_share_repeat===""?null:number(r,"top_market_share_repeat"),
    is_synthetic_flag:bool(r.is_synthetic_flag,true),low_sample:bool(r.low_sample,false)
  }),progress,"Metric_First_Purchase_Share.csv");

  const channels=parseSmall(channelBytes!).map(r=>({
    channel:pick(r,"channel"),funnel_stage:pick(r,"funnel_stage"),assumed_cpm:number(r,"assumed_cpm"),
    assumed_ctr:number(r,"assumed_ctr"),assumed_roas_min:number(r,"assumed_roas_min"),
    assumed_roas_max:number(r,"assumed_roas_max"),notes:pick(r,"notes")||null
  })).filter(r=>r.channel);

  // Aggregate the 906k channel-level media rows to brand x market x week before
  // storage. This is the only media fact persisted on Free; CPM/CTR/ROAS are assumptions.
  const mediaMap=new Map<string,any>();
  await scanCsv(mediaBytes!,r=>{
    const week=pick(r,"week_ending"),brandId=Number(pick(r,"brand_id")),market=pick(r,"market_id");
    if(!week||!Number.isFinite(brandId)||!market)return;
    const key=week+"|"+brandId+"|"+market;
    let x=mediaMap.get(key);
    if(!x){x={week_ending:week,brand_id:brandId,market_id:market,spend:0,impressions:0,clicks:0,clicks_present:false,attributed_sales:0,sales_present:false,is_planned:false,is_actual:true,is_synthetic_flag:true};mediaMap.set(key,x);}
    x.spend+=number(r,"spend");x.impressions+=number(r,"impressions");
    if(pick(r,"clicks")!==""){x.clicks+=number(r,"clicks");x.clicks_present=true;}
    if(pick(r,"attributed_sales")!==""){x.attributed_sales+=number(r,"attributed_sales");x.sales_present=true;}
    x.is_planned=x.is_planned||bool(r.is_planned,false);
    x.is_actual=x.is_actual&&bool(r.is_actual,false);
    x.is_synthetic_flag=x.is_synthetic_flag||bool(r.is_synthetic_flag,true);
  },progress,"Media_Fact_Weekly.csv");
  const media=[...mediaMap.values()].map(x=>({
    week_ending:x.week_ending,brand_id:x.brand_id,market_id:x.market_id,spend:x.spend,impressions:x.impressions,
    clicks:x.clicks_present?x.clicks:null,attributed_sales:x.sales_present?x.attributed_sales:null,
    is_planned:x.is_planned,is_actual:x.is_actual,is_synthetic_flag:true
  }));
  mediaMap.clear();

  // Keep only market x UPC x snapshot counts. The 1.55M-row store-SKU matrix is never persisted.
  const storeToMarket=new Map<string,string>();
  await scanCsv(storeDictionaryBytes!,r=>{const sid=pick(r,"store_id");const market=pick(r,"market_id");if(sid&&market)storeToMarket.set(sid,market);},progress,"Store_Dictionary.csv");
  const availabilityMap=new Map<string,any>();
  await scanCsv(storesBytes!,r=>{
    const store=pick(r,"store_id"),upc=pick(r,"upc"),week=pick(r,"week_ending"),market=pick(r,"market_id")||storeToMarket.get(store)||"";
    if(!market||!upc||!week)return;
    const key=week+"|"+market+"|"+upc;
    let x=availabilityMap.get(key);
    if(!x){x={week_ending:week,market_id:market,upc,sampled_stores:0,listed_stores:0,in_stock_stores:0,is_synthetic_flag:true};availabilityMap.set(key,x);}
    x.sampled_stores++;if(bool(r.listed,false))x.listed_stores++;if(bool(r.in_stock,false))x.in_stock_stores++;
  },progress,"Store_SKU_Status.csv");
  const availability=[...availabilityMap.values()];

  const expected={distribution:58288,firstPurchase:405,media:517306,availability:952,channels:5};
  const actual={distribution:distribution.length,firstPurchase:firstPurchase.length,media:media.length,availability:availability.length,channels:channels.length};
  const mismatches=Object.keys(expected).filter(k=>(actual as any)[k]!== (expected as any)[k]);
  if(mismatches.length)throw new Error("V5 package validation failed before any database writes. Expected "+JSON.stringify(expected)+"; received "+JSON.stringify(actual)+". Check the selected archive and do not import a partial package.");
  progress("Validated v5 extension inputs: "+distribution.length.toLocaleString()+" distribution rows · "+firstPurchase.length.toLocaleString()+" first-purchase rows · "+media.length.toLocaleString()+" aggregated media rows · "+availability.length.toLocaleString()+" availability counts · "+channels.length+" channels.");

  // The tables are extension-only: do not reset or replace existing CPGist sales tables.
  const reset=await sb.rpc("cpgist_v5_reset_extensions");
  if(reset.error)throw new Error("Could not reset the previous v5 extension layer: "+reset.error.message);
  try{
    await insertBatches(sb,"cpgist_v5_media_channel_dictionary",channels,progress);
    await insertBatches(sb,"cpgist_v5_distribution_efficiency_13w",distribution,progress);
    await insertBatches(sb,"cpgist_v5_first_purchase_share",firstPurchase,progress);
    await insertBatches(sb,"cpgist_v5_media_brand_market_week",media,progress);
    await insertBatches(sb,"cpgist_v5_availability_counts",availability,progress);
    const checks=await Promise.all([
      sb.from("cpgist_v5_distribution_efficiency_13w").select("upc",{count:"exact",head:true}),
      sb.from("cpgist_v5_first_purchase_share").select("brand",{count:"exact",head:true}),
      sb.from("cpgist_v5_media_brand_market_week").select("brand_id",{count:"exact",head:true}),
      sb.from("cpgist_v5_availability_counts").select("upc",{count:"exact",head:true}),
      sb.from("cpgist_v5_media_channel_dictionary").select("channel",{count:"exact",head:true})
    ]);
    const failed=checks.find(x=>x.error);if(failed?.error)throw new Error("V5 extension verification failed: "+failed.error.message);
    if(!checks[0].count||!checks[1].count||!checks[2].count||!checks[3].count||!checks[4].count)throw new Error("V5 extension verification failed: one or more feature tables are empty.");
    progress("V5 extensions verified. Existing core dataset was preserved; only storage-efficient derived tables were added.");
    return {type:"v5-extension",distributionRows:checks[0].count,firstPurchaseRows:checks[1].count,mediaRows:checks[2].count,availabilityRows:checks[3].count,mediaChannels:checks[4].count,estimatedIncrementMiB:100,storageGuardPassed:true};
  }catch(error){
    await sb.rpc("cpgist_v5_reset_extensions");
    throw error;
  }
}
