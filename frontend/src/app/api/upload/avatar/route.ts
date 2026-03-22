/**
 * POST /api/upload/avatar
 *
 * Proxies image uploads to Pinata, keeping the API secret server-side.
 * Accepts multipart/form-data with a single "file" field.
 * Returns { cid, uri } where uri = "ipfs://<cid>"
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const apiKey = process.env.PINATA_API_KEY;
  const secretKey = process.env.PINATA_SECRET_KEY;

  if (!apiKey || !secretKey || apiKey === "..." || secretKey === "...") {
    return NextResponse.json({ error: "Pinata not configured" }, { status: 503 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 5 MB" }, { status: 400 });
  }

  // Forward to Pinata pinFileToIPFS
  const pinataForm = new FormData();
  pinataForm.append("file", file);
  pinataForm.append(
    "pinataMetadata",
    JSON.stringify({ name: `lemon-avatar-${Date.now()}` })
  );
  pinataForm.append(
    "pinataOptions",
    JSON.stringify({ cidVersion: 1 })
  );

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      pinata_api_key: apiKey,
      pinata_secret_api_key: secretKey,
    },
    body: pinataForm,
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Pinata error: ${text}` }, { status: 502 });
  }

  const { IpfsHash } = await res.json();
  return NextResponse.json({ cid: IpfsHash, uri: `ipfs://${IpfsHash}` });
}
