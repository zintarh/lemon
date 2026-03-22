/**
 * loadEnv.ts — must be the FIRST import in index.ts.
 *
 * `dotenv/config` uses process.cwd() to find .env, which breaks in a
 * monorepo where each workspace is run from its own directory.
 * This file uses import.meta.url to resolve the root .env regardless of CWD.
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Try monorepo root first (.env two levels up), then local .env — both are optional in production
config({ path: resolve(__dirname, "../../.env") });
config({ path: resolve(__dirname, "../.env") });
