/**
 * dateAgent.ts
 *
 * Orchestrates the post-conversation date flow:
 *  1. Resolves payer mode based on agent billing preferences
 *  2. Triggers x402 payment via server wallet
 *  3. Generates AI image of the two agents on their date (Gemini 2.0 Flash)
 *  4. Uploads image to IPFS and builds NFT metadata
 *  5. Returns all data needed by the server to call LemonDate.bookDate + LemonNFT.mintDateMemory
 *
 * Image generation uses Gemini 2.0 Flash with the users' actual profile photos
 * as reference images, placing them in a photorealistic date scene.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import type { AgentProfile } from "./matchingEngine.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

// ─── Types ────────────────────────────────────────────────────────────────────

export type DateTemplate =
  | "COFFEE"
  | "BEACH"
  | "WORK"
  | "ROOFTOP_DINNER"
  | "GALLERY_WALK";
export type BillingMode = "SPLIT" | "SOLO";
export type PayerMode = "AGENT_A" | "AGENT_B" | "SPLIT";

export interface DatePlan {
  agentA: string; // wallet
  agentB: string; // wallet
  template: DateTemplate;
  payerMode: PayerMode;
  imagePrompt: string;
  imageUrl: string; // IPFS gateway URL of the generated image
  ipfsImageCID: string;
  metadataURI: string; // ipfs://... pointing to NFT JSON
  tweetCaption: string;
}

// ─── Payer Resolution ─────────────────────────────────────────────────────────

export function resolvePayerMode(
  profileA: AgentProfile,
  profileB: AgentProfile,
): PayerMode {
  if (profileA.billingMode === "SPLIT" && profileB.billingMode === "SPLIT")
    return "SPLIT";
  if (profileA.billingMode === "SOLO" && profileB.billingMode === "SPLIT")
    return "AGENT_A";
  if (profileA.billingMode === "SPLIT" && profileB.billingMode === "SOLO")
    return "AGENT_B";
  return "AGENT_A";
}

// ─── Image Generation (Gemini 2.0 Flash) ──────────────────────────────────────

const DATE_SCENE_PROMPTS: Record<DateTemplate, string> = {
  COFFEE:
    "having coffee together at a cozy café — sitting across from each other at a wooden table, warm ambient lighting, coffee cups between them, natural smiles, bokeh background",
  BEACH:
    "walking barefoot along a sunny beach at golden hour — gentle waves behind them, casual summer attire, laughing naturally, warm light",
  WORK:
    "co-working together at a bright modern coffee shop — laptops open side by side, friendly focused expressions, natural window light",
  ROOFTOP_DINNER:
    "sharing a romantic rooftop dinner at dusk — city skyline in the background, candles and flowers on the table, elegant attire, warm golden lighting",
  GALLERY_WALK:
    "exploring a contemporary art gallery together — colorful artworks on white walls, thoughtful expressions, casual chic outfits, soft natural lighting",
};

/**
 * Resolves an IPFS URI (ipfs://CID) to an accessible HTTP URL.
 * Returns null if the URI is empty or a placeholder.
 */
function resolveAvatarUrl(uri: string | undefined): string | null {
  if (!uri || uri === "ipfs://placeholder" || uri.trim() === "") return null;
  if (uri.startsWith("ipfs://")) {
    return `https://gateway.pinata.cloud/ipfs/${uri.slice(7)}`;
  }
  return uri;
}

/**
 * Downloads an image from a URL and returns it as base64 with its MIME type.
 */
async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  const buffer = Buffer.from(res.data as ArrayBuffer);
  const mimeType = ((res.headers["content-type"] as string) ?? "image/jpeg").split(";")[0].trim();
  return { data: buffer.toString("base64"), mimeType };
}

/**
 * Generates the date image using Gemini 2.0 Flash.
 *
 * If both agents have uploaded profile photos, they are passed as reference
 * images so Gemini places those specific people in the scene.
 * Falls back to a text-only generation if photos are unavailable.
 *
 * Returns the image as a Buffer (Gemini sends base64 inline data, not a URL).
 * Throws on failure — booking will not proceed without the image.
 */
export async function generateDateImage(
  profileA: AgentProfile,
  profileB: AgentProfile,
  template: DateTemplate,
): Promise<{ imageBuffer: Buffer; imageMimeType: string; prompt: string }> {
  const scene = DATE_SCENE_PROMPTS[template];
  if (!scene) throw new Error(`[dateAgent] Unknown date template: "${template}"`);

  const avatarUrlA = resolveAvatarUrl(profileA.avatarUri);
  const avatarUrlB = resolveAvatarUrl(profileB.avatarUri);
  const hasPhotos = !!(avatarUrlA || avatarUrlB);

  let prompt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [];

  if (hasPhotos) {
    prompt =
      `Generate a single photorealistic lifestyle photo of the real people shown in the reference image(s) ` +
      `${scene}. ` +
      `Preserve each person's actual appearance, face, and features exactly as shown. ` +
      `The result should look like a genuine candid photo — natural poses, realistic lighting, high resolution. ` +
      `Do not add text or watermarks.`;

    parts.push({ text: prompt });

    if (avatarUrlA) {
      console.log("[dateAgent] Fetching avatar for agent A…");
      const img = await fetchAsBase64(avatarUrlA);
      parts.push({ inlineData: img });
    }
    if (avatarUrlB) {
      console.log("[dateAgent] Fetching avatar for agent B…");
      const img = await fetchAsBase64(avatarUrlB);
      parts.push({ inlineData: img });
    }
  } else {
    prompt =
      `Generate a photorealistic candid lifestyle photo of two people ` +
      `${scene}. ` +
      `High quality, natural lighting, editorial photography style. No text or watermarks.`;
    parts.push({ text: prompt });
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-preview-image-generation",
    // @ts-expect-error — responseModalities not yet typed in SDK
    generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
  });

  console.log(`[dateAgent] Calling Gemini 2.0 Flash image gen (hasPhotos=${hasPhotos})…`);

  const result = await model.generateContent(parts);

  // Extract generated image from response
  for (const part of result.response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      const imageBuffer = Buffer.from(part.inlineData.data, "base64");
      const imageMimeType = part.inlineData.mimeType ?? "image/png";
      console.log("[dateAgent] Gemini image generated ✓");
      return { imageBuffer, imageMimeType, prompt };
    }
  }

  throw new Error("[dateAgent] Gemini returned no image in response");
}

// ─── IPFS Upload (Pinata) ─────────────────────────────────────────────────────

/**
 * Pins an image buffer to IPFS via Pinata. Returns the CID.
 */
export async function uploadImageToIPFS(
  imageBuffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<string> {
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
  const form = new globalThis.FormData();
  form.append("file", blob, fileName);
  form.append("pinataMetadata", JSON.stringify({ name: fileName }));

  const pinRes = await axios.post(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    form,
    {
      headers: {
        pinata_api_key: process.env.PINATA_API_KEY!,
        pinata_secret_api_key: process.env.PINATA_SECRET_KEY!,
      },
    },
  );

  const cid = pinRes.data?.IpfsHash;
  if (!cid) throw new Error("[dateAgent] Pinata image upload returned no IpfsHash");
  return cid as string;
}

/**
 * Uploads NFT metadata JSON to IPFS via Pinata. Returns the CID.
 */
export async function uploadMetadataToIPFS(
  metadata: object,
  name: string,
): Promise<string> {
  const res = await axios.post(
    "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    { pinataContent: metadata, pinataMetadata: { name } },
    {
      headers: {
        pinata_api_key: process.env.PINATA_API_KEY!,
        pinata_secret_api_key: process.env.PINATA_SECRET_KEY!,
      },
    },
  );
  const cid = res.data?.IpfsHash;
  if (!cid) throw new Error("[dateAgent] Pinata metadata upload returned no IpfsHash");
  return cid as string;
}

// ─── Tweet Caption ─────────────────────────────────────────────────────────────

const TEMPLATE_LABELS: Record<DateTemplate, string> = {
  COFFEE: "Coffee Date ☕",
  BEACH: "Beach Date 🏖️",
  WORK: "Work Date 💻",
  ROOFTOP_DINNER: "Rooftop Dinner Date 🌆",
  GALLERY_WALK: "Gallery & Walk Date 🎨",
};

export function generateTweetCaption(
  profileA: AgentProfile,
  profileB: AgentProfile,
  template: DateTemplate,
  sharedInterests: string[],
): string {
  const label = TEMPLATE_LABELS[template];
  const interests = sharedInterests.slice(0, 2).join(" & ");
  return (
    `✨ @${profileA.name} and @${profileB.name} just went on a ${label} on @lemon_onchain!\n` +
    (interests ? `They bonded over ${interests}. 💛\n` : "") +
    `Their AI agents did all the work — from matching to payment to date planning. 🍋`
  );
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export async function planDate(
  profileA: AgentProfile,
  profileB: AgentProfile,
  template: DateTemplate,
  sharedInterests: string[],
  /** When both agents are SOLO, billing flags alone cannot encode on-chain rotation — server passes the resolved payer. */
  chainResolvedPayer?: PayerMode,
): Promise<DatePlan> {
  const payerMode = chainResolvedPayer ?? resolvePayerMode(profileA, profileB);

  // Payment is collected by the server via x402 before planDate is called.
  // This function only generates the image, metadata, and tweet caption.

  // 1. Generate date image with Gemini
  const { imageBuffer, imageMimeType, prompt } = await generateDateImage(profileA, profileB, template);

  // 3. Pin image to IPFS
  const ext = imageMimeType === "image/jpeg" ? "jpg" : "png";
  const imageCID = await uploadImageToIPFS(
    imageBuffer,
    imageMimeType,
    `lemon-date-${profileA.wallet.slice(2, 8)}-${profileB.wallet.slice(2, 8)}.${ext}`,
  );
  const ipfsImageUrl = `ipfs://${imageCID}`;
  const imageUrl = `https://gateway.pinata.cloud/ipfs/${imageCID}`;

  // 4. Build and upload NFT metadata
  const metadata = {
    name: `Lemon Date: ${profileA.name} & ${profileB.name}`,
    description: `A ${template} date between ${profileA.name} and ${profileB.name}, powered by Lemon AI Dating on Celo.`,
    image: ipfsImageUrl,
    attributes: [
      { trait_type: "Date Template", value: template },
      { trait_type: "Agent A", value: profileA.name },
      { trait_type: "Agent B", value: profileB.name },
      { trait_type: "Shared Interests", value: sharedInterests.join(", ") },
      { trait_type: "Payment Mode", value: payerMode },
    ],
  };

  const metadataCID = await uploadMetadataToIPFS(
    metadata,
    `lemon-metadata-${profileA.wallet.slice(2, 8)}-${profileB.wallet.slice(2, 8)}.json`,
  );

  // 5. Build tweet caption
  const tweetCaption = generateTweetCaption(profileA, profileB, template, sharedInterests);

  return {
    agentA: profileA.wallet,
    agentB: profileB.wallet,
    template,
    payerMode,
    imagePrompt: prompt,
    imageUrl,
    ipfsImageCID: imageCID,
    metadataURI: `ipfs://${metadataCID}`,
    tweetCaption,
  };
}
