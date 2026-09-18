#!/usr/bin/env python3
import csv,io,json,os,sys,zipfile
from collections import defaultdict
from urllib.request import Request,urlopen
ZIP_PATH=sys.argv[1] if len(sys.argv)>1 else "Syndicate data.zip"
URL=os.environ["SUPABASE_URL"].rstrip("/");KEY=os.environ["SUPABASE_KEY"]
HEAD={"apikey":KEY,"Authorization":"Bearer "+KEY,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"}
def post(table,rows,chunk=500):
 for i in range(0,len(rows),chunk):
  req=Request(URL+"/rest/v1/"+table,data=json.dumps(rows[i:i+chunk]).encode(),headers=HEAD,method="POST")
  with urlopen(req) as r:
   if r.status>=300: raise RuntimeError(table+" HTTP "+str(r.status))
def read_csv(z,name):
 with z.open(name) as f:return csv.DictReader(io.TextIOWrapper(f,encoding="utf-8",newline=""))
def main():
 with zipfile.ZipFile(ZIP_PATH) as z:
  brands=[{"id":int(r["id"]),"name":r["name"],"category":r["category"],"parent_company":r["parent_company"] or None,"home_regions":r["home_regions"] or None} for r in read_csv(z,"brands.csv")]
  retailers=[{"id":int(r["id"]),"name":r["name"],"channel":r["channel"],"region":r["region"],"total_stores":int(r["total_stores"])} for r in read_csv(z,"retailers.csv")]
  products=[{"id":int(r["id"]),"brand_id":int(r["brand_id"]),"name":r["name"],"category":r["category"],"subcategory":r["subcategory"],"size":r["size"]} for r in read_csv(z,"products.csv")]
  post("syndicate_brands",brands);post("syndicate_retailers",retailers);post("syndicate_products",products)
  brand_of={p["id"]:p["brand_id"] for p in products};cat_of={p["id"]:p["category"] for p in products};brand_cat={b["id"]:b["category"] for b in brands}
  bw=defaultdict(lambda:[0.,0.,0.,0.]);cw=defaultdict(lambda:[0.,0.,0.,0]);rw=defaultdict(lambda:[0.,0.,0.,0])
  for r in read_csv(z,"sales_facts.csv"):
   pid=int(r["product_id"]);rid=int(r["retailer_id"]);w=r["week_ending"];s=float(r["dollar_sales"]);u=float(r["units"]);d=float(r["acv_distribution"] or 0)
   k=(brand_of[pid],w);x=bw[k];x[0]+=s;x[1]+=u;x[2]+=d;x[3]+=1
   k=(cat_of[pid],w);x=cw[k];x[0]+=s;x[1]+=u;x[2]+=d;x[3]+=1
   k=(rid,w);x=rw[k];x[0]+=s;x[1]+=u;x[2]+=d;x[3]+=1
  post("syndicate_sales_weekly",[{"brand_id":k[0],"category":brand_cat[k[0]],"week_ending":k[1],"dollar_sales":v[0],"units":v[1],"acv_distribution":v[2]/v[3],"promo_observations":0,"avg_discount_depth_pct":0} for k,v in bw.items()])
  post("syndicate_category_weekly",[{"category":k[0],"week_ending":k[1],"dollar_sales":v[0],"units":v[1],"acv_distribution":v[2]/v[3]} for k,v in cw.items()])
  post("syndicate_retailer_weekly",[{"retailer_id":k[0],"week_ending":k[1],"dollar_sales":v[0],"units":v[1],"acv_distribution":v[2]/v[3]} for k,v in rw.items()])
  print("Imported",len(brands),"brands,",len(retailers),"retailers,",len(products),"products,",len(bw),"brand-weeks,",len(cw),"category-weeks and",len(rw),"retailer-weeks.")
if __name__=="__main__":main()
