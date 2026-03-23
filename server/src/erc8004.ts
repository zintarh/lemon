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
  decodeEventLog,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, type Chain } from "viem/chains";
import axios from "axios";

const celoSepolia: Chain = {
  id: 11142220,
  name: "Celo L2 Testnet",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] } },
  testnet: true,
};

const IS_MAINNET = process.env.NETWORK === "mainnet";
const chain = IS_MAINNET ? celo : celoSepolia;
const rpcUrl = IS_MAINNET
  ? (process.env.CELO_RPC_URL ?? "https://forno.celo.org")
  : (process.env.CELO_SEPOLIA_RPC_URL ?? "https://forno.celo-sepolia.celo-testnet.org");

const REGISTRY_ADDRESS = IS_MAINNET
  ? "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
  : "0x8004A818BFB912233c491871b3d84c89A494BD9e";

const CHAIN_ID = IS_MAINNET ? 42220 : 11142220;

// Minimal ABI — register + setAgentURI + Registered event
const REGISTRY_ABI = [
  {
    inputs: [{ name: "tokenURI_", type: "string" }],
    name: "register",
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newURI", type: "string" },
    ],
    name: "setAgentURI",
    outputs: [],
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
  wallet: string;        // user's wallet — shown as contact
  name: string;
  agentURI: string;
  personality: string;
  registeredAt: number;
  agentPrivateKey: string; // agent's own wallet key — signs the ERC-8004 tx
  avatarUri?: string;
};

/**
 * Uploads ERC-8004 compliant metadata JSON to IPFS via Pinata.
 * Returns the IPFS CID.
 */
async function uploadMetadataToIPFS(metadata: object, name: string): Promise<string> {
  const res = await axios.post(
    "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    { pinataContent: metadata, pinataMetadata: { name } },
    {
      headers: {
        pinata_api_key: process.env.PINATA_API_KEY!,
        pinata_secret_api_key: process.env.PINATA_SECRET_KEY!,
      },
    }
  );
  const cid: string = res.data?.IpfsHash;
  if (!cid) throw new Error("[erc8004] Pinata upload returned no IpfsHash");
  return cid;
}

/**
 * Builds the ERC-8004 compliant registration metadata object.
 * Spec: https://eips.ethereum.org/EIPS/eip-8004#registration-v1
 */
function buildERC8004Metadata(agent: AgentIdentityPayload) {
  const agentAddress = privateKeyToAccount(agent.agentPrivateKey as Hex).address;
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: agent.name,
    description: agent.personality,
    image: agent.avatarUri ?? "https://lemon.dating/lemon-single.png",
    services: [
      {
        name: "A2A",
        endpoint: "https://lemon.dating/.well-known/agent-card.json",
        version: "1.0",
      },
    ],
    capabilities: ["dating", "matching", "conversation", "nft-minting"],
    supportedTrust: ["reputation", "crypto-economic"],
    active: true,
    agentWallet: `eip155:${CHAIN_ID}:${agentAddress}`,
    ownerWallet: `eip155:${CHAIN_ID}:${agent.wallet}`,
    platform: "lemon.dating",
    registeredAt: agent.registeredAt,
  };
}

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

  // Build ERC-8004 compliant metadata and upload to IPFS
  const metadata = buildERC8004Metadata(agent);
  console.log(`[erc8004] Uploading metadata for "${agent.name}" to IPFS…`);
  const cid = await uploadMetadataToIPFS(metadata, `lemon-agent-${agent.name}`);
  const tokenURI = `ipfs://${cid}`;
  console.log(`[erc8004] Metadata pinned: ${tokenURI}`);

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

/**
 * Updates the tokenURI of an already-registered agent on-chain.
 * Used to migrate existing agents from data: URIs to IPFS URIs so they
 * appear correctly on AgentScan.
 */
export async function refreshAgentURI(
  agent: AgentIdentityPayload,
  agentId: bigint
): Promise<string> {
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

  const metadata = buildERC8004Metadata(agent);
  console.log(`[erc8004] Uploading refreshed metadata for "${agent.name}" to IPFS…`);
  const cid = await uploadMetadataToIPFS(metadata, `lemon-agent-${agent.name}`);
  const tokenURI = `ipfs://${cid}`;

  console.log(`[erc8004] Calling setAgentURI for agent #${agentId}…`);
  const hash = await walletClient.writeContract({
    address: REGISTRY_ADDRESS as Hex,
    abi: REGISTRY_ABI,
    functionName: "setAgentURI",
    args: [agentId, tokenURI],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[erc8004] ✓ Agent #${agentId} URI updated to ${tokenURI} (tx: ${hash})`);
  return tokenURI;
}
