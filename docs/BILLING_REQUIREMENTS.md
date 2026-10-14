# CPGist account, credits, billing, and website integration requirements

Status: proposed product requirements and implementation plan. This document distinguishes verified current capabilities from work not yet implemented. Do not interpret future billing design as permission to collect payments.

## Product and architecture constraints

- Preserve the existing company website and the existing CPGist AI application, their repositories, deployments, domains, and working features.
- The company website is the primary public entry point. Expected journey: company website -> sign in/create account -> existing CPGist AI workspace -> credits/usage. Website CTAs should lead into the existing app; app navigation must not make a company-site redirect the primary integration.
- Continue using the existing Supabase Auth identity and database. Do not create a second identity store or replacement project.
- Do not delete user data, reset analytics tables as part of auth/credit workflows, or change production domains without explicit approval.

## Requirements and current audit

| Requirement | Existing state | Gap / action |
|---|---|---|
| Existing company site and app preserved | Two existing repositories and Vercel projects were found. | The user has confirmed https://cpgist.vercel.app/ as the original canonical company website, hosted in a different Vercel account. The currently connected team cannot inspect that separate account (403 Forbidden; project-domain lookups 404). Preserve the domain and existing project; do not transfer or replace it. Verify assignment and production deployment from the original Vercel account. |
| Shared authentication | The app uses Supabase Auth; the marketing site routes sign-up/sign-in visitors into the existing app. | Keep one identity system. Browser client uses Supabase PKCE; signup and password reset redirect to the app. Supabase redirect allow-list and end-to-end email/OAuth flows remain unverified because the Auth URL Configuration is not exposed by the connected Supabase tools. |
| Welcome credits only after email verification | Previous database trigger granted on auth-user insert. | Replace with an auth.users insert/update trigger that grants only when email_confirmed_at is present, and only once. |
| Welcome allowance configurable | Admin settings already expose welcome_credits and welcome_grant_enabled. | Amount is undecided. Safe state is zero credits and disabled until approved; do not assume the previous value of 10 was approved. |
| Never automatically reset welcome credits | A one-time welcome_granted flag and unique welcome:<user_id> ledger key exist. | Preserve permanent grant idempotency; never regrant because of login, refresh, billing renewal, or profile updates. |
| Credit balances/grants/deductions server-authoritative | Database ledger, protected RPCs, row locks, and idempotency keys exist. AI Analyst reserves credits server-side and refunds failed operations. | Test concurrent requests, duplicate keys, and refund paths against the deployed app. |
| One-time credit packs | Not implemented. | Implement only after provider and pack SKUs/prices are approved. |
| Recurring subscriptions | Not implemented. | Implement separate subscription/entitlement records and billing-cycle allowance logic after approval. |
| Verified payment before paid credits | No payment integration is active. | Future provider webhooks must verify signatures, amounts, currency, product/price, payment state, and provider event IDs server-side before posting ledger grants. Never trust a browser success redirect. |
| Duplicate payment protection | Existing credit ledger has unique idempotency keys; no provider event ledger exists. | Add unique provider + event ID and unique provider + purchase/order ID constraints in a later provider-specific migration. |
| Subscription cycle rules | Not implemented and not yet approved. | Decide allowance size, cycle anchor, proration, rollover/expiry, cancellation, past-due, refunds/chargebacks, and plan changes before implementation. |
| Payment collection | No provider or products/prices approved. | Do not create checkout sessions, collect card details, or activate payment endpoints until explicit approval. |

## Safe implementation sequence

### Phase 0 — audit and stabilize
1. Inspect current repositories, Supabase Auth/database/migrations, Vercel projects/domains/deployments.
2. Preserve all existing app and website features and data.
3. Make the company website the public entry point; keep its CTAs routed into the existing app. Do not change domains. The user-confirmed canonical website URL is https://cpgist.vercel.app/ and is hosted in the user's separate Vercel account. It is not visible to the currently connected team. The other account's accessible alias https://cpgist-website.vercel.app/ is a separate visible project and is not a replacement for the original site. Verify canonical domain assignment and production health by signing into the original account.

### Phase 1 — verified one-time welcome grants
1. Create a zero-balance credit account when a Supabase user is created.
2. Award a welcome grant only on a trusted Supabase Auth transition to a confirmed email (or insertion already confirmed by the provider).
3. Keep the grant amount configurable; set amount to 0 and disable grants until business approval.
4. Use a locked account row, welcome_granted flag, and a unique ledger idempotency key.
5. Do not retroactively grant credits to existing users unless separately approved. Never reset balances or existing ledger rows.

### Phase 2 — payment-neutral billing model (design only until provider approval)
1. Keep purchase credits separate from welcome grants and subscription-cycle allowances.
2. Store provider event IDs, purchase/order IDs, customer/subscription IDs, product/price IDs, amount, currency, payment status, and timestamps in server-controlled records.
3. Process provider events idempotently. A purchase grant requires verified successful payment; a subscription allowance requires a verified active billing cycle according to the approved policy.
4. Handle duplicate/out-of-order events, failed or pending payments, refunds, chargebacks, cancellations, renewal failures, and plan changes without trusting the browser.
5. Do not expose service-role credentials or grant/entitlement mutation RPCs to clients.

### Phase 3 — provider integration after explicit approval
1. Approve provider, account/merchant setup, products, prices, currency, tax/receipt requirements, webhook configuration, and subscription policy.
2. Implement checkout and server-side webhook verification in the existing app.
3. Add customer purchase history, subscription status, receipts/portal links if the provider supports them, and admin audit controls.
4. Run provider sandbox tests before enabling production collection.

## Test and release checklist

- Unverified signup receives zero welcome credits.
- Successful email verification grants exactly the configured amount once.
- Replayed confirmation/update events do not duplicate grants.
- Disabled/zero welcome settings grant nothing.
- Login, refresh, sign-out/in, and subscription renewal never reset the welcome grant.
- Parallel AI Analyst requests cannot overspend; retries with the same idempotency key do not double-charge; failed analysis refunds once.
- Future payment tests reject invalid signatures, mismatched amount/currency/product, pending/failed payments, and duplicate provider events.
- Subscription cycle grants are unique per subscription + billing period; cancellation and past-due behavior follows approved policy.
- Existing company website, app navigation, analytics, and user data remain intact.
- Production deployment is verified independently; a source commit or PR is not proof of deployment.

## Audit blockers and manual verification

- The original company website `https://cpgist.vercel.app/` is hosted in a different Vercel account, as confirmed by the owner. The connected team returns 403/404 when trying to inspect it because it lacks access. Sign in to the original account to verify the domain assignment and production deployment. Do not transfer, reassign, or replace the domain.
- The app domain `https://cpgistai.vercel.app/` returns HTTP 200 and is assigned/verified to the existing app project. Its production deployment is READY at commit `3e283400d5f5883fc9d707836abcabe064ff603b`.
- The production app bundle currently does not include the `?mode=signup` query handling, while the company-site CTA points to `/?mode=signup`. Current GitHub source already includes the query handler (inherited from the PR base, not changed by this PR); a successful deployment from current main would align the behavior. Until then users can manually switch to Create account. No deployment was triggered.
- The connected Supabase tool exposes project/database operations but not Auth URL Configuration. In Supabase Dashboard → Authentication → URL Configuration, manually confirm Site URL is the intended app URL and allowed redirects include `https://cpgistai.vercel.app/dashboard` and `https://cpgistai.vercel.app/reset-password`. Also test an email-verification link from a newly created test account without altering production user data. No test signup was submitted.

## Decisions still required

- Using the original Vercel account, verify that https://cpgist.vercel.app/ is assigned to the existing company-site project and that its production deployment is healthy. Do not move it to the connected app account.
- Welcome-credit amount and when welcome grants should be enabled.
- Payment provider and merchant account.
- Credit-pack SKUs, prices, currency, included credits, and refund/chargeback policy.
- Subscription tiers, recurring allowance, billing-cycle reset/grant rule, rollover/expiry, proration, cancellation, failed-payment grace period, and plan-change behavior.
- Whether any existing verified accounts should receive a one-time welcome grant retroactively (default: no).
