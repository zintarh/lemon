/**
 * Convert on-chain avatarURI (ipfs://, https://) to a URL usable in <img src>.
 * Uses NEXT_PUBLIC_PINATA_GATEWAY when set (matches Pinata uploads); otherwise Pinata public gateway.
 */
export function avatarUriToDisplayUrl(uri?: string | null): string | null {
  if (uri == null || typeof uri !== "string") return null;
  const u = uri.trim();
  if (!u) return null;

  const lower = u.toLowerCase();
  if (lower.includes("placeholder")) return null;

  if (lower.startsWith("ipfs://")) {
    let path = u.slice("ipfs://".length).replace(/^\/+/, "");
    if (path.toLowerCase().startsWith("ipfs/")) path = path.slice(5);
    if (!path) return null;

    const base = (process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud").replace(/\/$/, "");
    return `${base}/ipfs/${path}`;
  }

  if (lower.startsWith("http://") || lower.startsWith("https://")) return u;

  return null;
}

/** For props that expect `string | undefined` */
export function avatarUriToDisplayUrlOrUndefined(uri?: string | null): string | undefined {
  return avatarUriToDisplayUrl(uri) ?? undefined;
}
