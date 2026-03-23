/**
 * contracts.ts
 * ABI snippets and address helpers for reading Lemon contracts from the frontend.
 */

import { parseAbi, type Address } from "viem";

export const LEMON_AGENT_ADDRESS = process.env.NEXT_PUBLIC_LEMON_AGENT_CONTRACT as Address;
export const LEMON_DATE_ADDRESS = process.env.NEXT_PUBLIC_LEMON_DATE_CONTRACT as Address;
export const LEMON_NFT_ADDRESS = process.env.NEXT_PUBLIC_LEMON_NFT_CONTRACT as Address;

export const lemonAgentAbi = parseAbi([
  "function registerAgent(string name, string avatarURI, string agentURI, string personality, string preferences, string[] dealBreakers, uint8 billingMode)",
  "function updateProfile(string avatarURI, string agentURI, string personality, string preferences, string[] dealBreakers, uint8 billingMode)",
  "function getProfile(address wallet) view returns ((address wallet, string name, string avatarURI, string agentURI, string personality, string preferences, string[] dealBreakers, uint8 billingMode, uint256 erc8004AgentId, uint256 registeredAt, bool active))",
  "function isRegistered(address wallet) view returns (bool)",
  "function getAllAgents() view returns (address[])",
  "function totalAgents() view returns (uint256)",
  "event AgentRegistered(address indexed wallet, string name, uint8 billingMode)",
]);

export const lemonDateAbi = parseAbi([
  "function getDate(uint256 dateId) view returns ((uint256 id, address agentA, address agentB, uint8 template, uint8 status, uint8 payerMode, uint256 costUSD, address paymentToken, address payerA, address payerB, uint256 nftTokenId, uint256 scheduledAt, uint256 completedAt))",
  "function getAgentDates(address agent) view returns (uint256[])",
  "function totalDates() view returns (uint256)",
  "function totalDatesCompleted(address) view returns (uint256)",
  "function totalSpentCents(address) view returns (uint256)",
  "function templateCosts(uint256) view returns (uint256)",
  "event DateBooked(uint256 indexed dateId, address agentA, address agentB, uint8 template, uint8 payerMode)",
  "event DateCompleted(uint256 indexed dateId, uint256 nftTokenId)",
]);

// ERC-20 approve ABI — used at registration to let LemonDate pull payment from user wallets
export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

// cUSD token addresses
export const CUSD_ADDRESS = (
  process.env.NEXT_PUBLIC_NETWORK === "mainnet"
    ? "0x765DE816845861e75A25fCA122bb6898B8B1282a"
    : "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b" // Celo Sepolia testnet
) as Address;

export const lemonNFTAbi = parseAbi([
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getAgentTokens(address agent) view returns (uint256[])",
  "function getMemory(uint256 tokenId) view returns ((uint256 dateId, address agentA, address agentB, uint256 mintedAt))",
  "function totalMinted() view returns (uint256)",
  "function mintFee() view returns (uint256)",
  "function claimMemory(uint256 dateId) payable returns (uint256 tokenId)",
  "event DateMemoryMinted(uint256 indexed tokenId, uint256 indexed dateId, address agentA, address agentB, string tokenURI)",
]);

export const DATE_TEMPLATE_LABELS: Record<number, string> = {
  0: "Coffee Date",
  1: "Beach Date",
  2: "Work Date",
  3: "Rooftop Dinner",
  4: "Gallery & Walk",
};

export const DATE_STATUS_LABELS: Record<number, string> = {
  0: "Pending",
  1: "Active",
  2: "Completed",
  3: "Cancelled",
};
