/**
 * useRegisterAgent.ts
 * Wagmi write hook for registering a new agent on LemonAgent.
 */

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { LEMON_AGENT_ADDRESS, lemonAgentAbi } from "@/lib/contracts";

export type BillingMode = 0 | 1; // 0 = SPLIT, 1 = SOLO

export interface RegisterAgentParams {
  name: string;
  avatarURI: string;
  agentURI: string;
  personality: string;
  preferences: string;
  dealBreakers: string[];
  billingMode: BillingMode;
}

export function useRegisterAgent() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function register(params: RegisterAgentParams) {
    writeContract({
      address: LEMON_AGENT_ADDRESS,
      abi: lemonAgentAbi,
      functionName: "registerAgent",
      args: [
        params.name,
        params.avatarURI,
        params.agentURI,
        params.personality,
        params.preferences,
        params.dealBreakers,
        params.billingMode,
      ],
    });
  }

  return { register, hash, isPending, isConfirming, isSuccess, error };
}
