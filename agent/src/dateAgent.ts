/**
 * dateAgent.ts
 *
 * Orchestrates the post-conversation date flow:
 *  1. Resolves payer mode based on agent billing preferences
 *  2. Triggers x402 payment via server wallet
 *  3. Generates AI image of the two agents on their date
 *  4. Uploads image to IPFS and builds NFT metadata
 *  5. Returns all data needed by the server to call LemonDate.bookDate + LemonNFT.mintDateMemory
 */

import { fal } from "@fal-ai/client";
import axios from "axios";
import type { AgentProfile } from "./matchingEngine.js";
import { triggerX402Payment, type X402PaymentResult } from "./x402.js";

fal.config({ credentials: process.env.FAL_KEY ?? "" });

// ─── Types ────────────────────────────────────────────────────────────────────

export type DateTemplate = "COFFEE" | "BEACH" | "WORK" | "ROOFTOP_DINNER" | "GALLERY_WALK";
export type BillingMode = "SPLIT" | "SOLO";
export type PayerMode = "AGENT_A" | "AGENT_B" | "SPLIT";

export interface DatePlan {
  agentA: string;           // wallet
  agentB: string;           // wallet
  template: DateTemplate;
  payerMode: PayerMode;
  payment: X402PaymentResult; // result of the x402 payment trigger
  imagePrompt: string;
  imageUrl: string;         // generated image (temporary URL)
  ipfsImageCID: string;
  metadataURI: string;      // ipfs://... pointing to NFT JSON
  tweetCaption: string;
}

// ─── Payer Resolution ─────────────────────────────────────────────────────────

/**
 * Determines PayerMode from the two agents' billing preferences.
 * When both are SOLO, the server contract handles alternation — we return
 * AGENT_A as a placeholder (the server will call resolveNextPayer on-chain).
 */
export function resolvePayerMode(
  profileA: AgentProfile,
  profileB: AgentProfile
): PayerMode {
  if (profileA.billingMode === "SPLIT" && profileB.billingMode === "SPLIT") return "SPLIT";
  if (profileA.billingMode === "SOLO" && profileB.billingMode === "SPLIT") return "AGENT_A";
  if (profileA.billingMode === "SPLIT" && profileB.billingMode === "SOLO") return "AGENT_B";
  // Both SOLO — will be resolved on-chain; default to AGENT_A as placeholder
  return "AGENT_A";
}

// ─── Image Generation ─────────────────────────────────────────────────────────

const DATE_SCENE_PROMPTS: Record<DateTemplate, string> = {
  COFFEE: "two cute robot avatars sitting across from each other at a cozy cafe table, warm lighting, coffee cups on the table, soft watercolor illustration style",
  BEACH: "two cute robot avatars walking along a sunny beach at golden hour, waves in the background, playful and colorful digital art",
  WORK: "two cute robot avatars sitting side by side at a modern co-working space, laptops open, focused but friendly expressions, clean minimal illustration",
  ROOFTOP_DINNER: "two cute robot avatars at an elegant rooftop dinner table at sunset, city skyline in the background, candles and flowers on the table, romantic digital painting",
  GALLERY_WALK: "two cute robot avatars walking through a bright art gallery, colorful paintings on the walls, thoughtful expressions, warm artistic illustration",
};

/**
 * Generates an AI image for the date using Flux Dev on fal.ai.
 * Incorporates both agent names into the prompt for personalization.
 */
export async function generateDateImage(
  profileA: AgentProfile,
  profileB: AgentProfile,
  template: DateTemplate
): Promise<{ imageUrl: string; prompt: string }> {
  const sceneBase = DATE_SCENE_PROMPTS[template];
  if (!sceneBase) throw new Error(`[dateAgent] Unknown date template: "${template}"`);
  const prompt = `${sceneBase}. The two robots are named ${profileA.name} and ${profileB.name}. High quality, charming, shareable social media art.`;

  const result = await fal.subscribe("fal-ai/flux/dev", {
    input: {
      prompt,
      image_size: "square_hd",
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      enable_safety_checker: true,
    },
  }) as unknown as { images: { url: string }[] };

  const imageUrl = result.images?.[0]?.url;
  if (!imageUrl) throw new Error("[dateAgent] Flux Dev returned no image URL");
  return { imageUrl, prompt };
}

// ─── IPFS Upload (Pinata) ─────────────────────────────────────────────────────

/**
 * Uploads an image URL to IPFS via Pinata.
 * Downloads the image first, then pins the binary.
 */
export async function uploadImageToIPFS(imageUrl: string, fileName: string): Promise<string> {
  const imageRes = await axios.get(imageUrl, { responseType: "arraybuffer" });
  const buffer = Buffer.from(imageRes.data as ArrayBuffer);

  // Use native Node.js 18+ FormData + Blob for the Pinata multipart upload
  const blob = new Blob([buffer], { type: "image/png" });
  const form = new globalThis.FormData();
  form.append("file", blob, fileName);
  form.append("pinataMetadata", JSON.stringify({ name: fileName }));

  const pinRes = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", form, {
    headers: {
      pinata_api_key: process.env.PINATA_API_KEY!,
      pinata_secret_api_key: process.env.PINATA_SECRET_KEY!,
    },
  });

  const cid = pinRes.data?.IpfsHash;
  if (!cid) throw new Error("[dateAgent] Pinata image upload returned no IpfsHash");
  return cid as string;
}

/**
 * Uploads NFT metadata JSON to IPFS via Pinata.
 */
export async function uploadMetadataToIPFS(metadata: object, name: string): Promise<string> {
  const res = await axios.post(
    "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    {
      pinataContent: metadata,
      pinataMetadata: { name },
    },
    {
      headers: {
        pinata_api_key: process.env.PINATA_API_KEY!,
        pinata_secret_api_key: process.env.PINATA_SECRET_KEY!,
      },
    }
  );
  const cid = res.data?.IpfsHash;
  if (!cid) throw new Error("[dateAgent] Pinata metadata upload returned no IpfsHash");
  return cid as string;
}

// ─── Tweet Caption Generation ─────────────────────────────────────────────────

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
  sharedInterests: string[]
): string {
  const label = TEMPLATE_LABELS[template];
  const interests = sharedInterests.slice(0, 2).join(" & ");
  return (
    `✨ @${profileA.name} and @${profileB.name} just went on a ${label} on @LemonDates!\n` +
    (interests ? `They bonded over ${interests}. 💛\n` : "") +
    `Their AI agents did all the work — from matching to payment to date planning. 🍋\n` +
    `#LemonDates #AIAgents #Celo`
  );
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

/**
 * Runs the full post-conversation date flow and returns the DatePlan
 * that the server uses to call on-chain contracts and post to Twitter.
 */
export async function planDate(
  profileA: AgentProfile,
  profileB: AgentProfile,
  template: DateTemplate,
  sharedInterests: string[]
): Promise<DatePlan> {
  const payerMode = resolvePayerMode(profileA, profileB);

  // 1. Trigger x402 payment — must succeed before date assets are created
  console.log(`[dateAgent] Triggering x402 payment (payerMode=${payerMode})…`);
  const payment = await triggerX402Payment(
    profileA.wallet as `0x${string}`,
    profileB.wallet as `0x${string}`,
    payerMode
  );
  console.log(`[dateAgent] Payment ${payment.mock ? "mock" : "confirmed"}: ${payment.txHash}`);

  // 2. Generate date image
  const { imageUrl, prompt } = await generateDateImage(profileA, profileB, template);

  // 3. Upload image to IPFS
  const imageCID = await uploadImageToIPFS(imageUrl, `lemon-date-${profileA.wallet}-${profileB.wallet}.png`);
  const ipfsImageUrl = `ipfs://${imageCID}`;

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
      { trait_type: "x402 Tx Hash", value: payment.txHash },
      { trait_type: "Payment Mode", value: payerMode },
    ],
  };

  const metadataCID = await uploadMetadataToIPFS(
    metadata,
    `lemon-metadata-${profileA.wallet}-${profileB.wallet}.json`
  );

  // 5. Build tweet caption
  const tweetCaption = generateTweetCaption(profileA, profileB, template, sharedInterests);

  return {
    agentA: profileA.wallet,
    agentB: profileB.wallet,
    template,
    payerMode,
    payment,
    imagePrompt: prompt,
    imageUrl,
    ipfsImageCID: imageCID,
    metadataURI: `ipfs://${metadataCID}`,
    tweetCaption,
  };
}
