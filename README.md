# Qlink

A Linktr.ee-style creator platform with **in-house, non-custodial crypto checkout**.
Creators sign in with Google, claim a handle, build a page, define paid
**service-tier packages**, and publish a shareable link. Customers pay in
**stablecoins (USDT / USDC)** across **all EVM chains + Tron** — funds go
straight to the creator's wallet, and each payment is verified on-chain by the
server. Every creator gets a promo code that gives their customers **20% off**.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) + **Tailwind v4**
- **Supabase** — Google auth, Postgres, Storage, Row Level Security
- **Reown AppKit** (WalletConnect) + **wagmi / viem** for EVM wallets
- **TronLink** + **tronweb** for Tron
- On-chain verification with `viem` (EVM) and `tronweb` (Tron)

## How payments work (non-custodial)

1. Customer picks a package, connects a wallet, optionally enters a promo code.
2. `POST /api/orders` — the **server** looks up the package price, applies the
   promo, and returns the exact amount + the creator's receiving address. Price
   is always authoritative from the DB; client-supplied amounts are ignored.
3. The wallet sends an ERC-20 / TRC-20 `transfer` **directly to the creator**.
4. `POST /api/orders/verify` — the server reads the transaction on-chain,
   confirms the token, recipient, amount and confirmations, then marks the
   order **paid** (idempotent; `tx_hash` is unique to prevent double-credit).

The platform never holds funds.

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   This creates the tables, RLS policies, the auto-profile-on-signup trigger,
   and the public `avatars` storage bucket.
3. **Authentication → Providers → Google**: enable it and paste your Google
   OAuth **Client ID / Secret** (from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)).
   - Authorized redirect URI (Google side):
     `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - Add `http://localhost:3000/auth/callback` to Supabase **URL Configuration →
     Redirect URLs** for local dev.
4. Copy your API keys from **Project Settings → API**.

### 3. Reown (WalletConnect)

Create a project at [dashboard.reown.com](https://dashboard.reown.com) and copy
the **Project ID**.

### 4. Environment

```bash
cp .env.example .env.local
```

Fill in:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** — order verification |
| `NEXT_PUBLIC_REOWN_PROJECT_ID` | WalletConnect modal |
| `NEXT_PUBLIC_APP_URL` | Base URL for public links |
| `NEXT_PUBLIC_CRYPTO_ENV` | `testnet` (Sepolia + Tron Nile) or `mainnet` |
| `RPC_*` | Optional dedicated EVM RPCs (public defaults exist) |
| `TRON_FULL_HOST*` / `TRON_API_KEY` | TronGrid endpoints for verification |

### 5. Run

```bash
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint       # eslint
```

---

## Testing the flow

1. Sign in with Google → claim a username → add profile/links → set an **EVM
   and/or Tron receiving address** → define packages → **Publish**.
2. Open your public link (`/<username>`) in an incognito window.
3. Buy a package. With `NEXT_PUBLIC_CRYPTO_ENV=testnet`, use **Sepolia** (test
   USDC) via WalletConnect, or **Tron Nile** (test USDT) via TronLink. Get test
   tokens from the respective faucets.
4. Confirm the order flips to **paid** in **Dashboard → Orders** with the tx
   hash linked to the explorer.
5. Test the promo code: enter your creator code at checkout — the amount drops
   by 20% (verified server-side, not just in the UI).

> Testnet token addresses can change; if a faucet token differs, update the
> `TESTNET` map in [`lib/crypto/config.ts`](lib/crypto/config.ts). Mainnet
> addresses are well-known and fixed.

---

## Project structure

```
app/
  page.tsx                     landing
  login/ · auth/callback/      Google sign-in
  onboarding/                  wizard: username → profile → wallets → packages → preview
  dashboard/                   overview, edit pages, orders
  [username]/                  public creator page + checkout
  api/orders/ · orders/verify  order creation + on-chain verification
  api/username/check           live handle availability
lib/
  supabase/                    ssr client/server/admin + auth proxy helper
  crypto/                      config, wagmi/AppKit, verify-evm, verify-tron, tron-client
  validation.ts · promo.ts     zod schemas + promo logic
components/                    forms, checkout modal, page view, dashboard
supabase/migrations/           schema + RLS + storage
proxy.ts                       auth session refresh + route protection
```

## Security notes

- Service-role key is used **only** in server route handlers, never shipped to
  the client.
- The server recomputes price + discount from the DB; client amounts are never
  trusted.
- Verification checks the exact token contract per chain, the recipient, the
  amount, and confirmation depth (re-org guard). `tx_hash` is unique and the
  verify endpoint is idempotent.
- Wallet addresses are validated/normalized (EVM checksum, Tron base58) on save.
