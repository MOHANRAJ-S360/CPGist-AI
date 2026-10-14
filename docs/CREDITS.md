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
Apply migrations `supabase/migrations/20261015090000_cpgist_credit_ledger.sql` then `supabase/migrations/20261015093000_harden_credit_ledger_grants.sql`, then `supabase/migrations/20261015100000_credit_operation_history.sql`, then `supabase/migrations/20261015110000_user_workspace_provisioning.sql`, then `supabase/migrations/20261015120000_scope_experiments.sql`, then `supabase/migrations/20261015130000_restrict_anon_rpc_execution.sql`, and finally `supabase/migrations/20261015140000_restrict_public_view_access.sql` to the existing Supabase project before promoting the application code. The second migration removes default PUBLIC/anon grants and leaves authenticated users read-only access to their own account and ledger rows. It creates the ledger, accounts, settings, atomic RPC functions and the one-time signup trigger. Existing accounts are provisioned with a zero balance; the migration does not silently award them a welcome grant. An admin can add a reasoned adjustment.

## Endpoints
- `GET /api/credits`: current authenticated user's balance and last 100 ledger entries.
- `GET/PATCH/POST /api/admin/credits`: admin-only settings, account/ledger review, and atomic balance adjustments.
- `POST /api/analyst`: reserves credits before analysis, charges only the configured AI Analyst operation, and refunds reserved credits if analysis fails.

All credit RPCs derive identity from the verified Supabase JWT. Ledger writes and balances are not client-editable. Reservation is serialized by locking the account row and each request includes an idempotency key.

## Website-to-app authentication
The existing marketing site is `https://cpgist-website.vercel.app`. Its Launch App / Create account CTAs send visitors to `https://cpgistai.vercel.app`, where all signup and sign-in is handled by the same Supabase Auth project; the marketing site does not maintain a second password/session system. `NEXT_PUBLIC_MARKETING_SITE_URL` is configured for the workspace return link. The browser client now uses PKCE so OAuth returns a one-time code rather than access tokens in a URL. Supabase Auth URL Configuration must allow `https://cpgistai.vercel.app/dashboard` and `https://cpgistai.vercel.app/reset-password` (plus any required local preview redirects).


## Protected API routes\nThe workspace, explorer, advanced analytics, V5 insights, A/B testing, and legacy ingestion APIs now verify the Supabase bearer token server-side. Legacy ingestion also verifies membership in the submitted organization. The experiment API scopes saved experiment rows to the authenticated user. The 17 legacy security-definer analytics views have direct `anon`/`authenticated` table grants revoked; only the server `service_role` can query them. The two destructive/rebuild RPCs used by signed-in import flows no longer execute for anonymous users.\n\n## Existing experiments table note
The legacy `public.cpgist_experiments` table still has RLS disabled. This rollout removes direct anon/authenticated table grants and scopes the server API by `created_by`, but it does not enable RLS because a separate policy design is required. Do not restore direct client grants until owner-scoped RLS policies are defined.
