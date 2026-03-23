# Railway deploy (monorepo)

Use **Node 20+**. The repo root `package.json` declares `engines.node` and `nixpacks.toml` sets `NIXPACKS_NODE_VERSION = "20"`.

## Service: Lemon **server** (Express API)

| Setting | Value |
|--------|--------|
| **Root directory** | Repository root (where the root `package.json` lives) |
| **Build command** | `npm install && npm run build` (or `npm run build:server`) |
| **Start command** | `npm run start` or `node server/dist/index.js` |

Uses root `nixpacks.toml` when Nixpacks is the builder. If you use **`server/railway.json`**, point Railway at the `server` folder or paste its `buildCommand` / `startCommand` into the service settings.

## Service: Lemon **agent**

| Setting | Value |
|--------|--------|
| **Root directory** | Repository root |
| **Build command** | `npm install && npm run build:agent` |
| **Start command** | `AGENT_PORT=$PORT npm run start:agent` — or `AGENT_PORT=$PORT node agent/dist/index.js` after `npm run build:agent` |

(`AGENT_PORT=$PORT` maps Railway’s dynamic port; see main `DEPLOYMENT.md`.)

## Service: **Next.js frontend** (only if hosting frontend on Railway)

Do **not** use the root default `npm run build` (that builds the **server**). Set explicitly:

| Setting | Value |
|--------|--------|
| **Root directory** | Repository root |
| **Build command** | `npm install && npm run build:frontend` |
| **Start command** | `npm run start:frontend` |

Prefer **Vercel** for the Next app; see `frontend/VERCEL.md`.

## Error: `Cannot find module '/app/agent/dist/index.js'`

The **agent** service is starting **`node agent/dist/index.js`** but **`npm run build` at the repo root only builds the server** (`build` → `@lemon/server`). Nothing compiled the agent.

**Fix:** Set **Build Command** to:

```bash
npm install && npm run build:agent
```

**Start Command** (listen on Railway’s `PORT`):

```bash
AGENT_PORT=$PORT node agent/dist/index.js
```

`agent/railway.json` / `agent/railway.toml` in this repo are updated to match.

---

## Error: `Cannot find module '/app/dist/index.js'`

Railway is running **`node dist/index.js`** from the **repo root** (`/app`). In this monorepo, `tsc` writes to **`server/dist/index.js`**, not `/app/dist/index.js`.

**Fix:** Set **Start Command** to one of:

- `node server/dist/index.js`
- `npm run start` (root `package.json` maps this to the same path)

The repo root **`railway.toml`** sets this for new links; if your service still uses `node dist/index.js`, change it in **Railway → Service → Settings → Deploy**.

## What went wrong before

- `npm run build` at the **monorepo root** had no script → **Missing script: "build"**. Root `package.json` now defines `build` for the server.
- Nixpacks defaulted to **Node 18** while dependencies expect **Node 20+** → many `EBADENGINE` warnings; use `engines` + `NIXPACKS_NODE_VERSION` as above.
