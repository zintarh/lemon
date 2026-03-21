import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// agent/src -> agent -> monorepo root
config({ path: resolve(__dirname, "../../.env") });
