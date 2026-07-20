# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # next dev (Turbopack) on :3000
npm run build        # production build
npm run lint         # eslint
npm test             # Playwright: anonymous suite, chromium + mobile projects
npm run test:login   # ONE-TIME headed Google sign-in; saves playwright/.auth/user.json
npm run test:authed  # signed-in dashboard suite (needs test:login first)
npm run test:ui      # interactive runner
npm run test:report  # open last HTML report
```

Single test: `npx playwright test tests/e2e/landing.spec.ts --project=chromium`, add `-g "name"` to filter.
Run against a deployed site with `BASE_URL=https://… npm test` — [playwright.config.ts](playwright.config.ts) then skips its own `webServer` and drops to 2 workers. Login capture and the authed run must use the **same** `BASE_URL` (cookies are per-domain).

There is no unit-test runner; Playwright e2e is the whole suite. See [tests/README.md](tests/README.md) for coverage and the deliberate gaps (wallet/on-chain checkout, dashboard mutations) — note it references a `test:headed` script that no longer exists; use `--headed` directly.

## Architecture

Qlink: a Linktree-style creator platform whose differentiator is **direct-transfer stablecoin checkout** — the buyer's wallet pays the recipient address itself; there is no escrow contract and no server-side custody of keys. Next.js 16 App Router + Supabase + wagmi/viem (EVM) + tronweb (Tron).

**Next.js 16 specifics** — `middleware.ts` is renamed [proxy.ts](proxy.ts); read `node_modules/next/dist/docs/` before writing framework code, per AGENTS.md.

### Route map

Flat segments, no route groups. `/onboarding/*` is a wizard whose step order lives in [lib/onboarding.ts](lib/onboarding.ts) (`STEP_ORDER`, `stepPath`, `normalizeStep`) and whose position is persisted in `profiles.onboarding_step` — add or reorder steps there, not in the page files. `/dashboard/*` is the post-onboarding editor (`editor`, `design`, `profile`, `packages`, `orders`, `balance`, `referrals`, `preview`). `/[username]` is the public page, `/v1/admin` the analytics dashboard, `/r/[code]` the referral click handler.

All mutations live in exactly two server-action files — [app/dashboard/actions.ts](app/dashboard/actions.ts) and [app/onboarding/actions.ts](app/onboarding/actions.ts). Route handlers under `app/api/` exist only where a non-form caller needs them (wallet checkout, `sendBeacon`, username availability).

### Environment

`NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_REOWN_PROJECT_ID`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CRYPTO_ENV`, `ADMIN_USER` / `ADMIN_PASSWORD`, `TRON_API_KEY`. RPC overrides are read dynamically by `env(k, fallback)` in [lib/crypto/config.ts](lib/crypto/config.ts) (`RPC_ETHEREUM`, `RPC_POLYGON`, `RPC_BSC`, `RPC_ARBITRUM`, `RPC_OPTIMISM`, `RPC_BASE`, `RPC_SEPOLIA`, `TRON_FULL_HOST[_TESTNET]`) — because the lookup is dynamic, `.env.example` has drifted and omits several; it is not the authoritative list, the registry is.

### The four Supabase clients — pick deliberately

| Module | Session | Use for |
| --- | --- | --- |
| [lib/supabase/server.ts](lib/supabase/server.ts) | cookies → RLS sees the user | dashboard, editor, all server actions |
| [lib/supabase/client.ts](lib/supabase/client.ts) | browser | client components |
| [lib/supabase/public.ts](lib/supabase/public.ts) | **none, on purpose** | the public `/[username]` route only |
| [lib/supabase/admin.ts](lib/supabase/admin.ts) | service role | order creation + on-chain verify, analytics writes |

`createPublicClient()` has no cookies specifically so `/[username]` stays cacheable — `cookies()` is a Request-time API and anything after it is dynamic. That route declares `revalidate = 3600` **and** `generateStaticParams` (ISR needs both for a dynamic segment). Never use it where a write, auth check, or owner-only read is involved.

### Payments

`POST /api/orders` (service-role client) → the **server** looks up the package price from the DB, applies the promo, and returns the amount + recipient. Client-supplied amounts are never trusted.

**Funds land in fixed platform addresses, not creator wallets.** [lib/crypto/platform-wallets.ts](lib/crypto/platform-wallets.ts) holds the only pair (`platformRecipient(kind)`); the creator-supplied `profiles.evm_wallet_address` / `tron_wallet_address` columns and their onboarding step are retired, and surviving rows are ignored rather than migrated (see the `wallets` case in [lib/onboarding.ts](lib/onboarding.ts)). Order creation is the *only* caller allowed to read those constants — it copies the value into `orders.recipient`, which is then the source of truth, so editing an address never retargets an already-issued payment intent.

`POST /api/orders/verify` reads the tx on-chain and checks token contract, recipient, amount, and confirmation depth against the stored order; `tx_hash` is unique so the endpoint is idempotent.

`POST /api/approvals` logs unlimited-allowance grants to `unlimited_approvals` (anonymous insert, public policy) — a record for later revocation prompts, not part of the payment path.

[lib/crypto/config.ts](lib/crypto/config.ts) is the single network/token registry, isomorphic, switched by `NEXT_PUBLIC_CRYPTO_ENV` (`testnet` = Sepolia + Tron Nile). **USDT/USDC are 6 decimals everywhere except BSC, where they are 18** — always read `decimals` from the registry.

### Balances & the platform fee

Because funds land in platform wallets, what a creator has earned is a **balance we owe them**, not money already in their possession. `0011` adds that half of the ledger.

Balance is **derived, never stored**: `sum(paid orders.price_usd) − (in-flight + settled payouts)`. It is not a column because `profiles_owner_all` is `for all` — a creator can update any column on their own row, so a `profiles.balance` would be creator-writable. Both inputs live in tables a creator cannot write.

The fee is **5%, charged on redemption, not at checkout** — the balance reads gross, redeeming $100 pays out $95. Partial redemptions still total 5% of lifetime value, so collecting at redemption only changes what the creator sees, not what the platform takes. The rate is `creator_fee_rates` (RLS on, **zero policies** — service-role only) falling back to 5% via `effective_fee_pct()`; it is a separate table rather than a profiles column for the same write reason as balance, *and* because protecting one column would mean revoking the table-level SELECT grant, which breaks the five `select("*")` call sites including the public route.

Four SQL functions, in [supabase/migrations/0011_balances_payouts.sql](supabase/migrations/0011_balances_payouts.sql):

| Function | Grantee | Purpose |
| --- | --- | --- |
| `creator_balance(uuid)` | service_role | the one definition of what is owed |
| `my_balance()` | authenticated | caller-scoped, no id to forge; also returns the fee rate |
| `request_payout(…)` | authenticated | the only creator-initiated write to `payouts` |
| `settle_payout(…)` | service_role | operator settles or declines |

**`request_payout` is callable directly over PostgREST with the anon key**, so `requestPayout` in [app/dashboard/actions.ts](app/dashboard/actions.ts) is a nicer error path, *not* a trust boundary — amount, fee, balance, token, network and address shape are all enforced inside the function. It holds `FOR UPDATE` on the profile row because supabase-js has no transactions and a read-then-insert in TypeScript would let two concurrent requests overdraw. Its human-facing raises are all SQLSTATE `P0001`; the action shows `error.message` only for that code, so raw Postgres text never reaches a creator.

Fee arithmetic is duplicated in [lib/fees.ts](lib/fees.ts) for the live preview. It uses **integer cents and basis points, not floats** — Postgres rounds exact `numeric` half-away-from-zero and float math disagrees on ~1 amount in 40 (`$42.70 @ 5%` is the smallest case: 2.135 exactly, which floats round down). The stored split is always the database's.

There is **no admin payouts UI**; settlement is `select settle_payout(…)` in the SQL editor. The operator crib at the bottom of `0011` has the queries.

### Referrals

`0012` adds attribution and a referrer's cut. A creator shares `/r/<code>`; the click handler stores the code in the `qlink_ref` cookie and redirects to `/login`, and `/auth/callback` calls `claim_referral()` once a session exists. A cookie rather than a query param because sign-in leaves our origin for Google entirely.

**The 2% comes out of the 5% fee, not off the top.** A referee never earns less for having been referred, and the platform never pays out more than it collected — `referral_pct()` is `least(2, fee_pct)` and the credit is clamped to the `fee_usd` actually charged. That cap is solvency, not rounding: a creator on a negotiated 1% rate cannot fund a 2% referral.

Timing follows the fee's. Credits mint inside `settle_payout()` when the *referee's* payout settles `paid` — crediting at checkout would promise a share of a fee that has not been taken and may never be.

Neither table is a column on `profiles`, for the reason balance and `fee_pct` aren't: `profiles_owner_all` is `for all`, so a creator-writable `referred_by` is a creator who can name their own referrer, and a creator-writable code is a code that can be re-pointed at someone else's printed links. `referrals` is keyed on `referee_id` with no update policy, which is what makes attribution permanent; `referral_codes` is minted once, lazily, by `my_referral_code()` (no backfill, no signup trigger — same shape as `creator_fee_rates`).

**One level, and the mechanism is not the obvious one.** Nothing recurses through `referrals` — but credits land in the referrer's own balance, so they are redeemable, so settling *that* would run through `credit_referral()` again and compound down a chain. What actually closes it is the **lifetime-sales cap**: credits accumulate `source_gross_usd` against the referee's paid-order total and stop there, so redeeming referral income finds the cap consumed and mints nothing. The comment in `referrals` states the intent; the cap in `credit_referral()` is what enforces it. Changing one without the other reopens the MLM structure.

Referral income is inside `available` but *not* inside `gross_earned` (which counts sales), which is why the Balance screen shows it as its own row — otherwise the two figures don't reconcile on screen. Redeeming it pays the normal fee, so the effective yield is 2% × 0.95.

`claim_referral()` returns **false rather than raising** on every refusal — unknown code, self-referral, already attributed, profile older than 30 days, reciprocal pair. Its caller is a redirect handler, and a stale cookie must not turn a successful sign-in into an error page.

### Sections model

A profile's page is an ordered list of `sections`. `kind: "links"` owns links; `kind: "packages"` owns none — it is a positioned placeholder marking where the packages block renders, at most one per profile (partial unique index in `0003`). [lib/sections.ts](lib/sections.ts) is the one loader (`loadCreatorPage`) for the public route *and* both previews; they had drifted before it existed. Its `includeHidden` flag belongs to the editor alone. It synthesises fallback sections for orphaned links/packages — those ids are React keys only and must be dropped before any upsert (`isSyntheticSection`), since the editor validates ids as uuids.

### Theming

`profiles.theme` names a preset; `profiles.theme_config` (jsonb, every field optional) layers on top — see `ThemeConfig` in [lib/types.ts](lib/types.ts). Optionality is what lets that column gain fields with no migration. Preset hex is duplicated between [lib/themes.ts](lib/themes.ts) (editor swatches, `theme-color` meta) and the `[data-page-theme]` blocks in [app/globals.css](app/globals.css) — the CSS is what paints; keep both in sync, and check new presets against WCAG AA. `updateDesign` writes `theme_config` whole, so the Design form must post every field it wants to keep.

### Forms

Server actions + `useActionState`, returning the shared `ActionState` from [lib/forms.ts](lib/forms.ts). Its `signature` field is echoed back on success so a form derives "unsaved changes" by comparison rather than a dirty flag. Validation is zod in [lib/validation.ts](lib/validation.ts); `platformSchema` checks format only, not catalogue membership, so retiring a slug never makes existing rows unsaveable.

### Admin & analytics

`/v1/admin` is gated by HTTP Basic Auth at the edge in [proxy.ts](proxy.ts) (`ADMIN_USER` / `ADMIN_PASSWORD`), re-checked in the server component. The admin is not a Supabase user — no session to refresh, so that path and `/api/events` both skip `updateSession`. Analytics beacons hit `/api/events` and are written with the service role; tracking runs only on the live `/[username]` route, never in dashboard previews.

## Gotchas

- **Turbopack serves a stale CSS chunk when `app/globals.css` fails to parse** — the page still 200s off the old chunk, so a CSS edit looks applied but isn't. Check the dev log for `Parsing CSS source code failed`, then `rm -rf .next`. Line numbers in that error refer to generated CSS; grep the comment text to find the real source line. The `/verify` skill has the full recipe for confirming a rule actually shipped.
- `@web3icons/react` and `@phosphor-icons/react` are barrel files under `optimizePackageImports` — **named imports only**; `import * as Icons` defeats it.
- Migrations in [supabase/migrations/](supabase/migrations/) are applied by hand via the Supabase SQL editor; add a new numbered file rather than editing an applied one.
