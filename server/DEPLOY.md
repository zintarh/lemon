# Deploy the Lemon server (step by step)

The server is a **long-running Node process** (Express). Deploy it on Railway, Render, Fly.io, or a VPS — **not** on Vercel serverless.

**Before you start:** Your **frontend** on Vercel must use  
`NEXT_PUBLIC_SERVER_URL=https://<your-server-public-url>`  
(no trailing slash). After the server is live, set that URL in Vercel and redeploy if needed.

The server also needs the **agent** reachable at **`AGENT_URL`** (see [Agent deploy](#5-deploy-or-point-to-the-agent) below).

---

## 1. Pick a host

| Platform | Good for |
|----------|----------|
| **[Railway](https://railway.app)** | GitHub deploy, simple env UI, private networking between services |
| **[Render](https://render.com)** | Free tier (with spin-down), Web Service |
| **[Fly.io](https://fly.io)** | Global regions, Docker |

These steps use a **generic** flow; adapt names to your provider.

---

## 2. Connect the repo

1. Create a new **Web Service** / **Service** from your GitHub repo.
2. **Root directory:** use the **monorepo root** (folder that contains `package.json` with `"workspaces"`).  
   Do **not** deploy only the `server` folder unless you copy `package-lock.json` and install deps inside `server` yourself — easiest is **root** + commands below.

---

## 3. Build & start commands

From the **repository root**:

| Step | Command |
|------|---------|
| **Install** | `npm install` |
| **Build (optional)** | `npm run build --workspace=server` — TypeScript check; runtime uses `tsx` so this is optional |
| **Start** | `npm run start --workspace=server` |

**Note:** `server` loads env from the monorepo `.env` **if present** (`loadEnv.ts`), but in production you should set **all variables in the host’s dashboard** — a file is not required.

---

## 4. Listen port

The server listens on **`SERVER_PORT`**, or **`PORT`** (many hosts set `PORT` automatically), default **4000**.

On Railway/Render, **`PORT` is usually set for you** — the code now honors `PORT` if `SERVER_PORT` is unset.

---

## 5. Deploy or point to the agent

Matching, conversations, and date planning call the **agent** over HTTP:

- Set **`AGENT_URL`** to the agent’s base URL, e.g. `http://localhost:5000` (same machine) or `https://your-agent.railway.internal` / public URL of a second service.
- Do **not** include a path — only the origin (e.g. `https://agent.example.com`).

If the agent is **not** running yet, deploy it as a second service (see root **`DEPLOYMENT.md`**) or run it on the same VM before relying on match/conversation features.

---

## 6. Public URL for callbacks

Set **`SERVER_URL`** to the **exact public HTTPS base** of this API (what the browser and webhooks use), e.g. `https://your-api.up.railway.app`.

Used for conversation callbacks like  
`/api/conversation/message`.

---

## 7. Environment variables (copy from local)

In your host’s **Variables** / **Environment** tab, add the same secrets you use locally. Minimum for core flows:

**Required (typical)**

| Variable | Example / note |
|----------|----------------|
| `NETWORK` | `testnet` or `mainnet` |
| `CELO_RPC_URL` | Mainnet RPC |
| `CELO_SEPOLIA_RPC_URL` | Testnet RPC |
| `DEPLOYER_PRIVATE_KEY` | Server wallet that signs txs (keep secret) |
| `LEMON_AGENT_CONTRACT` | On-chain address |
| `LEMON_DATE_CONTRACT` | On-chain address |
| `LEMON_NFT_CONTRACT` | On-chain address |
| `SUPABASE_URL` | From Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role, never expose to browser |
| `AGENT_URL` | Agent HTTP origin |
| `SERVER_URL` | This server’s public `https://…` base |
| `LEMON_INTERNAL_SECRET` | **Strong random string**, same on agent + Vercel. Protects match runner, conversation callbacks, reset, date/book, agent HTTP. Leave unset **only** for local dev. |
| `TELEGRAM_WEBHOOK_SECRET` | Optional; must match Telegram `secret_token` on `setWebhook` — rejects forged webhook posts |

**Feature-specific (set when you use that feature)**

- **Twitter:** `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET`, `TWITTER_BEARER_TOKEN`
- **Pinata:** `PINATA_API_KEY`, `PINATA_SECRET_KEY`, `PINATA_GATEWAY`
- **x402 / Thirdweb:** `THIRDWEB_SECRET_KEY`, `SERVER_WALLET_ADDRESS`, etc.
- **Telegram:** `TELEGRAM_BOT_TOKEN`, optionally `TELEGRAM_BOT_USERNAME`
- **ERC-8004:** `CHAOSCHAIN_API_KEY`, registry addresses
- **Matching interval:** `MATCH_INTERVAL_MS` (optional)

Full list: **`.env.example`** at repo root.

---

## 8. Smoke test

After deploy:

1. `GET https://<your-server>/health` → should return JSON `{ "status": "ok", ... }`.
2. From your **deployed frontend**, register an agent or hit any API that uses `NEXT_PUBLIC_SERVER_URL`.
3. If CORS errors appear, the server uses `cors({ origin: true })` — usually fine; if you locked origins, add your Vercel domain.

---

## 9. Point Vercel at this server

1. Vercel → Project → **Environment Variables**
2. Set **`NEXT_PUBLIC_SERVER_URL`** = `https://<your-server-host>` (no trailing slash)
3. Redeploy the frontend (or wait for next build)

---

## Optional: custom domain

1. Add domain in Railway/Render/Fly DNS instructions.
2. Update **`SERVER_URL`** to `https://api.yourdomain.com`.
3. Update **`NEXT_PUBLIC_SERVER_URL`** on Vercel to the same value.

---

## Troubleshooting

| Symptom | Check |
|--------|--------|
| 502 / crash on boot | Missing `SUPABASE_*`, `DEPLOYER_PRIVATE_KEY`, or contract env |
| Match/conversation 500 | Agent down or wrong **`AGENT_URL`** (server cannot reach agent) |
| Webhook never hits server | Wrong **`SERVER_URL`** or not publicly reachable |
| Wrong chain | **`NETWORK`** and RPC URLs (`CELO_*`) aligned with contracts |
