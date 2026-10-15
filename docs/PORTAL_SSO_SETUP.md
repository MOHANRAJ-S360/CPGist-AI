# CPGist AI SSO environment setup

See the company portal's `docs/PORTAL_SSO_SETUP.md` for the complete flow and verification checklist.

Set these on the CPGist AI Vercel project:
- `CPGIST_PORTAL_API_URL=https://cpgist-api.onrender.com/api`
- `CPGIST_SSO_SHARED_SECRET`: same long random secret configured on the portal backend.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service-role key for the Supabase project already used by CPGist AI.
- Keep `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configured.

Set these on the CPGist portal backend (Render):
- `CPGIST_AI_URL=https://cpgistai.vercel.app`
- `CPGIST_SSO_SHARED_SECRET`: exactly the same secret.

After configuring both environments, redeploy both services. The portal login is the account entry point; `/sso` consumes the one-time ticket and establishes a normal Supabase session before navigating to the dashboard. Never expose the service-role key or shared secret to client-side code.
