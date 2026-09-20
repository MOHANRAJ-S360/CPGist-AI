import { unzipSync, strFromU8 } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, string>;
type Progress = (message: string) => void;

function parseSmall(bytes: Uint8Array): Row[] {
  const text = strFromU8(bytes);
  const out: Row[] = [];
  let row: string[] = [], cell = "", quoted = false;
  const rows: string[][] = [];
  const flush = () => { row.push(cell); cell = ""; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) flush();
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      flush();
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) { flush(); if (row.some(Boolean)) rows.push(row); }
  const headers = rows.shift() ?? [];
  for (const values of rows) {
    const r: Row = {};
    headers.forEach((h, i) => { r[h] = values[i] ?? ""; });
    out.push(r);
  }
  return out;
}

function field(bytes: Uint8Array, start: number, end: number, decoder: TextDecoder) {
  let s = decoder.decode(bytes.subarray(start, end));
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') s = s.slice(1, -1).replace(/""/g, '"');
  return s;
}

async function aggregateSales(
  bytes: Uint8Array,
  productMap: Map<number, { brand: number; category: string }>,
  progress: Progress
) {
  const decoder = new TextDecoder();
  let row: string[] = [], headers: string[] = [], quoted = false, start = 0;
  let headerDone = false, salesRows = 0;
  let brand: Map<string, any> = new Map(), category: Map<string, any> = new Map(), retailer: Map<string, any> = new Map(), brandRetailer: Map<string, any> = new Map();

  const consume = (values: string[]) => {
    if (!headerDone) { headers = values; headerDone = true; return; }
    if (!values.length || !values[0]) return;
    salesRows++;
    const productId = Number(values[headers.indexOf("product_id")]);
    const p = productMap.get(productId);
    if (!p) return;
    const week = values[headers.indexOf("week_ending")];
    const sales = Number(values[headers.indexOf("dollar_sales")]) || 0;
    const units = Number(values[headers.indexOf("units")]) || 0;
    const dist = Number(values[headers.indexOf("acv_distribution")]) || 0;
    const promo = /^(true|1|yes)$/i.test(values[headers.indexOf("on_promo")]);
    const discount = Number(values[headers.indexOf("discount_depth_pct")]) || 0;
    const retailerId = Number(values[headers.indexOf("retailer_id")]);

    const bk = p.brand + "|" + week;
    const b = brand.get(bk) ?? { brand_id: p.brand, category: p.category, week_ending: week, dollar_sales: 0, units: 0, dist: 0, observations: 0, promo_observations: 0, discount_sum: 0 };
    b.dollar_sales += sales; b.units += units; b.dist += dist; b.observations++; b.promo_observations += promo ? 1 : 0; b.discount_sum += discount; brand.set(bk, b);

    const ck = p.category + "|" + week;
    const c = category.get(ck) ?? { category: p.category, week_ending: week, dollar_sales: 0, units: 0, dist: 0, n: 0 };
    c.dollar_sales += sales; c.units += units; c.dist += dist; c.n++; category.set(ck, c);

    const rk = retailerId + "|" + week;
    const r = retailer.get(rk) ?? { retailer_id: retailerId, week_ending: week, dollar_sales: 0, units: 0, dist: 0, n: 0 };
    r.dollar_sales += sales; r.units += units; r.dist += dist; r.n++; retailer.set(rk, r);

    const brk = p.brand + "|" + retailerId + "|" + p.category;
    const br = brandRetailer.get(brk) ?? { brand_id: p.brand, retailer_id: retailerId, category: p.category, sales: 0, units: 0, dist: 0, discount_sum: 0, observations: 0 };
    br.sales += sales; br.units += units; br.dist += dist; br.discount_sum += discount; br.observations++;
    brandRetailer.set(brk, br);
  };

  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 34) {
      if (quoted && bytes[i + 1] === 34) i++;
      else quoted = !quoted;
    } else if (c === 44 && !quoted) {
      row.push(field(bytes, start, i, decoder)); start = i + 1;
    } else if ((c === 10 || c === 13) && !quoted) {
      if (c === 13 && bytes[i + 1] === 10) i++;
      row.push(field(bytes, start, i, decoder)); start = i + 1;
      consume(row); row = [];
      if (salesRows && salesRows % 25000 === 0) {
        progress(`Processed ${salesRows.toLocaleString()} / 1,515,488 source observations…`);
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }
  if (start < bytes.length || row.length) { row.push(field(bytes, start, bytes.length, decoder)); consume(row); }

  progress(`Aggregation complete: ${salesRows.toLocaleString()} source observations.`);
  return {
    salesRows,
    brandWeeks: [...brand.values()].map(x => ({ brand_id: x.brand_id, category: x.category, week_ending: x.week_ending, dollar_sales: x.dollar_sales, units: x.units, acv_distribution: x.dist / x.observations, promo_observations: x.promo_observations, avg_discount_depth_pct: x.discount_sum / x.observations, observations: x.observations })),
    categoryWeeks: [...category.values()].map(x => ({ category: x.category, week_ending: x.week_ending, dollar_sales: x.dollar_sales, units: x.units, acv_distribution: x.dist / x.n })),
    retailerWeeks: [...retailer.values()].map(x => ({ retailer_id: x.retailer_id, week_ending: x.week_ending, dollar_sales: x.dollar_sales, units: x.units, acv_distribution: x.dist / x.n })),
    brandRetailer: [...brandRetailer.values()].map(x => ({ brand_id: x.brand_id, retailer_id: x.retailer_id, category: x.category, sales: x.sales, units: x.units, distribution: x.observations ? x.dist / x.observations : 0, discount_depth_pct: x.observations ? x.discount_sum / x.observations : 0, observations: x.observations }))
  };
}

async function upsertBatches(sb: SupabaseClient, table: string, rows: any[], conflict: string, progress: Progress) {
  const size = 500;
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    let last = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await sb.from(table).upsert(batch, { onConflict: conflict });
      if (!error) { last = ""; break; }
      last = error.message;
      if (attempt < 4) await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
    }
    if (last) throw new Error(`${table}: ${last}`);
    if (i % (size * 10) === 0 || i + size >= rows.length) progress(`Loading ${table}: ${Math.min(i + size, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}…`);
  }
}

export async function importSyndicateZip(sb: SupabaseClient, file: File, progress: Progress) {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Please select the Syndicate ZIP file.");
  if (file.size > 50 * 1024 * 1024) throw new Error("The ZIP is larger than the 50 MB import limit.");
  progress("Reading ZIP in your browser — no 1.5M-row payload is sent to an Edge Function…");
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const required = ["brands.csv","retailers.csv","products.csv","sales_facts.csv","brand_relationships.csv","signal_notes.csv","competitor_signals.csv"];
  for (const name of required) if (!zip[name]) throw new Error(`ZIP is missing ${name}.`);

  progress("Loading brand, retailer and product dimensions…");
  const brands = parseSmall(zip["brands.csv"]).map(r => ({ id: +r.id, name: r.name, category: r.category || null, parent_company: r.parent_company || null, home_regions: r.home_regions || null }));
  const retailers = parseSmall(zip["retailers.csv"]).map(r => ({ id: +r.id, name: r.name, channel: r.channel || null, region: r.region || null, total_stores: +r.total_stores || 0 }));
  const products = parseSmall(zip["products.csv"]).map(r => ({ id: +r.id, brand_id: +r.brand_id, name: r.name, category: r.category || null, subcategory: r.subcategory || null, size: r.size || null }));
  if (brands.length !== 110 || retailers.length !== 200 || products.length !== 440) throw new Error(`Unexpected dimensions: ${brands.length} brands, ${retailers.length} retailers, ${products.length} products.`);

  await upsertBatches(sb, "syndicate_brands", brands, "id", progress);
  await upsertBatches(sb, "syndicate_retailers", retailers, "id", progress);
  await upsertBatches(sb, "syndicate_products", products, "id", progress);

  const productMap = new Map<number, { brand: number; category: string }>();
  products.forEach(p => productMap.set(p.id, { brand: p.brand_id, category: p.category || "Unclassified" }));
  progress("Aggregating sales locally by brand-week, category-week and retailer-week…");
  const agg = await aggregateSales(zip["sales_facts.csv"], productMap, progress);
  if (agg.salesRows !== 1515488) throw new Error(`Sales validation failed: found ${agg.salesRows.toLocaleString()} rows, expected 1,515,488.`);

  await upsertBatches(sb, "syndicate_sales_weekly", agg.brandWeeks, "brand_id,week_ending", progress);
  await upsertBatches(sb, "syndicate_category_weekly", agg.categoryWeeks, "category,week_ending", progress);
  await upsertBatches(sb, "syndicate_retailer_weekly", agg.retailerWeeks, "retailer_id,week_ending", progress);
  await upsertBatches(sb, "syndicate_brand_retailer", agg.brandRetailer, "brand_id,retailer_id,category", progress);

  progress("Loading competitive relationships and intelligence signals…");
  await upsertBatches(sb, "syndicate_brand_relationships", parseSmall(zip["brand_relationships.csv"]).map(r => ({ id:+r.id, brand_id:+r.brand_id, related_brand_id:+r.related_brand_id, relationship_type:r.relationship_type || null, category:r.category || null, overlapping_regions:r.overlapping_regions || null, org_id:+r.org_id || null })), "id", progress);
  await upsertBatches(sb, "syndicate_signal_notes", parseSmall(zip["signal_notes.csv"]).map(r => ({ id:+r.id, brand_id:+r.brand_id, category:r.category || null, retailer_id:+r.retailer_id, region:r.region || null, date_start:r.date_start || null, date_end:r.date_end || null, note_type:r.note_type || null, note_text:r.note_text || null, org_id:+r.org_id || null })), "id", progress);
  await upsertBatches(sb, "syndicate_competitor_signals", parseSmall(zip["competitor_signals.csv"]).map(r => ({ id:+r.id, brand_id:+r.brand_id, category:r.category || null, retailer_id:+r.retailer_id, region:r.region || null, signal_date:r.signal_date || null, signal_type:r.signal_type || null, magnitude_pct:+r.magnitude_pct || 0, description:r.description || null, org_id:+r.org_id || null })), "id", progress);

  return { brands: brands.length, retailers: retailers.length, products: products.length, salesRows: agg.salesRows, brandWeeks: agg.brandWeeks.length, categoryWeeks: agg.categoryWeeks.length, retailerWeeks: agg.retailerWeeks.length, brandRetailer: agg.brandRetailer.length };
}


function pickZipEntry(zip: Record<string, Uint8Array>, patterns: RegExp[]): Uint8Array | null {
  const key = Object.keys(zip).find(k => patterns.some(p => p.test(k)));
  return key ? zip[key] : null;
}
function pickRow(row: Row, ...names: string[]) {
  for (const name of names) if (row[name] !== undefined && row[name] !== "") return row[name];
  return "";
}
function rowsToRecords(bytes: Uint8Array) { return parseSmall(bytes); }
function numField(row: Row, ...names: string[]) { const v = Number(pickRow(row, ...names)); return Number.isFinite(v) ? v : 0; }

async function importCompactDatasetZip(sb: SupabaseClient, zip: Record<string, Uint8Array>, progress: Progress) {
  const brandBytes = pickZipEntry(zip, [/(^|[/_])brands\.csv$/i]);
  const retailerBytes = pickZipEntry(zip, [/(^|[/_])retailers\.csv$/i]);
  const productBytes = pickZipEntry(zip, [/(^|[/_])products\.csv$/i]);
  const categoryBytes = pickZipEntry(zip, [/(^|[/_])categories\.csv$/i]);
  const regionBytes = pickZipEntry(zip, [/(^|[/_])(regions|locations)\.csv$/i]);
  const brandWeekBytes = pickZipEntry(zip, [/brand_weekly\.csv$/i]);
  const categoryWeekBytes = pickZipEntry(zip, [/category_weekly\.csv$/i]);
  const retailerWeekBytes = pickZipEntry(zip, [/retailer_weekly\.csv$/i]);
  const brandRetailerWeekBytes = pickZipEntry(zip, [/brand_retailer_weekly\.csv$/i]);
  const brandCategoryWeekBytes = pickZipEntry(zip, [/brand_category_weekly\.csv$/i]);
  const productWeekBytes = pickZipEntry(zip, [/product_weekly\.csv$/i]);
  const competitorWeekBytes = pickZipEntry(zip, [/competitor_weekly\.csv$/i]);

  if (!brandBytes || !retailerBytes || !productBytes || !brandWeekBytes || !categoryWeekBytes || !retailerWeekBytes) {
    throw new Error("This ZIP is not a supported CPGist Free Dataset. Required compact files were not found (brands, retailers, products, brand_weekly, category_weekly, retailer_weekly).");
  }

  progress("Detected the CPGist compact dataset. Loading master dimensions…");
  const br = rowsToRecords(brandBytes);
  const brands = br.map(r => ({
    id: numField(r, "id", "brand_id"), name: pickRow(r, "name", "brand_name"),
    category: pickRow(r, "category", "category_name") || null,
    parent_company: pickRow(r, "parent_company", "parent_company_name") || null,
    home_regions: pickRow(r, "home_regions", "home_region", "region") || null,
    portfolio: pickRow(r, "portfolio", "portfolio_name") || null
  })).filter(x => x.id && x.name);
  const rr = rowsToRecords(retailerBytes);
  const retailers = rr.map(r => ({
    id: numField(r, "id", "retailer_id"), name: pickRow(r, "name", "retailer_name"),
    channel: pickRow(r, "channel", "channel_name") || null, region: pickRow(r, "region", "region_name") || null,
    retailer_group: pickRow(r, "retailer_group", "retailer_group_name", "group_name") || null,
    total_stores: numField(r, "total_stores", "store_count")
  })).filter(x => x.id && x.name);
  const pr = rowsToRecords(productBytes);
  const products = pr.map(r => ({
    id: numField(r, "id", "product_id", "sku_id"), brand_id: numField(r, "brand_id"),
    name: pickRow(r, "name", "product_name", "sku_name") || "Unnamed product",
    sku: pickRow(r, "sku", "sku_code", "product_code") || null,
    category: pickRow(r, "category", "category_name") || null,
    subcategory: pickRow(r, "subcategory", "subcategory_name") || null,
    size: pickRow(r, "size", "pack_size") || null, pack_count: numField(r, "pack_count")
  })).filter(x => x.id && x.name);
  const categories = categoryBytes ? rowsToRecords(categoryBytes).map(r => ({
    id: numField(r, "id", "category_id"), name: pickRow(r, "name", "category_name"), parent_category: pickRow(r, "parent_category","parent_category_name") || null, subcategory_count: numField(r,"subcategory_count")
  })).filter(x=>x.id&&x.name) : [];
  const regions = regionBytes ? rowsToRecords(regionBytes).map(r => ({
    id: numField(r, "id","region_id","location_id"), name: pickRow(r,"name","region_name","location_name"), country: pickRow(r,"country","country_name")||null, region_group: pickRow(r,"region_group","region_group_name")||null
  })).filter(x=>x.id&&x.name) : [];

  progress(`Master dimensions: ${brands.length} brands · ${retailers.length} retailers · ${products.length} products.`);
  await upsertBatches(sb,"cpgist_brands",brands,"id",progress);
  await upsertBatches(sb,"cpgist_retailers",retailers,"id",progress);
  await upsertBatches(sb,"cpgist_products",products,"id",progress);
  if (categories.length) await upsertBatches(sb,"cpgist_categories",categories,"id",progress);
  if (regions.length) await upsertBatches(sb,"cpgist_regions",regions,"id",progress);

  const mapBrandWeek = (bytes: Uint8Array) => rowsToRecords(bytes).map(r => ({
    brand_id:numField(r,"brand_id"), week_ending:pickRow(r,"week_ending","period","week"), category:pickRow(r,"category","category_name")||null,
    sales:numField(r,"sales","dollar_sales","sales_value"), units:numField(r,"units","volume_units"),
    distribution:numField(r,"distribution","acv_distribution","weighted_distribution"), avg_price:numField(r,"avg_price","price","average_price")||null,
    promo_rate:numField(r,"promo_rate","promo_rate_pct","promotion_rate")||null
  })).filter(x=>x.brand_id&&x.week_ending);
  const mapCategoryWeek = (bytes: Uint8Array) => rowsToRecords(bytes).map(r => ({
    category:pickRow(r,"category","category_name"),week_ending:pickRow(r,"week_ending","period","week"),
    sales:numField(r,"sales","dollar_sales","sales_value"),units:numField(r,"units","volume_units"),distribution:numField(r,"distribution","acv_distribution","weighted_distribution")
  })).filter(x=>x.category&&x.week_ending);
  const mapRetailerWeek = (bytes: Uint8Array) => rowsToRecords(bytes).map(r => ({
    retailer_id:numField(r,"retailer_id","id"),week_ending:pickRow(r,"week_ending","period","week"),
    sales:numField(r,"sales","dollar_sales","sales_value"),units:numField(r,"units","volume_units"),distribution:numField(r,"distribution","acv_distribution","weighted_distribution")
  })).filter(x=>x.retailer_id&&x.week_ending);

  progress("Loading compact weekly analytical tables (raw fact files are intentionally not copied into Postgres).");
  const bw=mapBrandWeek(brandWeekBytes), cw=mapCategoryWeek(categoryWeekBytes), rw=mapRetailerWeek(retailerWeekBytes);
  await upsertBatches(sb,"cpgist_brand_weekly",bw,"brand_id,week_ending",progress);
  await upsertBatches(sb,"cpgist_category_weekly",cw,"category,week_ending",progress);
  await upsertBatches(sb,"cpgist_retailer_weekly",rw,"retailer_id,week_ending",progress);

  if (brandRetailerWeekBytes) {
    const rows=rowsToRecords(brandRetailerWeekBytes).map(r=>({
      brand_id:numField(r,"brand_id"),retailer_id:numField(r,"retailer_id"),category:pickRow(r,"category","category_name")||null,
      week_ending:pickRow(r,"week_ending","period","week"),sales:numField(r,"sales","dollar_sales","sales_value"),units:numField(r,"units","volume_units"),
      distribution:numField(r,"distribution","acv_distribution"),price:numField(r,"price","avg_price","average_price")||null,promo_rate:numField(r,"promo_rate","promotion_rate")||null
    })).filter(x=>x.brand_id&&x.retailer_id&&x.week_ending);
    await upsertBatches(sb,"cpgist_brand_retailer_weekly",rows,"brand_id,retailer_id,week_ending",progress);
  }
  let productWeekCount=0;
  if (productWeekBytes) {
    const productWeekSource=rowsToRecords(productWeekBytes);
    productWeekCount=productWeekSource.length;
    const rows=productWeekSource.map(r=>({
      product_id:numField(r,"product_id","id","sku_id"), brand_id:numField(r,"brand_id"), retailer_id:numField(r,"retailer_id"),
      week_ending:pickRow(r,"week_ending","period","week"),
      sales:numField(r,"sales","dollar_sales","sales_value"), units:numField(r,"units","volume_units"),
      price:numField(r,"price","avg_price","average_price")||null,
      distribution:numField(r,"distribution","acv_distribution","weighted_distribution")||null,
      promo_rate:numField(r,"promo_rate","promo_rate_pct","promotion_rate")||null
    })).filter(x=>x.product_id&&x.retailer_id&&x.week_ending);
    await upsertBatches(sb,"cpgist_product_weekly",rows,"product_id,retailer_id,week_ending",progress);
  }
  if (brandCategoryWeekBytes) {
    const rows=rowsToRecords(brandCategoryWeekBytes).map(r=>({
      brand_id:numField(r,"brand_id"),category:pickRow(r,"category","category_name"),week_ending:pickRow(r,"week_ending","period","week"),
      sales:numField(r,"sales","dollar_sales","sales_value"),units:numField(r,"units","volume_units"),distribution:numField(r,"distribution","acv_distribution")
    })).filter(x=>x.brand_id&&x.category&&x.week_ending);
    await upsertBatches(sb,"cpgist_brand_category_weekly",rows,"brand_id,category,week_ending",progress);
  }
  if (competitorWeekBytes) {
    const rows=rowsToRecords(competitorWeekBytes).map(r=>({
      brand_id:numField(r,"brand_id"),competitor_id:numField(r,"competitor_id","competitor_brand_id"),week_ending:pickRow(r,"week_ending","period","week"),
      category:pickRow(r,"category","category_name")||null,sales:numField(r,"sales","dollar_sales","sales_value"),units:numField(r,"units","volume_units"),
      price:numField(r,"price","avg_price","average_price")||null,share:numField(r,"share","market_share","share_pct")||null
    })).filter(x=>x.week_ending&&x.competitor_id);
    await upsertBatches(sb,"cpgist_competitor_weekly",rows,"brand_id,competitor_id,week_ending",progress);
  }

  return {type:"compact",brands:brands.length,retailers:retailers.length,products:products.length,categories:categories.length,regions:regions.length,brandWeeks:bw.length,categoryWeeks:cw.length,retailerWeeks:rw.length,productWeeks:productWeekBytes ? rowsToRecords(productWeekBytes).length : 0};
}

export async function importDatasetZip(sb: SupabaseClient, file: File, progress: Progress) {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Please select a CPGist dataset ZIP file.");
  if (file.size > 100 * 1024 * 1024) throw new Error("The CPGist Free Dataset ZIP must be 100 MB or smaller for browser import.");
  progress("Reading dataset ZIP in your browser…");
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const names=Object.keys(zip);
  if (names.some(n=>/brand_weekly\.csv$/i.test(n)) && names.some(n=>/category_weekly\.csv$/i.test(n))) return importCompactDatasetZip(sb,zip,progress);
  return importSyndicateZip(sb,file,progress);
}
