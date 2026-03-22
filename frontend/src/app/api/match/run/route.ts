import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies "run match now" to the Lemon server with LEMON_INTERNAL_SECRET.
 * The browser never sees the secret (avoids exposing it from the client).
 */
export async function POST() {
  const base = (process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000").replace(/\/$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.LEMON_INTERNAL_SECRET;
  if (secret) headers["X-Lemon-Internal-Secret"] = secret;

  try {
    const r = await fetch(`${base}/api/match/run`, { method: "POST", headers });
    const text = await r.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { error: text || "Invalid response from server" };
    }
    if (!r.ok) {
      return NextResponse.json(
        typeof body === "object" && body !== null ? body : { error: String(body) },
        { status: r.status },
      );
    }
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
