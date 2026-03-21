/**
 * useAgentProfile.ts
 * Reads an agent's on-chain profile from LemonAgent.
 */

import { useReadContract } from "wagmi";
import { LEMON_AGENT_ADDRESS, lemonAgentAbi } from "@/lib/contracts";
import type { Address } from "viem";

export type AgentProfile = {
  wallet: Address;
  name: string;
  avatarURI: string;
  agentURI: string;
  personality: string;
  preferences: string;
  dealBreakers: string[];
  billingMode: number;
  erc8004AgentId: bigint;
  registeredAt: bigint;
  active: boolean;
};

export function useAgentProfile(wallet: Address | undefined) {
  const result = useReadContract({
    address: LEMON_AGENT_ADDRESS,
    abi: lemonAgentAbi,
    functionName: "getProfile",
    args: wallet ? [wallet] : undefined,
    query: { enabled: !!wallet },
  });
  return { ...result, data: result.data as AgentProfile | undefined };
}

export function useIsRegistered(wallet: Address | undefined) {
  return useReadContract({
    address: LEMON_AGENT_ADDRESS,
    abi: lemonAgentAbi,
    functionName: "isRegistered",
    args: wallet ? [wallet] : undefined,
    query: { enabled: !!wallet },
  });
}

export function useTotalAgents() {
  return useReadContract({
    address: LEMON_AGENT_ADDRESS,
    abi: lemonAgentAbi,
    functionName: "totalAgents",
  });
}
