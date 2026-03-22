import { NextResponse } from "next/server";
import OpenAI from "openai";

const LOOKING_FOR_IDS = ["connection", "conversations", "adventures", "fun", "stability", "growth", "stimulation", "spontaneity"];
const DEAL_BREAKER_IDS = ["smoking", "dishonesty", "ambition", "flakey", "negativity", "closed"];

export async function POST(req: Request) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const { nameAnswer, aboutAnswer, lookingForAnswer, dealBreakersAnswer } = await req.json();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You extract a dating agent profile from voice transcripts. Return a JSON object with exactly these fields:
- "name": string — the person's name (clean it up, title case)
- "personality": string — a 2-3 sentence first-person personality description based on their "about me" answer. Write it in third-person ("They are..." style is fine, or "An adventurous spirit who...").
- "lookingFor": string[] — array of IDs that best match what they want. Pick from: ${LOOKING_FOR_IDS.join(", ")}. Pick 2-4 that best match.
- "dealBreakers": string[] — array of IDs from: ${DEAL_BREAKER_IDS.join(", ")}. Pick 1-3 that best match.

Return only valid JSON, no markdown.`,
      },
      {
        role: "user",
        content: `Name answer: "${nameAnswer}"
About me: "${aboutAnswer}"
Looking for: "${lookingForAnswer}"
Deal breakers: "${dealBreakersAnswer}"`,
      },
    ],
    response_format: { type: "json_object" },
  });

  try {
    const data = JSON.parse(completion.choices[0].message.content ?? "{}");
    // Validate arrays contain only valid IDs
    const lookingFor = (data.lookingFor ?? []).filter((id: string) => LOOKING_FOR_IDS.includes(id));
    const dealBreakers = (data.dealBreakers ?? []).filter((id: string) => DEAL_BREAKER_IDS.includes(id));
    return NextResponse.json({
      name: data.name ?? nameAnswer,
      personality: data.personality ?? aboutAnswer,
      lookingFor: lookingFor.length > 0 ? lookingFor : ["connection"],
      dealBreakers: dealBreakers.length > 0 ? dealBreakers : ["dishonesty"],
    });
  } catch {
    return NextResponse.json({ error: "Failed to parse profile" }, { status: 500 });
  }
}
