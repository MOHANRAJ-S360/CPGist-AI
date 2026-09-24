# CPGist

AI-powered CPG intelligence platform.

## MVP foundation
- Executive dashboard
- KPI cards and sales trend
- Brand performance
- AI Pulse
- AI Analyst entry point
- Groq-compatible API route

## Run
npm install
cp .env.example .env.local
npm run dev

Add GROQ_API_KEY to enable live AI.

## CPGist data model
The application supports the reduced CPGist Free Dataset through the compact `cpgist_*` analytical tables. The UI falls back to the legacy Syndicate tables until the compact dataset is imported.

Clean production build trigger after error-boundary fix.

Build stabilization: restored the known-good Analyst server route.

Importer reference fix.


<!-- CPGist production verification: compact dataset explorer/import + brand workspace hardening -->


## Advanced analytics layer
The extended combined dataset can now populate:
- actual vs synthetic provenance through `is_actual`
- promotion-event economics: incremental sales, incremental margin and ROI
- SKU growth from product-week time series with same-status period comparisons
- observed category context from `category_aggregates`
- retailer-channel rollups
- gross-margin / P&L diagnostics
- launch performance from `launch_date` and `trial_repeat.csv`
- clearly labeled synthetic household-panel penetration/frequency
- clearly labeled illustrative synthetic macro overlays

The browser importer keeps the compact analytical layer in Supabase and derives product-week, brand-retailer-week and panel-week aggregates rather than loading unnecessary raw cubes. Advanced reports expose an explicit actual/projected coverage label whenever a view contains synthetic weeks.

AI Analyst tool descriptions now route promotion ROI, SKU growth, category context, channel, margin, launch, synthetic panel and macro-overlay questions to controlled analytical functions.
