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

## What went wrong before

- `npm run build` at the **monorepo root** had no script → **Missing script: "build"**. Root `package.json` now defines `build` for the server.
- Nixpacks defaulted to **Node 18** while dependencies expect **Node 20+** → many `EBADENGINE` warnings; use `engines` + `NIXPACKS_NODE_VERSION` as above.
