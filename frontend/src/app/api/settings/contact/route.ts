import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !key?.trim()) return null;
  return createClient(url, key);
}

const emptyContact = {
  telegram_handle: "",
  email: "",
  phone: "",
  reveal_price_cents: 0,
};

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(emptyContact);
  }

  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "missing wallet" }, { status: 400 });

  const { data, error } = await supabase
    .from("contact_reveals")
    .select("telegram_handle, email, phone, reveal_price_cents")
    .eq("wallet", wallet.toLowerCase())
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? emptyContact);
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Contact storage not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)" }, { status: 503 });
  }

  const body = await req.json() as {
    wallet: string;
    telegram_handle: string;
    email: string;
    phone: string;
    reveal_price_cents?: number;
  };
  if (!body.wallet?.startsWith("0x")) {
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("contact_reveals")
    .select("telegram_chat_id")
    .eq("wallet", body.wallet.toLowerCase())
    .single();

  const { error } = await supabase.from("contact_reveals").upsert(
    {
      wallet: body.wallet.toLowerCase(),
      telegram_handle: body.telegram_handle ?? "",
      telegram_chat_id: existing?.telegram_chat_id ?? "",
      email: body.email ?? "",
      phone: body.phone ?? "",
      reveal_price_cents: body.reveal_price_cents ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "wallet" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
