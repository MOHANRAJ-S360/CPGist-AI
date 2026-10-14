# CPGist single sign-on and free AI tier

## SSO flow
1. A user signs into the main CPGist site and clicks **Open AI Analyst** in their workspace.
2. The main FastAPI backend verifies its existing HttpOnly cookie session and requires a verified email.
3. The backend uses a server-only Supabase service-role key to generate a one-time magic-link token for that email. If the identity does not exist in Supabase yet, it generates a signup token instead.
4. The backend redirects to the AI app's `/sso` callback and passes the one-time token in the URL fragment. The callback removes the token from browser history immediately and exchanges it with Supabase Auth.
5. The user lands in the existing AI app dashboard; the existing Supabase session powers RLS and the existing analytics features.

The service-role key must only exist in the Render backend environment. Never add it to a `NEXT_PUBLIC_*` variable or the AI app client.

## Main CPGist backend environment
Configure in Render (do not paste secrets into chat):
- `SUPABASE_URL`: URL of the Supabase project used by CPGist-AI.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service-role/secret key for that same project.
- `AI_ANALYST_URL`: `https://cpgistai.vercel.app` (or the verified production AI app URL).

## Supabase configuration
- Ensure Email Auth is enabled.
- Add the AI app callback origin/path to allowed redirect URLs if required by the project's Auth URL configuration.
- The callback uses Supabase's one-time `verifyOtp` exchange; tokens are single-use.
- The quota migration in `supabase/migrations/20261014090000_cpgist_ai_free_usage.sql` must be applied before the free-tier feature can run.

## Free tier
- Three completed analyses per Supabase user ID.
- Atomic reservations count in-flight requests so concurrent requests cannot exceed the quota.
- Failed model/provider requests release reservations and do not count as completed analyses.
- Paid checkout is intentionally deferred. There is no fake payment or paid entitlement path.

## Pre-deployment test checklist
- Unauthenticated click redirects to main sign-in.
- Verified main-site account opens AI Analyst without a second login.
- New email identity and existing Supabase identity both complete SSO.
- Invalid, expired, and reused SSO token is rejected.
- Three successful analyses complete; the fourth is rejected server-side.
- Provider failure releases reservation; parallel requests never exceed three reservations.
- Browser reload and sign-out/sign-in do not reset quota.
- Existing AI dashboard, data tools, and analysis routes remain functional.
- Run the production build and review Supabase security advisors before merge/deploy.
