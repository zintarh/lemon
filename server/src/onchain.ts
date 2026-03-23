/**
 * onchain.ts
 *
 * Viem-based helpers for calling Lemon smart contracts from the server.
 * The server wallet is the owner of LemonDate and LemonNFT, so it submits
 * bookDate, completeDate, mintDateMemory, and linkERC8004Id transactions.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
  getContract,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, type Chain } from "viem/chains";

// Celo L2 testnet (deployed on Ethereum Sepolia, chainId 11142220)
const celoL2Testnet: Chain = {
  id: 11142220,
  name: "Celo L2 Testnet",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] },
  },
  testnet: true,
};

// ─── Chain config ──────────────────────────────────────────────────────────

const isTestnet = process.env.NETWORK === "testnet";
const chain = isTestnet ? celoL2Testnet : celo;
const rpcUrl = isTestnet
  ? (process.env.CELO_SEPOLIA_RPC_URL ?? "https://forno.celo-sepolia.celo-testnet.org")
  : (process.env.CELO_RPC_URL ?? "https://forno.celo.org");

export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
  // Use polling (getLogs) instead of eth_newFilter — required for public RPC nodes
  // that don't support persistent filters (e.g. forno.celo-sepolia.celo-testnet.org)
  pollingInterval: 8_000,
});

// Lazily initialised so a missing key throws a clear error on first use
// rather than crashing the whole server at module load time.
let _account: ReturnType<typeof privateKeyToAccount> | undefined;
function account(): ReturnType<typeof privateKeyToAccount> {
  if (!_account) {
    const key = process.env.DEPLOYER_PRIVATE_KEY;
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
      throw new Error(
        "[onchain] DEPLOYER_PRIVATE_KEY is missing or invalid — check your .env file"
      );
    }
    _account = privateKeyToAccount(key as `0x${string}`);
  }
  return _account;
}

export const walletClient = createWalletClient({ get account() { return account(); }, chain, transport: http(rpcUrl) });

// ─── Contract ABIs (minimal) ────────────────────────────────────────────────

const dateAbi = parseAbi([
  "function bookDate(address agentA, address agentB, uint8 template, uint8 payerMode, address paymentToken, address payerA, address payerB) returns (uint256 dateId)",
  "function completeDate(uint256 dateId, uint256 nftTokenId)",
  "function cancelDate(uint256 dateId)",
  "function resolveNextPayer(address a, address b) returns (address payer)",
  "function getDate(uint256 dateId) view returns (uint256 id, address agentA, address agentB, uint8 template, uint8 status, uint8 payerMode, uint256 costUSD, address paymentToken, address payerA, address payerB, uint256 nftTokenId, uint256 scheduledAt, uint256 completedAt)",
]);

const nftAbi = parseAbi([
  "function mintDateMemory(address agentA, address agentB, uint256 dateId, string metadataURI) returns (uint256 tokenId)",
  "function totalMinted() view returns (uint256)",
]);

const agentAbi = parseAbi([
  "function linkERC8004Id(address wallet, uint256 agentId)",
  "function setOperatorKey(address userWallet, address operatorWallet)",
  "function isRegistered(address wallet) view returns (bool)",
  "function isOperatorFor(address operator, address userWallet) view returns (bool)",
  "function getProfile(address wallet) view returns ((address wallet, string name, string avatarURI, string agentURI, string personality, string preferences, string[] dealBreakers, uint8 billingMode, uint256 erc8004AgentId, uint256 registeredAt, bool active))",
  "function getAllAgents() view returns (address[])",
]);

// ─── Contract instances ─────────────────────────────────────────────────────

function dateContract() {
  return getContract({
    address: process.env.LEMON_DATE_CONTRACT as Address,
    abi: dateAbi,
    client: { public: publicClient, wallet: walletClient },
  });
}

function nftContract() {
  return getContract({
    address: process.env.LEMON_NFT_CONTRACT as Address,
    abi: nftAbi,
    client: { public: publicClient, wallet: walletClient },
  });
}

function agentContract() {
  return getContract({
    address: process.env.LEMON_AGENT_CONTRACT as Address,
    abi: agentAbi,
    client: { public: publicClient, wallet: walletClient },
  });
}

// ─── Template / PayerMode maps ─────────────────────────────────────────────

const TEMPLATE_INDEX: Record<string, number> = {
  COFFEE: 0,
  BEACH: 1,
  WORK: 2,
  ROOFTOP_DINNER: 3,
  GALLERY_WALK: 4,
};

const PAYER_INDEX: Record<string, number> = {
  AGENT_A: 0,
  AGENT_B: 1,
  SPLIT: 2,
};

// ─── Exported helpers ───────────────────────────────────────────────────────

export async function bookDate(params: {
  agentA: Address;
  agentB: Address;
  template: string;
  payerMode: string;
  paymentToken: Address;
  payerA: Address;   // agentA's human user wallet
  payerB: Address;   // agentB's human user wallet
  agentPrivateKey?: `0x${string}`;
}): Promise<bigint> {
  const signerClient = params.agentPrivateKey
    ? createAgentWalletClient(params.agentPrivateKey)
    : walletClient;

  const dc = getContract({
    address: process.env.LEMON_DATE_CONTRACT as Address,
    abi: dateAbi,
    client: { public: publicClient, wallet: signerClient },
  });

  const hash = await dc.write.bookDate([
    params.agentA,
    params.agentB,
    TEMPLATE_INDEX[params.template],
    PAYER_INDEX[params.payerMode],
    params.paymentToken,
    params.payerA,
    params.payerB,
  ]);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Find the DateBooked event log by its topic signature and extract indexed dateId
  const bookedAbi = parseAbi(["event DateBooked(uint256 indexed dateId, address agentA, address agentB, uint8 template, uint8 payerMode)"]);
  const bookedLog = receipt.logs.find((l) =>
    l.address.toLowerCase() === (process.env.LEMON_DATE_CONTRACT as string).toLowerCase() &&
    l.topics[0] !== undefined
  );
  if (!bookedLog || !bookedLog.topics[1]) {
    throw new Error("[onchain] bookDate: DateBooked event not found in transaction receipt");
  }
  return BigInt(bookedLog.topics[1]);
}

export async function completeDate(dateId: bigint, nftTokenId: bigint): Promise<void> {
  const hash = await dateContract().write.completeDate([dateId, nftTokenId]);
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function mintNFT(params: {
  agentA: Address;
  agentB: Address;
  dateId: bigint;
  metadataURI: string;
  agentPrivateKey?: `0x${string}`; // if set, agent signs — otherwise falls back to deployer
}): Promise<bigint> {
  const signerClient = params.agentPrivateKey
    ? createAgentWalletClient(params.agentPrivateKey)
    : walletClient;

  const contract = getContract({
    address: process.env.LEMON_NFT_CONTRACT as Address,
    abi: nftAbi,
    client: { public: publicClient, wallet: signerClient },
  });

  const hash = await contract.write.mintDateMemory([
    params.agentA,
    params.agentB,
    params.dateId,
    params.metadataURI,
  ]);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Find the DateMemoryMinted event log and extract indexed tokenId (topics[1])
  const mintedLog = receipt.logs.find((l) =>
    l.address.toLowerCase() === (process.env.LEMON_NFT_CONTRACT as string).toLowerCase() &&
    l.topics[1] !== undefined
  );
  if (!mintedLog || !mintedLog.topics[1]) {
    throw new Error("[onchain] mintNFT: DateMemoryMinted event not found in transaction receipt");
  }
  return BigInt(mintedLog.topics[1]);
}

export async function resolveNextPayer(agentA: Address, agentB: Address): Promise<Address> {
  // Simulate first to capture the return value (resolveNextPayer is not a view function)
  const { result: payer } = await publicClient.simulateContract({
    address: process.env.LEMON_DATE_CONTRACT as Address,
    abi: dateAbi,
    functionName: "resolveNextPayer",
    args: [agentA, agentB],
    account: account(),
  });

  // Execute the write to persist the next-payer rotation in contract state
  const hash = await dateContract().write.resolveNextPayer([agentA, agentB]);
  await publicClient.waitForTransactionReceipt({ hash });

  return payer as Address;
}

// ─── Agent wallet helpers ────────────────────────────────────────────────────

import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";

/**
 * Generates a fresh secp256k1 keypair for a new agent.
 * The private key must be stored securely in DB — it signs all future agent txs.
 */
export function generateAgentWallet(): { privateKey: `0x${string}`; address: Address } {
  const privateKey = generatePrivateKey();
  const address = privateKeyToAddress(privateKey);
  return { privateKey, address };
}

/**
 * Creates a wallet client for an individual agent using their private key.
 * Used for mintNFT, bookDate, completeDate — so the agent acts autonomously.
 */
export function createAgentWalletClient(agentPrivateKey: `0x${string}`) {
  const agentAccount = privateKeyToAccount(agentPrivateKey);
  return createWalletClient({ account: agentAccount, chain, transport: http(rpcUrl) });
}

/**
 * Registers the agent's server-side wallet as an authorized operator in LemonAgent.
 * Called once at registration — only the deployer (owner) can call this.
 */
export async function setOperatorKey(userWallet: Address, operatorWallet: Address): Promise<void> {
  const hash = await agentContract().write.setOperatorKey([userWallet, operatorWallet]);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[onchain] Operator set: ${userWallet} → ${operatorWallet}`);
}

export async function getAllAgents(): Promise<Address[]> {
  return await agentContract().read.getAllAgents() as Address[];
}

// ─── cUSD payment helper ─────────────────────────────────────────────────────

const erc20TransferAbi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

/**
 * Structured error thrown when one or both payers don't have enough cUSD.
 * Includes all the context needed to present the approval flow to users.
 */
export class PaymentShortfallError extends Error {
  constructor(
    message: string,
    public readonly shortfalls: Array<{
      agentName: string;
      agentWalletAddress: string; // on-chain agent wallet — user sends cUSD here
      userWallet: string;         // user's own wallet (for conversation lookup)
      has: string;
      needs: string;
    }>,
    public readonly funded: Array<{
      agentName: string;
      userWallet: string;
      fullAmountUSD: string; // what they'd pay if they covered everything
    }>,
  ) {
    super(message);
    this.name = "PaymentShortfallError";
  }
}

/**
 * Checks balances for all payers without transferring anything.
 * Returns shortfalls and who has enough.
 */
export async function checkPaymentBalances(params: {
  payerMode: "AGENT_A" | "AGENT_B" | "SPLIT";
  agentAPrivateKey: `0x${string}`;
  agentBPrivateKey: `0x${string}`;
  agentAName: string;
  agentBName: string;
  userWalletA: string;
  userWalletB: string;
  cUSDAddress: Address;
  amountUSD: string;
}): Promise<PaymentShortfallError | null> {
  const { payerMode, agentAPrivateKey, agentBPrivateKey, agentAName, agentBName, userWalletA, userWalletB, cUSDAddress, amountUSD } = params;
  const { formatUnits, parseUnits: pu } = await import("viem");
  const { privateKeyToAddress } = await import("viem/accounts");

  type Payer = { key: `0x${string}`; name: string; userWallet: string; amount: string };
  let payers: Payer[] = [];
  const half = (parseFloat(amountUSD) / 2).toFixed(6);

  if (payerMode === "SPLIT") {
    payers = [
      { key: agentAPrivateKey, name: agentAName, userWallet: userWalletA, amount: half },
      { key: agentBPrivateKey, name: agentBName, userWallet: userWalletB, amount: half },
    ];
  } else if (payerMode === "AGENT_A") {
    payers = [{ key: agentAPrivateKey, name: agentAName, userWallet: userWalletA, amount: amountUSD }];
  } else {
    payers = [{ key: agentBPrivateKey, name: agentBName, userWallet: userWalletB, amount: amountUSD }];
  }

  const results = await Promise.all(payers.map(async (p) => {
    const addr = privateKeyToAddress(p.key);
    const balance = await publicClient.readContract({ address: cUSDAddress, abi: erc20TransferAbi, functionName: "balanceOf", args: [addr] });
    const needed = pu(p.amount, 18);
    return { payer: p, addr, balance, needed };
  }));

  const shortfalls = results
    .filter(r => r.balance < r.needed)
    .map(r => ({
      agentName: r.payer.name,
      agentWalletAddress: r.addr,
      userWallet: r.payer.userWallet,
      has: parseFloat(formatUnits(r.balance, 18)).toFixed(2),
      needs: r.payer.amount,
    }));

  if (shortfalls.length === 0) return null;

  // Who has enough and could cover the full cost?
  const funded = results
    .filter(r => r.balance >= pu(amountUSD, 18)) // can cover full amount
    .map(r => ({
      agentName: r.payer.name,
      userWallet: r.payer.userWallet,
      fullAmountUSD: amountUSD,
    }));

  const names = shortfalls.map(s => `${s.agentName} (has ${s.has} cUSD, needs ${s.needs})`).join(" and ");
  return new PaymentShortfallError(
    `Not enough cUSD to book this date: ${names}. Fund the agent wallet(s) on Celo to continue.`,
    shortfalls,
    funded,
  );
}

/**
 * Transfers cUSD directly from an agent wallet to the Lemon treasury.
 * Checks balance upfront and throws a clear, user-readable error if insufficient.
 * SPLIT: both agents pay half in parallel.
 */
export async function collectPayment(params: {
  payerMode: "AGENT_A" | "AGENT_B" | "SPLIT";
  agentAPrivateKey: `0x${string}`;
  agentBPrivateKey: `0x${string}`;
  agentAName: string;
  agentBName: string;
  treasuryAddress: Address;
  cUSDAddress: Address;
  amountUSD: string; // e.g. "1.00"
}): Promise<void> {
  const { payerMode, agentAPrivateKey, agentBPrivateKey, agentAName, agentBName, treasuryAddress, cUSDAddress, amountUSD } = params;
  const { formatUnits, parseUnits: pu } = await import("viem");
  const { privateKeyToAddress } = await import("viem/accounts");

  async function transfer(fromKey: `0x${string}`, agentName: string, amount: string): Promise<void> {
    const addr = privateKeyToAddress(fromKey);
    const needed = pu(amount, 18);
    const [cUSDBalance, celoBalance] = await Promise.all([
      publicClient.readContract({ address: cUSDAddress, abi: erc20TransferAbi, functionName: "balanceOf", args: [addr] }),
      publicClient.getBalance({ address: addr }),
    ]);

    console.log(`[payment] ${agentName} (${addr})`);
    console.log(`[payment]   cUSD: ${formatUnits(cUSDBalance, 18)} (needs ${amount})`);
    console.log(`[payment]   CELO (gas): ${formatUnits(celoBalance, 18)}`);

    if (cUSDBalance < needed) {
      const has = parseFloat(formatUnits(cUSDBalance, 18)).toFixed(2);
      throw new Error(
        `${agentName}'s wallet doesn't have enough cUSD to pay for this date. ` +
        `Has ${has} cUSD, needs ${amount} cUSD. Fund ${addr} with cUSD on Celo to continue.`
      );
    }

    const client = createAgentWalletClient(fromKey);
    const hash = await client.writeContract({
      address: cUSDAddress,
      abi: erc20TransferAbi,
      functionName: "transfer",
      args: [treasuryAddress, needed],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[payment] ✓ ${amount} cUSD paid by ${agentName}`);
  }

  if (payerMode === "SPLIT") {
    const half = (parseFloat(amountUSD) / 2).toFixed(6);
    // Check both balances before attempting either transfer
    const addrA = privateKeyToAddress(agentAPrivateKey);
    const addrB = privateKeyToAddress(agentBPrivateKey);
    const [balA, balB] = await Promise.all([
      publicClient.readContract({ address: cUSDAddress, abi: erc20TransferAbi, functionName: "balanceOf", args: [addrA] }),
      publicClient.readContract({ address: cUSDAddress, abi: erc20TransferAbi, functionName: "balanceOf", args: [addrB] }),
    ]);
    const needed = parseUnits(half, 18);
    const shortfalls: string[] = [];
    if (balA < needed) shortfalls.push(`${agentAName} (has ${parseFloat(formatUnits(balA, 18)).toFixed(2)} cUSD, needs ${half})`);
    if (balB < needed) shortfalls.push(`${agentBName} (has ${parseFloat(formatUnits(balB, 18)).toFixed(2)} cUSD, needs ${half})`);
    if (shortfalls.length > 0) {
      throw new Error(
        `Not enough cUSD to split the date cost: ${shortfalls.join(" and ")}. ` +
        `Fund the agent wallet(s) on Celo to continue.`
      );
    }
    await Promise.all([
      transfer(agentAPrivateKey, agentAName, half),
      transfer(agentBPrivateKey, agentBName, half),
    ]);
  } else {
    const payerKey = payerMode === "AGENT_A" ? agentAPrivateKey : agentBPrivateKey;
    const payerName = payerMode === "AGENT_A" ? agentAName : agentBName;
    await transfer(payerKey, payerName, amountUSD);
  }
}

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

export async function getAgentProfile(wallet: Address): Promise<AgentProfile> {
  const raw = await agentContract().read.getProfile([wallet]);
  if (Array.isArray(raw)) {
    const tuple = raw as unknown as readonly [
      Address,
      string,
      string,
      string,
      string,
      string,
      readonly string[],
      number,
      bigint,
      bigint,
      boolean,
    ];
    return {
      wallet: tuple[0],
      name: tuple[1],
      avatarURI: tuple[2],
      agentURI: tuple[3],
      personality: tuple[4],
      preferences: tuple[5],
      dealBreakers: [...tuple[6]],
      billingMode: tuple[7],
      erc8004AgentId: tuple[8],
      registeredAt: tuple[9],
      active: tuple[10],
    };
  }

  const obj = raw as {
    wallet: Address;
    name: string;
    avatarURI: string;
    agentURI: string;
    personality: string;
    preferences: string;
    dealBreakers: readonly string[];
    billingMode: number;
    erc8004AgentId: bigint;
    registeredAt: bigint;
    active: boolean;
  };

  return {
    wallet: obj.wallet,
    name: obj.name,
    avatarURI: obj.avatarURI,
    agentURI: obj.agentURI,
    personality: obj.personality,
    preferences: obj.preferences,
    dealBreakers: [...obj.dealBreakers],
    billingMode: obj.billingMode,
    erc8004AgentId: obj.erc8004AgentId,
    registeredAt: obj.registeredAt,
    active: obj.active,
  };
}

/**
 * Funds a new agent wallet with CELO (gas) and cUSD (date payments).
 * Called once at agent registration time from the treasury/deployer wallet.
 *  - 0.1 CELO  → covers ~100+ on-chain transactions
 *  - 2.00 cUSD → covers up to 2 dates (or 4 split dates)
 */
/**
 * Sends a small CELO drip from the deployer to the agent wallet for gas only.
 * cUSD for date payments comes from the user's own wallet during onboarding.
 */
export async function fundAgentWallet(agentWalletAddress: Address): Promise<void> {
  const celoHash = await walletClient.sendTransaction({
    to: agentWalletAddress,
    value: BigInt("50000000000000000"), // 0.05 CELO — enough for ~50+ transactions
  });
  await publicClient.waitForTransactionReceipt({ hash: celoHash });
  console.log(`[onchain] Funded agent wallet ${agentWalletAddress} with 0.05 CELO (gas only)`);
}
