"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { useTotalMinted, useTokenURIs } from "@/hooks/useDates";
import type { Tweet } from "@/app/api/tweets/route";

const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud";

type NFTMeta = {
  tokenId: bigint;
  name: string;
  description: string;
  image: string;
};

type Tab = "tweets" | "nfts";

function ipfsToHttp(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return `${PINATA_GATEWAY}/ipfs/${uri.slice(7)}`;
  }
  return uri;
}

function useNFTMetadata(tokenIds: bigint[], tokenURIs: (string | undefined)[]) {
  const [metas, setMetas] = useState<NFTMeta[]>([]);

  useEffect(() => {
    if (!tokenIds.length) return;
    const abortController = new AbortController();
    Promise.all(
      tokenIds.map(async (id, i) => {
        const uri = tokenURIs[i];
        if (!uri) return null;
        try {
          const res = await fetch(ipfsToHttp(uri), { signal: abortController.signal });
          const json = await res.json();
          return {
            tokenId: id,
            name: json.name ?? `Date #${id}`,
            description: json.description ?? "",
            image: ipfsToHttp(json.image ?? ""),
          } as NFTMeta;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (!abortController.signal.aborted) {
        setMetas(results.filter((r): r is NFTMeta => r !== null));
      }
    });
    return () => abortController.abort();
  }, [tokenIds.map(String).join(","), tokenURIs.join(",")]);

  return metas;
}

function useTweets() {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tweets")
      .then((r) => r.json())
      .then((d) => setTweets(d.tweets ?? []))
      .catch(() => setTweets([]))
      .finally(() => setLoading(false));
  }, []);

  return { tweets, loading };
}

// ── Tweet feed card ──────────────────────────────────────────────────────────

function TweetCard({ tweet }: { tweet: Tweet }) {
  const [imgError, setImgError] = useState(false);
  const dateStr = tweet.created_at
    ? new Date(tweet.created_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <a
      href={`https://twitter.com/LemonDates/status/${tweet.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block no-underline"
    >
      <article className="rounded-3xl border border-[rgba(0,0,0,0.07)] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.05)] overflow-hidden transition-shadow hover:shadow-[0_6px_24px_rgba(0,0,0,0.10)]">
        {tweet.mediaUrl && !imgError && (
          <div className="w-full aspect-[4/3] overflow-hidden bg-[#f5f0e8]">
            <img
              src={tweet.mediaUrl}
              alt="Date memory"
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          </div>
        )}

        {(!tweet.mediaUrl || imgError) && (
          <div className="w-full aspect-[4/3] bg-[linear-gradient(135deg,#fef9ee,#fde68a)] flex items-center justify-center">
            <span className="text-[64px]">🍋</span>
          </div>
        )}

        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-[6px]">
              <img src="/lemon-single.png" alt="" className="h-5 w-5" />
              <span className="text-[13px] font-bold text-[#1a1206]">@LemonDates</span>
            </div>
            {dateStr && (
              <span className="text-[12px] text-[rgba(26,18,6,0.38)]">· {dateStr}</span>
            )}
          </div>
          <p className="text-[14px] leading-[1.65] text-[#1a1206]">{tweet.text}</p>
          <div className="mt-3 flex items-center gap-1 text-[12px] font-semibold text-[#D6820A]">
            <span>View on X</span>
            <span>↗</span>
          </div>
        </div>
      </article>
    </a>
  );
}

// ── NFT feed card ────────────────────────────────────────────────────────────

function NFTCard({ nft }: { nft: NFTMeta }) {
  const [imgError, setImgError] = useState(false);

  return (
    <article className="rounded-3xl border border-[rgba(0,0,0,0.07)] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.05)] overflow-hidden">
      {nft.image && !imgError ? (
        <div className="w-full aspect-[4/3] overflow-hidden bg-[#f5f0e8]">
          <img
            src={nft.image}
            alt={nft.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="w-full aspect-[4/3] bg-[linear-gradient(135deg,#fef9ee,#fde68a)] flex items-center justify-center">
          <span className="text-[64px]">🍋</span>
        </div>
      )}

      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[15px] font-bold text-[#1a1206] truncate">{nft.name}</p>
          <span className="shrink-0 ml-3 rounded-full border border-[rgba(200,146,10,0.25)] bg-[rgba(248,230,130,0.5)] px-[10px] py-[3px] text-[11px] font-bold text-[#92400e]">
            #{nft.tokenId.toString()}
          </span>
        </div>
        {nft.description && (
          <p className="text-[13px] leading-[1.6] text-[rgba(26,18,6,0.5)] line-clamp-2">
            {nft.description}
          </p>
        )}
        <div className="mt-3 flex items-center gap-[6px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(26,18,6,0.35)]">
            Memory NFT · Celo
          </span>
        </div>
      </div>
    </article>
  );
}

// ── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-3xl border border-[rgba(0,0,0,0.07)] bg-white overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <div className="w-full aspect-[4/3] animate-pulse bg-[#f0ece4]" />
      <div className="px-5 py-4 space-y-2">
        <div className="h-[14px] w-[60%] rounded-full animate-pulse bg-[#f0ece4]" />
        <div className="h-[12px] w-[85%] rounded-full animate-pulse bg-[#f5f2ed]" />
        <div className="h-[12px] w-[45%] rounded-full animate-pulse bg-[#f5f2ed]" />
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function GalleryPage() {
  const [tab, setTab] = useState<Tab>("tweets");

  const { data: totalMinted } = useTotalMinted();
  const total = totalMinted as bigint | null | undefined;

  const tokenIds: bigint[] = total
    ? Array.from({ length: Math.min(Number(total), 50) }, (_, i) => total - BigInt(i))
    : [];

  const { data: uriResults } = useTokenURIs(tokenIds);
  const tokenURIs = (uriResults ?? []).map((r) =>
    r?.status === "success" ? (r.result as string) : undefined
  );

  const metas = useNFTMetadata(tokenIds, tokenURIs);
  const { tweets, loading: tweetsLoading } = useTweets();

  return (
    <div className="min-h-screen bg-[#FDFAF6]">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] bg-[rgba(253,250,246,0.9)] px-6 py-3 backdrop-blur-[20px]">
        <Link href="/" className="flex items-center gap-1 no-underline">
          <img src="/lemon-single.png" alt="Lemon" className="h-8 w-auto" />
          <span className="text-[17px] font-black tracking-[-0.03em] text-[#1a1206] [font-family:Inter,sans-serif]">
            Lemon
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/leaderboard" className="text-[13px] font-medium text-[rgba(26,18,6,0.5)] no-underline hover:text-[#1a1206]">
            Rankings
          </Link>
          <Link href="/dashboard" className="text-[13px] font-medium text-[rgba(26,18,6,0.5)] no-underline hover:text-[#1a1206]">
            Dashboard
          </Link>
          <ConnectButton />
        </div>
      </nav>

      <div className="mx-auto max-w-[640px] px-4 py-8">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-[28px] font-black tracking-[-0.03em] text-[#1a1206] mb-1">
            Date Gallery
          </h1>
          <p className="text-[14px] text-[rgba(26,18,6,0.42)]">
            {total != null ? `${total.toString()} dates sealed on-chain` : "Loading…"}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 rounded-2xl bg-[rgba(0,0,0,0.04)] p-1">
          {(["tweets", "nfts"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                "flex-1 rounded-xl py-[8px] text-[13px] font-semibold transition-all cursor-pointer border-none",
                tab === t
                  ? "bg-white text-[#1a1206] shadow-sm"
                  : "bg-transparent text-[rgba(26,18,6,0.45)]",
              ].join(" ")}
            >
              {t === "tweets" ? "@LemonDates Posts" : `Memories ${total != null ? `(${total})` : ""}`}
            </button>
          ))}
        </div>

        {/* Feed */}
        <div className="flex flex-col gap-5">
          {tab === "tweets" && (
            <>
              {tweetsLoading &&
                Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}

              {!tweetsLoading && tweets.length === 0 && (
                <div className="rounded-3xl border border-[rgba(0,0,0,0.06)] bg-white p-10 text-center">
                  <span className="text-[40px]">🍋</span>
                  <p className="mt-3 text-[14px] text-[rgba(26,18,6,0.45)]">
                    No posts from @LemonDates yet.
                  </p>
                </div>
              )}

              {!tweetsLoading && tweets.map((tweet) => (
                <TweetCard key={tweet.id} tweet={tweet} />
              ))}
            </>
          )}

          {tab === "nfts" && (
            <>
              {tokenIds.length > 0 && metas.length === 0 &&
                Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}

              {tokenIds.length === 0 && total != null && (
                <div className="rounded-3xl border border-[rgba(0,0,0,0.06)] bg-white p-10 text-center">
                  <span className="text-[40px]">🍋</span>
                  <p className="mt-3 text-[14px] text-[rgba(26,18,6,0.45)]">
                    No dates minted yet. Be the first!
                  </p>
                </div>
              )}

              {metas.map((nft) => (
                <NFTCard key={nft.tokenId.toString()} nft={nft} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
