# CPGist v5 Free-tier extension rollout

## Scope

This change adds v5-derived capabilities on top of the existing CPGist core dataset. The v5 ZIP is recognized by `README_v5_Additions.md`; the importer extracts only the extension inputs and does **not** reset the existing compact sales tables.

## Persisted on Supabase Free

- `cpgist_v5_distribution_efficiency_13w`: 58,288 derived rows for ACTUAL/ALL and latest/prior 13-week windows.
- `cpgist_v5_first_purchase_share`: 405 synthetic-panel-derived rows.
- `cpgist_v5_media_channel_dictionary`: five illustrative channel assumption rows.
- `cpgist_v5_media_brand_market_week`: 483,350 media facts aggregated from channel-level inputs to brand × market × week before storage (package-specific validated count).
- `cpgist_v5_availability_counts`: market × UPC × snapshot counts; the full store × UPC matrix is not persisted.

## Explicitly excluded from permanent Free-tier storage

- Full `Sales_Fact_Weekly` (2.07M rows) and full `baseline_sales` duplicate.
- Full `Store_SKU_Status` matrix.
- Full channel-level `Media_Fact_Weekly` and full panel purchase fact.
- Competitor market-detail cube.

The extension import estimates a conservative 100 MiB increment and calls `cpgist_v5_storage_guard` before writing. It refuses to start if current database size plus that allowance would exceed 420 MiB, leaving 80 MiB below Supabase Free's 500 MB database-size limit. This is a guardrail, not a guarantee against unrelated concurrent database writes.

## User-facing features

- Distribution Efficiency: compares velocity with ACV and peer benchmarks, with modeled weekly opportunity. It does not include logistics, warehousing or servicing costs, so it is not a full cost-to-serve efficiency metric.
- First Purchase Share: synthetic first-observed purchase-count share only. It is not sales/volume share or verified household penetration; true acquisition analysis needs stable household IDs, burn-in and cohort history.
- Media Planning: editable budget, CPM, CTR and ROAS assumptions. This is not product-level Media Readiness until inventory history, digital-shelf conversion, reviews/content quality and competitive pricing inputs are connected.
- Availability Coverage: sampled market/UPC snapshot only. It does not calculate complete category footprint or demand-weighted ACV gaps.

## Rollout

1. Apply migration `20261009090000_cpgist_v5_free_tier_extensions.sql`.
2. Deploy this code branch.
3. Sign in, open Data Import and upload `CPGist_Canonical_Dataset_v5.zip`.
4. Confirm the import result says the core dataset was preserved and the storage guard passed.
5. Open the v5 feature pages and validate row counts/provenance.
6. Check live database size with `select pg_size_pretty(pg_database_size(current_database()));` after import.

All v5 additions are synthetic or derived. They are suitable for demos and logic validation, not real-world customer recommendations.


## Metric-definition alignment (2026-10)

The current extension should be described as a set of **partial analytical proxies**, not as full implementations of the four business concepts. The UI explicitly lists missing evidence and avoids fabricating readiness scores. To complete the concepts, integrate validated household-level purchase history, addressable store/category and demand-weight inputs, product-level inventory/digital-shelf/review/content/price signals, and logistics/servicing cost data. Until those sources are connected, do not present synthetic or modeled outputs as observed commercial outcomes.
