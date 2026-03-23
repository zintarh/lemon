/**
 * twitter.ts
 *
 * Posts date memory images to the official @lemon_onchain X (Twitter) account
 * after a date is completed. Downloads the image from IPFS gateway, uploads
 * it as media, then posts the tweet with the auto-generated caption.
 */

import { TwitterApi, type TwitterApiReadWrite } from "twitter-api-v2";
import axios from "axios";

/** Lazy init — do not construct TwitterApi at module load (invalid/missing env crashes the whole server on Railway). */
let _rwClient: TwitterApiReadWrite | undefined;

function getRwClient(): TwitterApiReadWrite {
  if (_rwClient) return _rwClient;
  const appKey = process.env.TWITTER_API_KEY?.trim();
  const appSecret = process.env.TWITTER_API_SECRET?.trim();
  const accessToken = process.env.TWITTER_ACCESS_TOKEN?.trim();
  const accessSecret = process.env.TWITTER_ACCESS_SECRET?.trim();
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error(
      "[twitter] Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET (all four required to post)"
    );
  }
  const twitterClient = new TwitterApi({
    appKey,
    appSecret,
    accessToken,
    accessSecret,
  });
  _rwClient = twitterClient.readWrite;
  return _rwClient;
}

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
  return await getRwClient().v1.uploadMedia(imageBuffer, { mimeType: "image/png" });
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

  const tweet = await getRwClient().v2.tweet({
    text: params.caption,
    media: { media_ids: [mediaId] },
  });

  const tweetId = tweet.data.id;
  return {
    tweetId,
    tweetUrl: `https://twitter.com/lemon_onchain/status/${tweetId}`,
  };
}
