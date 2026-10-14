# CPGist credit system

## Initial policy (proposed defaults)
- Welcome allowance: 10 credits per new Supabase account, once.
- AI Analyst question: 1 credit per request.
- Expiration: none configured.
- Ordinary navigation, dashboards, reports already generated, and credit history are not metered.
- Failed AI-provider/analysis requests refund their reserved credits.
- Checkout, purchased packs, subscriptions, and recurring grants are not active.

The settings are stored in `public.cpgist_credit_settings`, not in browser code. An administrator can use `/admin/credits` after the Supabase Auth user's **app_metadata** includes `{ "role": "admin" }`. Do not put admin privileges in user_metadata. If the role was just set, sign out/in to refresh the JWT.

## Database rollout
Apply migrations `supabase/migrations/20261015090000_cpgist_credit_ledger.sql` and then `supabase/migrations/20261015093000_harden_credit_ledger_grants.sql` to the existing Supabase project before promoting the application code. The second migration removes default PUBLIC/anon grants and leaves authenticated users read-only access to their own account and ledger rows. It creates the ledger, accounts, settings, atomic RPC functions and the one-time signup trigger. Existing accounts are provisioned with a zero balance; the migration does not silently award them a welcome grant. An admin can add a reasoned adjustment.

## Endpoints
- `GET /api/credits`: current authenticated user's balance and last 100 ledger entries.
- `GET/PATCH/POST /api/admin/credits`: admin-only settings, account/ledger review, and atomic balance adjustments.
- `POST /api/analyst`: reserves credits before analysis, charges only the configured AI Analyst operation, and refunds reserved credits if analysis fails.

All credit RPCs derive identity from the verified Supabase JWT. Ledger writes and balances are not client-editable. Reservation is serialized by locking the account row and each request includes an idempotency key.

## Website-to-app authentication
The application currently uses Supabase Auth with a browser-persisted Supabase JS session and bearer-token API calls. A shared Supabase project provides one identity, but cross-domain cookie/session sharing requires the actual marketing website hostname and its implementation to be wired up. Configure `NEXT_PUBLIC_MARKETING_SITE_URL` only after confirming the company website URL; do not guess the production domain. OAuth redirect allow-lists must include the exact canonical app callback/destination.
