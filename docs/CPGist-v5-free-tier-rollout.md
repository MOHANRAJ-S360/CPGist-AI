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

- Distribution Efficiency: ACTUAL default, ACTUAL/ALL anchor, L13W/P13W, category/geography/quadrant filters, clearly labelled lost-sales estimates.
- First Purchase Share: first-observed only; synthetic and closed-cohort limitations shown.
- Media Readiness: editable budget, CPM, CTR and ROAS assumptions; results labelled scenario estimates.
- Availability Coverage: sampled market/UPC snapshot only, not a complete all-market availability gap.

## Rollout

1. Apply migration `20261009090000_cpgist_v5_free_tier_extensions.sql`.
2. Deploy this code branch.
3. Sign in, open Data Import and upload `CPGist_Canonical_Dataset_v5.zip`.
4. Confirm the import result says the core dataset was preserved and the storage guard passed.
5. Open the v5 feature pages and validate row counts/provenance.
6. Check live database size with `select pg_size_pretty(pg_database_size(current_database()));` after import.

All v5 additions are synthetic or derived. They are suitable for demos and logic validation, not real-world customer recommendations.
