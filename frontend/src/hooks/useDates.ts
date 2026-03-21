/**
 * useDates.ts
 * Reads date records and leaderboard stats from LemonDate + LemonNFT.
 */

import { useReadContract, useReadContracts } from "wagmi";
import {
  LEMON_DATE_ADDRESS,
  LEMON_NFT_ADDRESS,
  lemonDateAbi,
  lemonNFTAbi,
} from "@/lib/contracts";
import type { Address } from "viem";

export function useAgentDates(wallet: Address | undefined) {
  return useReadContract({
    address: LEMON_DATE_ADDRESS,
    abi: lemonDateAbi,
    functionName: "getAgentDates",
    args: wallet ? [wallet] : undefined,
    query: { enabled: !!wallet },
  });
}

export function useDateRecord(dateId: bigint | undefined) {
  return useReadContract({
    address: LEMON_DATE_ADDRESS,
    abi: lemonDateAbi,
    functionName: "getDate",
    args: dateId !== undefined ? [dateId] : undefined,
    query: { enabled: dateId !== undefined },
  });
}

export function useLeaderboardEntry(wallet: Address | undefined) {
  return useReadContracts({
    contracts: wallet
      ? [
          {
            address: LEMON_DATE_ADDRESS,
            abi: lemonDateAbi,
            functionName: "totalDatesCompleted",
            args: [wallet],
          },
          {
            address: LEMON_DATE_ADDRESS,
            abi: lemonDateAbi,
            functionName: "totalSpentCents",
            args: [wallet],
          },
          {
            address: LEMON_NFT_ADDRESS,
            abi: lemonNFTAbi,
            functionName: "getAgentTokens",
            args: [wallet],
          },
        ]
      : [],
    query: { enabled: !!wallet },
  });
}

export function useTotalDates() {
  return useReadContract({
    address: LEMON_DATE_ADDRESS,
    abi: lemonDateAbi,
    functionName: "totalDates",
  });
}

export function useAgentNFTs(wallet: Address | undefined) {
  return useReadContract({
    address: LEMON_NFT_ADDRESS,
    abi: lemonNFTAbi,
    functionName: "getAgentTokens",
    args: wallet ? [wallet] : undefined,
    query: { enabled: !!wallet },
  });
}

export function useTotalMinted() {
  return useReadContract({
    address: LEMON_NFT_ADDRESS,
    abi: lemonNFTAbi,
    functionName: "totalMinted",
  });
}

export function useTokenURIs(tokenIds: bigint[]) {
  return useReadContracts({
    contracts: tokenIds.map((id) => ({
      address: LEMON_NFT_ADDRESS,
      abi: lemonNFTAbi,
      functionName: "tokenURI" as const,
      args: [id] as [bigint],
    })),
    query: { enabled: tokenIds.length > 0 },
  });
}
