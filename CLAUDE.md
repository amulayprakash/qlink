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

There is no unit-test runner; Playwright e2e is the whole suite. See [tests/README.md](tests/README.md) for coverage and the deliberate gaps (wallet/on-chain checkout, dashboard mutations).

## Architecture

Qlink: a Linktree-style creator platform whose differentiator is **non-custodial stablecoin checkout**. Next.js 16 App Router + Supabase + wagmi/viem (EVM) + tronweb (Tron).

**Next.js 16 specifics** — `middleware.ts` is renamed [proxy.ts](proxy.ts); read `node_modules/next/dist/docs/` before writing framework code, per AGENTS.md.

### The four Supabase clients — pick deliberately

| Module | Session | Use for |
| --- | --- | --- |
| [lib/supabase/server.ts](lib/supabase/server.ts) | cookies → RLS sees the user | dashboard, editor, all server actions |
| [lib/supabase/client.ts](lib/supabase/client.ts) | browser | client components |
| [lib/supabase/public.ts](lib/supabase/public.ts) | **none, on purpose** | the public `/[username]` route only |
| [lib/supabase/admin.ts](lib/supabase/admin.ts) | service role | order creation + on-chain verify, analytics writes |

`createPublicClient()` has no cookies specifically so `/[username]` stays cacheable — `cookies()` is a Request-time API and anything after it is dynamic. That route declares `revalidate = 3600` **and** `generateStaticParams` (ISR needs both for a dynamic segment). Never use it where a write, auth check, or owner-only read is involved.

### Payments (non-custodial — the platform never holds funds)

`POST /api/orders` → the **server** looks up the package price from the DB, applies the promo, returns the amount + the creator's address. Client-supplied amounts are never trusted. The wallet transfers directly to the creator. `POST /api/orders/verify` reads the tx on-chain and checks token contract, recipient, amount, and confirmation depth; `tx_hash` is unique so the endpoint is idempotent.

[lib/crypto/config.ts](lib/crypto/config.ts) is the single network/token registry, isomorphic, switched by `NEXT_PUBLIC_CRYPTO_ENV` (`testnet` = Sepolia + Tron Nile). **USDT/USDC are 6 decimals everywhere except BSC, where they are 18** — always read `decimals` from the registry.

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
