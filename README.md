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


## Razorpay subscriptions (feature branch only)

The billing integration supports Pro and Growth subscriptions; Enterprise remains a contact-sales flow. Create matching monthly plans in Razorpay Dashboard and configure their plan IDs. Start with Razorpay Test Mode credentials.

Required server environment:
- RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET
- RAZORPAY_WEBHOOK_SECRET
- RAZORPAY_PLAN_PRO_ID and RAZORPAY_PLAN_GROWTH_ID
- CPGIST_PRO_MONTHLY_AI_LIMIT and CPGIST_GROWTH_MONTHLY_AI_LIMIT (agreed positive-integer monthly analysis limits)
- SUPABASE_SERVICE_ROLE_KEY (server-only; never expose to browser code)

Configure the webhook URL as https://YOUR-AI-APP-DOMAIN/api/billing/webhook and subscribe to subscription lifecycle events: activated, charged, pending, halted, paused, resumed, cancelled, and completed. The webhook secret must be separate from the API key secret.

Before production:
1. Apply versioned migrations to a local/test Supabase database first.
2. Confirm Pro/Growth monthly AI limits and configure them in the server environment.
3. Test successful, failed, dismissed, duplicate-webhook, cancelled, halted, and expired subscription paths with Razorpay Test Mode.
4. Verify paid access is granted only after a verified active subscription and failed AI analyses release their own reservation.
5. Review migration and build/test output before merging or deploying. Do not apply the migration to production as part of this setup.


Confirmed monthly AI analysis allowances:
- Free: 3 successfully completed analyses total.
- Pro: 300 successfully completed analyses per billing month.
- Growth: 1,500 successfully completed analyses per billing month.
- Enterprise: custom contract and limit.

Paid checkout is fail-closed by default. Keep `BILLING_CHECKOUT_ENABLED=false` until Razorpay Test Mode, webhook replay/idempotency, subscription lifecycle, database migration, quota concurrency, and failed-analysis reservation-release tests all pass. Setting plan limits alone does not enable checkout.
