/**
 * erc8004.ts
 *
 * Registers a Lemon agent in the ERC-8004 Identity Registry on ChaosChain.
 * Uses viem directly — no @chaoschain/sdk needed (ESM-incompatible).
 *
 * IdentityRegistry (Celo mainnet): 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 * IdentityRegistry (Celo testnet): 0x8004A818BFB912233c491871b3d84c89A494BD9e
 *
 * Contract: register(string tokenURI) → uint256 agentId
 * Event:    Registered(uint256 indexed agentId, string tokenURI, address indexed owner)
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbiItem,
  decodeEventLog,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoAlfajores } from "viem/chains";

const IS_MAINNET = process.env.NETWORK === "mainnet";
const chain = IS_MAINNET ? celo : celoAlfajores;
const rpcUrl = IS_MAINNET
  ? (process.env.CELO_RPC_URL ?? "https://forno.celo.org")
  : (process.env.CELO_SEPOLIA_RPC_URL ?? "https://alfajores-forno.celo-testnet.org");

const REGISTRY_ADDRESS = IS_MAINNET
  ? "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
  : "0x8004A818BFB912233c491871b3d84c89A494BD9e";

// Minimal ABI — only what we use
const REGISTRY_ABI = [
  {
    inputs: [{ name: "tokenURI_", type: "string" }],
    name: "register",
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "agentId", type: "uint256" },
      { indexed: false, name: "tokenURI", type: "string" },
      { indexed: true, name: "owner", type: "address" },
    ],
    name: "Registered",
    type: "event",
  },
] as const;

export type AgentIdentityPayload = {
  wallet: string;
  name: string;
  agentURI: string;
  personality: string;
  registeredAt: number;
  agentPrivateKey: string; // agent's own wallet key — signs the ERC-8004 tx
};

export async function registerERC8004Agent(agent: AgentIdentityPayload): Promise<bigint> {
  const account = privateKeyToAccount(agent.agentPrivateKey as Hex);

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const metadata = {
    name: agent.name,
    domain: "lemon.dating",
    role: "worker",
    description: agent.personality,
    capabilities: ["dating", "matching", "conversation"],
    version: "1.0.0",
    contact: agent.wallet,
  };
  const tokenURI = `data:application/json,${JSON.stringify(metadata)}`;

  console.log(`[erc8004] Registering agent "${agent.name}" on ${IS_MAINNET ? "mainnet" : "testnet"}, registry=${REGISTRY_ADDRESS}`);

  const hash = await walletClient.writeContract({
    address: REGISTRY_ADDRESS as Hex,
    abi: REGISTRY_ABI,
    functionName: "register",
    args: [tokenURI],
  });

  console.log(`[erc8004] Tx sent: ${hash} — waiting for receipt…`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === "reverted") {
    throw new Error(`Transaction reverted (tx: ${hash}). The registry contract may not be deployed at ${REGISTRY_ADDRESS} on this network.`);
  }

  // Parse the Registered event to get agentId
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: REGISTRY_ABI,
        eventName: "Registered",
        topics: log.topics,
        data: log.data,
      });
      const agentId = (decoded.args as { agentId: bigint }).agentId;
      console.log(`[erc8004] ✓ Agent "${agent.name}" registered — ERC-8004 id #${agentId}, tx: ${hash}`);
      return agentId;
    } catch {
      // not the Registered event — skip
    }
  }

  throw new Error(`Registered event not found in receipt (tx: ${hash}). Logs: ${receipt.logs.length}`);
}
