# CPGist domain, production, and authentication audit

Audit date: 2026-10-14. Read-only inspection only; no production settings, DNS, domains, deployments, or user data were changed.

## Existing repositories and projects

- Company website repository: `MOHANRAJ-S360/CPGist`
- AI application repository: `MOHANRAJ-S360/CPGist-AI`
- Existing Vercel team: `papiltoons-2843's projects` (`team_Jol9cUw96NgEZWCLqXWJoLUH`), Hobby plan.
- Website Vercel project: `cpgist-website` (`prj_SuVwWfw3FRSMYqCmJX7HE6lf4NQM`), connected to GitHub repo `MOHANRAJ-S360/CPGist`.
- App Vercel project: `cpgist` (`prj_5B6Yz4yRF1oN2S5MuZba7DLKIqPX`), connected to GitHub repo `MOHANRAJ-S360/CPGist-AI`.

## Domain assignments and production deployments

| Role | Observed result |
|---|---|
| Canonical company URL, confirmed by product owner | `https://cpgist.vercel.app/` |
| Is canonical URL assigned to the connected website project? | Not in the project's assigned domain list. Project-domain lookup returned 404. |
| Can connected team inspect canonical domain ownership? | No. Account-level domain lookup returned 403 Forbidden ("You don't have access"). This is an access boundary, not proof the URL is unowned or offline. |
| Accessible website alias | `https://cpgist-website.vercel.app/`; assigned and verified on `cpgist-website`. Live Vercel fetch returned HTTP 200 and CPGist company-site HTML. |
| Website production deployment | READY, `dpl_2EK1cgHbDQvSSr6sNzDykYKNHzpP`, commit `d8dff92f0536d0c4b4c63fed946f64168360e104`, branch `main`, repository `MOHANRAJ-S360/CPGist`. |
| Intended app URL | `https://cpgistai.vercel.app/`; assigned and verified on existing `cpgist` project. |
| App production deployment | READY, `dpl_5b7C3zRLaL4qrmyurvkU7YcPW3iH`, commit `3e283400d5f5883fc9d707836abcabe064ff603b`, branch `main`, repository `MOHANRAJ-S360/CPGist-AI`. |
| Live app response | Vercel fetch returned HTTP 200 for the login route and reset-password route. |

The Vercel team context lookup succeeded, and both projects' Git connections are visible. Re-authentication to the same team did not grant access to `cpgist.vercel.app`. No domain was added, transferred, reassigned, or changed.

## Website-to-app navigation smoke check

- Read the existing company website source and fetched the assigned production alias.
- Company-site sign-in/app CTA links point to `https://cpgistai.vercel.app/`; create-account CTA points to `https://cpgistai.vercel.app/?mode=signup`.
- The live app root responds HTTP 200 and serves its existing sign-in/create-account UI.
- The live app JavaScript bundle does not include the `mode=signup` query handling, while the company-site create-account CTA points to `/?mode=signup`. The current GitHub source already contains the query handler (it is inherited from the PR base, not a code change in this PR), so a successful deployment from current main would be expected to align the behavior. Until then, users can manually switch to Create account. No deployment was triggered.
- This was a read-only smoke test, not a real signup/login. No credentials were submitted and no production user was created.

## Supabase Auth configuration

- Existing Supabase project `afgxhanoluoijzgdobcr` is `ACTIVE_HEALTHY`.
- The app's browser client is configured for PKCE, persistent session, auto refresh, and URL session detection.
- Current source requests email signup confirmation to redirect to `https://cpgistai.vercel.app/dashboard`; Google OAuth uses the same dashboard redirect; password recovery redirects to `https://cpgistai.vercel.app/reset-password`.
- The connected Supabase integration does not expose the Auth URL Configuration settings. Consequently the actual configured Site URL/allowed redirect allow-list and a real email-verification callback have not been verified. Do not infer they are configured correctly from source code alone.
- Manual check required in Supabase Dashboard → Authentication → URL Configuration: verify the Site URL and allow-list contain the exact intended app redirect URLs above. Then conduct a new test-account verification flow only when a safe test email is available; do not modify or delete existing users.

## Recommended next steps (no changes made by this audit)

1. In Vercel Dashboard, identify the account/project that currently serves `cpgist.vercel.app`. If it belongs to another account/team, ask the owner to grant appropriate read access; do not transfer or reassign it as part of this task.
2. In Supabase Dashboard, inspect Auth URL Configuration and verify email templates/callback behavior.
3. Review PR #21. The PR keeps welcome credits at zero/disabled and changes the one-time grant trigger to wait for email verification. Billing remains inactive.
4. After explicit approval, merge/deploy the PR; do not treat the current branch as production.
5. After deployment, repeat the signup-query smoke test and perform a controlled test-account email-verification flow. Keep welcome grants disabled until the amount is approved and billing inactive until provider/products/prices are approved.
