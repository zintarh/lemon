# Where to deploy frontend, server & agent

Lemon is three processes that talk **in one direction** (browser → server → agent), not three equal peers.

```
┌─────────────┐     NEXT_PUBLIC_SERVER_URL      ┌─────────────┐      AGENT_URL       ┌─────────────┐
│   Browser   │ ──────────────────────────────► │   server/   │ ──────────────────► │   agent/    │
│  (Vercel)   │         HTTPS API               │  Express    │    HTTP (private)   │  AI runtime │
└─────────────┘                                 └─────────────┘                     └─────────────┘
       │                                                │
       │  Wallet / contracts / Privy                    │  Chain RPC, Supabase,
       │  (public env on Vercel)                        │  indexer, matcher, x402
       └────────────────────────────────────────────────┘
```

## 1. Frontend (`frontend/`) → **Vercel** (recommended)

- **What it is:** Next.js app (pages + optional `/api/*` routes).
- **Connects to:** Your **server** only, via **`NEXT_PUBLIC_SERVER_URL`** (must be the public `https://…` base URL of the API, **no** trailing slash).

Examples in code: `fetch(\`${process.env.NEXT_PUBLIC_SERVER_URL}/api/agents/register\`, …)`.

**Vercel env (minimum):**

- `NEXT_PUBLIC_SERVER_URL` = `https://api.yourdomain.com`
- `NEXT_PUBLIC_APP_URL` = `https://yourapp.vercel.app`
- Contract + wallet vars: `NEXT_PUBLIC_LEMON_*`, `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_NETWORK`, `NEXT_PUBLIC_PINATA_GATEWAY`, etc.

See also **`frontend/VERCEL.md`** for Next API routes (Supabase, Pinata, Twitter).

The **browser never calls the agent** directly; only the server does.

---

## 2. Server (`server/`) → **always-on Node host** (not Vercel)

- **What it is:** Express API + chain indexer + matcher + x402 + Telegram hooks, etc. **Long-running**.
- **Good options:** [Railway](https://railway.app) — see **[`RAILWAY.md`](RAILWAY.md)** for monorepo build/start commands and Node 20, plus [Render](https://render.com), [Fly.io](https://fly.io), a small VPS, AWS ECS/Fargate, Google Cloud Run (with min instances ≥ 1 if you need 24/7 indexer).

**Connects to:**

- **Agent:** `AGENT_URL` (see below).
- **Itself for webhooks:** `SERVER_URL` = same public base as users hit (e.g. `https://api.yourdomain.com`) so callbacks like conversation `callbackUrl` work.

**Server env (typical):**

- `AGENT_URL` = `http://agent:5000` (Docker network) **or** `https://agent-internal.yourinfra.com` (second service).
- `SERVER_URL` = `https://api.yourdomain.com`
- `PORT` = e.g. `4000` (what the platform maps to 443).
- Chain, contracts, deployer key, Supabase, Pinata, Thirdweb, OpenAI, etc. (see repo `.env.example`).

**CORS:** If the server checks origin, allow your Vercel domain.

---

## 3. Agent (`agent/`) → **second service** (same or another host)

- **What it is:** Small **HTTP** server (`AGENT_PORT`, default **5000**) exposing `/match`, `/conversation`, `/plan-date`, `/health`.
- **Who calls it:** **Only `server/`** (`axios.post(\`${AGENT_URL}/match\`, …)` in `server/src/index.ts`).

**Deploy options:**

| Approach | How |
|----------|-----|
| **Two services on Railway/Render/Fly** | Service A = server, Service B = agent; set `AGENT_URL` to B’s internal or public URL. |
| **One Docker Compose** | `server` + `agent` containers; `AGENT_URL=http://agent:5000`. |
| **One VM** | Run `npm run start --workspace=agent` and `npm run dev:server` (or `node` prod) with `AGENT_URL=http://127.0.0.1:5000`. |

**Security:** Prefer **private network** between server and agent (same VPC / internal URL). If the agent URL is public, restrict by firewall or secret header (not in repo today—add if you expose it).

**Agent env:** AI keys (OpenAI, etc.), Pinata, x402/Thirdweb if used by date planning—mirror what `agent/` reads from `.env` / `loadEnv.ts`.

---

## Quick checklist

| Piece | Deploy to | Frontend connects? |
|-------|-----------|---------------------|
| **frontend** | Vercel | Sets `NEXT_PUBLIC_SERVER_URL` → server |
| **server** | Railway / Render / Fly / VPS | No “connect to frontend”; browser calls server |
| **agent** | 2nd service or same machine as server | No; **server** sets `AGENT_URL` → agent |

**One line:** Put the **server** on a stable `https://api…` URL, set **`NEXT_PUBLIC_SERVER_URL`** on Vercel to that URL, and run the **agent** somewhere the **server** can reach with **`AGENT_URL`**.

**Step-by-step server deploy:** see **[`server/DEPLOY.md`](server/DEPLOY.md)**.

**Production hardening:** set **`LEMON_INTERNAL_SECRET`** to the same value on **server**, **agent**, and **Vercel** (for the `/api/match/run` proxy). Set **`TELEGRAM_WEBHOOK_SECRET`** to match your Telegram webhook `secret_token`.
