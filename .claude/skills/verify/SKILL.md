---
name: verify
description: Build, run and drive Qlink to observe a change at its real surface (creator page, editor preview, checkout).
---

# Verifying Qlink

Next 16 (Turbopack) + Supabase. `.env.local` holds real Supabase creds, so the
dev server serves real creator pages — no fixtures needed.

## Launch

```bash
npx next dev --port 3112        # background it
until curl -s -o /dev/null http://localhost:3112/sofia; do sleep 1; done
```

**Turbopack serves a stale CSS chunk when `app/globals.css` fails to parse.**
The page still returns 200 off the old chunk, so a CSS edit looks applied in the
source and simply is not in the browser. Editing the file or touching it does
not clear it. If a CSS change seems inert, check the dev-server log for
`Parsing CSS source code failed`, then `rm -rf .next` and restart. Always
confirm the rule actually shipped before trusting a measurement:

```bash
CSS=$(curl -s http://localhost:3112/sofia | grep -o '/_next/static/[^"]*\.css' | head -1)
curl -s "http://localhost:3112$CSS" | grep -A9 'page-wallpaper {'
```

Line numbers in that parse error are for the *generated* CSS, not the source
file — grep the quoted comment text to find the real line.

## Fixtures that exist

Query what's published rather than guessing:

```bash
URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '\r"')
KEY=$(grep -E '^NEXT_PUBLIC_SUPABASE_(ANON_KEY|PUBLISHABLE)' .env.local | head -1 | cut -d= -f2- | tr -d '\r"')
curl -s "$URL/rest/v1/profiles?select=username,theme,theme_config&is_published=eq.true" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

At time of writing: **`/sofia`** — mocha theme, photo wallpaper, scrim 0.5,
promo code, 3 packages, collapsible accordion. The page to use for anything
touching wallpapers, themes or packages. **`/jucyjack`** — no wallpaper; the
control for "no wallpaper means no layer".

## Surfaces

- **Public creator page** → `http://localhost:3112/<username>`. Open directly.
- **Editor phone preview** (`PhonePreview`, `.phone-screen`) → behind login at
  `/dashboard`, `/dashboard/design`. With no credentials, stand up a throwaway
  route that loads a profile via `createPublicClient()` + `loadCreatorPage()`
  and renders `PhonePreview`. Two gotchas: an `_`-prefixed folder is private in
  Next and falls through to `/[username]` as a 404 — name it without one; and
  `PhonePreview` has no `"use client"` (it takes on the importing graph), so a
  server page importing it dies with `createContext only works in Client
  Components`. Re-export it through a tiny `"use client"` module. Delete the
  route afterwards.
- **Checkout** → `BuyButton`/`CheckoutModal`, only on the public page, and only
  when the profile has a wallet address.

## Driving

Playwright's chromium is already installed; the `playwright` module is not a
project dep — `npm install playwright --no-save --prefix <scratchpad>`.

Use a phone viewport (~405x720) for creator pages. For layout/paint questions,
measure `getBoundingClientRect()` + `getComputedStyle()` before and after the
interaction rather than eyeballing screenshots — but take the screenshots too,
since a stable box with a moved background still looks wrong.
