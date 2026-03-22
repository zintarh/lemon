/**
 * Shared secret for server↔agent callbacks and privileged HTTP routes.
 * When LEMON_INTERNAL_SECRET is unset, checks are skipped (local dev only).
 */
import type { Request, Response } from "express";

const SECRET = process.env.LEMON_INTERNAL_SECRET;

export function internalSecretMatches(req: Request): boolean {
  if (!SECRET) return true;
  const header = req.headers["x-lemon-internal-secret"];
  const h = Array.isArray(header) ? header[0] : header;
  const auth = req.headers.authorization;
  const bearer =
    typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return h === SECRET || bearer === SECRET;
}

/** Returns false and sends 401 if secret is configured and request is invalid. */
export function requireInternalSecret(req: Request, res: Response): boolean {
  if (!SECRET) return true;
  if (internalSecretMatches(req)) return true;
  res.status(401).json({ error: "Unauthorized" });
  return false;
}

export function warnIfInternalSecretUnset(): void {
  if (!SECRET) {
    console.warn(
      "[server] LEMON_INTERNAL_SECRET is unset — privileged routes and agent callbacks are open. Set in production.",
    );
  }
}
