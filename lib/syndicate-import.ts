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
  let brand: Map<string, any> = new Map(), category: Map<string, any> = new Map(), retailer: Map<string, any> = new Map();

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
    retailerWeeks: [...retailer.values()].map(x => ({ retailer_id: x.retailer_id, week_ending: x.week_ending, dollar_sales: x.dollar_sales, units: x.units, acv_distribution: x.dist / x.n }))
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

  progress("Loading competitive relationships and intelligence signals…");
  await upsertBatches(sb, "syndicate_brand_relationships", parseSmall(zip["brand_relationships.csv"]).map(r => ({ id:+r.id, brand_id:+r.brand_id, related_brand_id:+r.related_brand_id, relationship_type:r.relationship_type || null, category:r.category || null, overlapping_regions:r.overlapping_regions || null, org_id:+r.org_id || null })), "id", progress);
  await upsertBatches(sb, "syndicate_signal_notes", parseSmall(zip["signal_notes.csv"]).map(r => ({ id:+r.id, brand_id:+r.brand_id, category:r.category || null, retailer_id:+r.retailer_id, region:r.region || null, date_start:r.date_start || null, date_end:r.date_end || null, note_type:r.note_type || null, note_text:r.note_text || null, org_id:+r.org_id || null })), "id", progress);
  await upsertBatches(sb, "syndicate_competitor_signals", parseSmall(zip["competitor_signals.csv"]).map(r => ({ id:+r.id, brand_id:+r.brand_id, category:r.category || null, retailer_id:+r.retailer_id, region:r.region || null, signal_date:r.signal_date || null, signal_type:r.signal_type || null, magnitude_pct:+r.magnitude_pct || 0, description:r.description || null, org_id:+r.org_id || null })), "id", progress);

  return { brands: brands.length, retailers: retailers.length, products: products.length, salesRows: agg.salesRows, brandWeeks: agg.brandWeeks.length, categoryWeeks: agg.categoryWeeks.length, retailerWeeks: agg.retailerWeeks.length };
}
