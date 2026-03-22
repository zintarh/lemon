/**
 * twitter.ts
 *
 * Posts date memory images to the official @lemon_onchain X (Twitter) account
 * after a date is completed. Downloads the image from IPFS gateway, uploads
 * it as media, then posts the tweet with the auto-generated caption.
 */

import { TwitterApi } from "twitter-api-v2";
import axios from "axios";

const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_SECRET!,
});

const rwClient = twitterClient.readWrite;

/**
 * Downloads an image from an IPFS gateway URL and returns it as a Buffer.
 */
async function fetchImageBuffer(ipfsCID: string): Promise<Buffer> {
  const gateway = process.env.PINATA_GATEWAY ?? "https://gateway.pinata.cloud";
  const url = `${gateway}/ipfs/${ipfsCID}`;
  const res = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(res.data as ArrayBuffer);
}

/**
 * Uploads an image to Twitter and returns the media ID.
 */
async function uploadMedia(imageBuffer: Buffer): Promise<string> {
  return await rwClient.v1.uploadMedia(imageBuffer, { mimeType: "image/png" });
}

/**
 * Posts the date memory image + caption to @lemon_onchain.
 */
export async function postDateTweet(params: {
  ipfsImageCID: string;
  caption: string;
}): Promise<{ tweetId: string; tweetUrl: string }> {
  const imageBuffer = await fetchImageBuffer(params.ipfsImageCID);
  const mediaId = await uploadMedia(imageBuffer);

  const tweet = await rwClient.v2.tweet({
    text: params.caption,
    media: { media_ids: [mediaId] },
  });

  const tweetId = tweet.data.id;
  return {
    tweetId,
    tweetUrl: `https://twitter.com/lemon_onchain/status/${tweetId}`,
  };
}
