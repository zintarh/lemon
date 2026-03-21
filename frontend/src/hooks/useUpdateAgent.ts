/**
 * useUpdateAgent.ts
 * Wagmi write hook for updating an existing agent profile on LemonAgent.
 */

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { LEMON_AGENT_ADDRESS, lemonAgentAbi } from "@/lib/contracts";
import type { BillingMode } from "./useRegisterAgent";

export interface UpdateAgentParams {
  avatarURI: string;
  agentURI: string;
  personality: string;
  preferences: string;
  dealBreakers: string[];
  billingMode: BillingMode;
}

export function useUpdateAgent() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function update(params: UpdateAgentParams) {
    writeContract({
      address: LEMON_AGENT_ADDRESS,
      abi: lemonAgentAbi,
      functionName: "updateProfile",
      args: [
        params.avatarURI,
        params.agentURI,
        params.personality,
        params.preferences,
        params.dealBreakers,
        params.billingMode,
      ],
    });
  }

  return { update, hash, isPending, isConfirming, isSuccess, error };
}
