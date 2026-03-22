import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Try monorepo root first, then local — both optional in production
config({ path: resolve(__dirname, "../../.env") });
config({ path: resolve(__dirname, "../.env") });
