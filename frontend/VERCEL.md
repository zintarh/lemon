# Deploy Lemon frontend on Vercel

**Full stack (frontend + server + agent):** see **[`../DEPLOYMENT.md`](../DEPLOYMENT.md)** — the browser only talks to the **server** via `NEXT_PUBLIC_SERVER_URL`; the server calls the **agent** via `AGENT_URL`.

## Project settings

| Setting | Value |
|--------|--------|
| **Framework Preset** | Next.js |
| **Root Directory** | `frontend` (from monorepo root) |
| **Build Command** | `npm run build` (default) |
| **Install Command** | `npm install` — if Vercel clones only `frontend`, dependencies must live in `frontend/package.json` (including `@supabase/supabase-js`). |
| **Output** | Next.js default (no static export) |

## Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (Production / Preview as needed).

### Match button (proxied route)

- `LEMON_INTERNAL_SECRET` — **same value** as on the Lemon server (and agent). Used by `POST /api/match/run` (Next) to call the backend without exposing the secret in the browser. If unset locally, the server also allows unauthenticated match runs (dev only).

### Required for core app (wallet, contracts)

- `NEXT_PUBLIC_LEMON_AGENT_CONTRACT`
- `NEXT_PUBLIC_LEMON_DATE_CONTRACT`
- `NEXT_PUBLIC_LEMON_NFT_CONTRACT`
- `NEXT_PUBLIC_NETWORK` — `testnet` or `mainnet`
- `NEXT_PUBLIC_PRIVY_APP_ID`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `NEXT_PUBLIC_SERVER_URL` — your backend API base URL (e.g. `https://api.yourdomain.com`)
- `NEXT_PUBLIC_APP_URL` — this site’s public URL (e.g. `https://yourapp.vercel.app`)
- `NEXT_PUBLIC_PINATA_GATEWAY` — e.g. `https://gateway.pinata.cloud`

### Optional: Next.js API routes on Vercel

| Variable | Used by |
|----------|---------|
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | `/api/settings/contact`, `/api/agents` — if unset, routes return empty data / 503 on POST contact |
| `PINATA_API_KEY` + `PINATA_SECRET_KEY` | `/api/upload/avatar` — if unset, returns 503 |
| `TWITTER_BEARER_TOKEN` | `/api/tweets` — if unset or API errors, returns empty tweets |

**Never** prefix `SUPABASE_SERVICE_ROLE_KEY` or `PINATA_SECRET_KEY` with `NEXT_PUBLIC_`.

## Monorepo note

If the Vercel project **root** is the repo root (not `frontend`), set **Root Directory** to `frontend` so Vercel runs `next build` from that folder. Alternatively use a root `vercel.json` with `cd frontend && npm install && npm run build` — the dedicated `frontend` root is simpler.
