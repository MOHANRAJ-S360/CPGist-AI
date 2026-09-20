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
