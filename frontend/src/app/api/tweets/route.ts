import { NextResponse } from "next/server";

const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const LEMON_TWITTER_USERNAME = "LemonDates";
const MAX_RESULTS = 20;

export interface Tweet {
  id: string;
  text: string;
  created_at: string;
  attachments?: { media_keys?: string[] };
  mediaUrl?: string; // resolved image URL
}

export async function GET() {
  if (!TWITTER_BEARER_TOKEN) {
    return NextResponse.json({ tweets: [], error: "Twitter bearer token not configured" }, { status: 200 });
  }

  try {
    // 1. Resolve user ID for @LemonDates
    const userRes = await fetch(
      `https://api.twitter.com/2/users/by/username/${LEMON_TWITTER_USERNAME}`,
      { headers: { Authorization: `Bearer ${TWITTER_BEARER_TOKEN}` } }
    );
    if (!userRes.ok) {
      throw new Error(`Twitter user lookup failed: ${userRes.status}`);
    }
    const userData = await userRes.json();
    const userId = userData?.data?.id;
    if (!userId) throw new Error("Could not find @LemonDates user ID");

    // 2. Fetch recent tweets with media expansions
    const timelineRes = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets` +
        `?max_results=${MAX_RESULTS}` +
        `&tweet.fields=created_at,attachments` +
        `&expansions=attachments.media_keys` +
        `&media.fields=url,preview_image_url,type`,
      { headers: { Authorization: `Bearer ${TWITTER_BEARER_TOKEN}` }, next: { revalidate: 300 } }
    );
    if (!timelineRes.ok) {
      throw new Error(`Twitter timeline failed: ${timelineRes.status}`);
    }
    const timelineData = await timelineRes.json();

    // Build media_key → URL map
    const mediaMap: Record<string, string> = {};
    for (const media of timelineData?.includes?.media ?? []) {
      if (media.media_key && (media.url || media.preview_image_url)) {
        mediaMap[media.media_key] = media.url ?? media.preview_image_url;
      }
    }

    const tweets: Tweet[] = (timelineData?.data ?? []).map((t: Tweet) => {
      const firstKey = t.attachments?.media_keys?.[0];
      return {
        id: t.id,
        text: t.text,
        created_at: t.created_at,
        mediaUrl: firstKey ? mediaMap[firstKey] : undefined,
      };
    });

    return NextResponse.json({ tweets });
  } catch (err) {
    console.error("[api/tweets]", err);
    return NextResponse.json({ tweets: [], error: String(err) }, { status: 200 });
  }
}
