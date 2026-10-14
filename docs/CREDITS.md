# CPGist credit system

## Initial policy (proposed defaults)
- Welcome allowance: configurable; currently set to 0 and disabled until the business approves an amount. Grant only after Supabase confirms the email, once per eligible account.
- AI Analyst question: 1 credit per request (admin can configure a positive integer cost).
- Expiration: none configured.
- Ordinary navigation, dashboards, reports already generated, and credit history are not metered.
- Failed AI-provider/analysis requests refund their reserved credits.
- Checkout, purchased packs, subscriptions, and recurring grants are not active. Do not collect payments until the provider, products, prices, and required configuration are approved.

The settings are stored in `public.cpgist_credit_settings`, not in browser code. The current safe default is `welcome_credits = 0` and `welcome_grant_enabled = false`; configure and enable only after the welcome amount is approved. An administrator can use `/admin/credits` after the Supabase Auth user's **app_metadata** includes `{ "role": "admin" }`. Do not put admin privileges in user_metadata. If the role was just set, sign out/in to refresh the JWT.

## Database rollout
Apply the credit migrations in timestamp order to the existing Supabase project before promoting the application code:

1. `20261015090000_cpgist_credit_ledger.sql`
2. `20261015093000_harden_credit_ledger_grants.sql`
3. `20261015100000_credit_operation_history.sql`
4. `20261015110000_user_workspace_provisioning.sql`
5. `20261015120000_scope_experiments.sql`
6. `20261015130000_restrict_anon_rpc_execution.sql`
7. `20261015140000_restrict_public_view_access.sql`
8. `20261015150000_admin_only_global_dataset_rpcs.sql`
9. `20261015160000_require_positive_ai_cost.sql`
10. `20261015170000_email_verified_welcome_credits.sql`
11. `20261015171000_pending_verified_welcome_grants.sql`
12. `20261015172000_scope_welcome_eligibility_to_new_accounts.sql`

The ledger and account tables are protected against direct client writes; users can read only their own account and ledger. The Auth trigger creates a zero-balance account on signup and awards a welcome grant only after email verification. The allowance is currently zero and disabled pending business approval. Accounts that already existed before this rollout are not retroactively enrolled; accounts created after the rollout while grants are disabled remain eligible for a later one-time grant after email verification and admin approval. An admin can still add a reasoned manual adjustment through the protected admin endpoint.
## Endpoints
- `GET /api/credits`: current authenticated user's balance and last 100 ledger entries.
- `GET/PATCH/POST /api/admin/credits`: admin-only settings, account/ledger review, and atomic balance adjustments.
- `POST /api/analyst`: reserves credits before analysis, charges only the configured AI Analyst operation, and refunds reserved credits if analysis fails.

All credit RPCs derive identity from the verified Supabase JWT. Ledger writes and balances are not client-editable. Reservation is serialized by locking the account row and each request includes an idempotency key.

## Website-to-app authentication
The intended direction is company website → existing app sign-in/create-account → workspace. The marketing website CTA currently links to `https://cpgistai.vercel.app`, where the existing Supabase Auth project handles signup/sign-in; the marketing site does not maintain a second password/session system. The app should not make a return link to the company website the primary integration. The user supplied `https://cpgist.vercel.app/` as the company site, but current Vercel project-domain records show `https://cpgist-website.vercel.app/` for the marketing project and `https://cpgistai.vercel.app/` for the app. Do not change domains until this discrepancy is resolved. The browser client uses PKCE. Supabase Auth URL Configuration must allow the actual app dashboard and password-reset URLs.


## Protected API routes
The workspace, explorer, advanced analytics, V5 insights, A/B testing, and legacy ingestion APIs now verify the Supabase bearer token server-side. Legacy ingestion also verifies membership in the submitted organization. The experiment API scopes saved experiment rows to the authenticated user. The 17 legacy security-definer analytics views have direct `anon`/`authenticated` table grants revoked; only the server `service_role` can query them. The two destructive/rebuild RPCs used by signed-in import flows no longer execute for anonymous users.

## Existing experiments table note
The legacy `public.cpgist_experiments` table still has RLS disabled. This rollout removes direct anon/authenticated table grants and scopes the server API by `created_by`, but it does not enable RLS because a separate policy design is required. Do not restore direct client grants until owner-scoped RLS policies are defined.


## Shared dataset operations
The existing compact analytics dataset is shared/global rather than isolated by organization. For that reason, sign-out no longer truncates it, and global reset/rebuild RPCs are restricted to the server-side admin endpoint. The current client import flow stops before replacing the dataset unless the authenticated user has `app_metadata.role = admin`. Per-organization isolation for all existing analytics tables is a separate schema migration; do not treat the shared dataset as tenant-isolated until that work is complete.
