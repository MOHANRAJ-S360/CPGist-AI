# AI Analyst free-tier quota

This change adds a server-enforced quota to the existing Supabase-authenticated AI Analyst.

## Behavior
- Each Supabase account receives 3 successfully completed AI Analyst requests.
- The API reserves a slot atomically before starting an analysis. Concurrent requests cannot reserve more than the remaining quota.
- A successful response increments the completed count.
- An upstream/model/API failure releases the reservation and does not consume a completed analysis.
- The API returns `usage: { completed, limit, remaining }` on successful analyses.
- After the quota is exhausted, the API returns HTTP 402 with `upgradeRequired: true`. The UI explains that paid checkout is not enabled yet; it does not pretend to accept payment.

## Required deployment step
Apply `supabase/migrations/20261014090000_cpgist_ai_free_usage.sql` to the Supabase project used by CPGist-AI before deploying the app. No new environment variables are introduced.

## Important scope
This change intentionally does not claim to complete cross-site single sign-on or paid subscriptions. The main CPGist website currently uses its own FastAPI/MongoDB cookie session, while CPGist-AI uses Supabase Auth bearer tokens. A secure SSO implementation requires an agreed identity authority and a verified token/session exchange between those systems. Paid access requires choosing and configuring a payment provider and verifying its webhook server-side. Neither is simulated here.
