/**
 * wagmi.ts
 * Wagmi config for Privy — chains only, no connectors (Privy injects those).
 */

import { createConfig, http } from "wagmi";
import { celo } from "wagmi/chains";
import { defineChain } from "viem";

// Celo L2 testnet (chainId 11142220)
export const celoL2Testnet = defineChain({
  id: 11142220,
  name: "Celo L2 Testnet",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] },
  },
  blockExplorers: {
    default: { name: "Celo Explorer", url: "https://celo-sepolia.blockscout.com" },
  },
  testnet: true,
});

const isProd = process.env.NEXT_PUBLIC_NETWORK === "mainnet";

export const wagmiConfig = createConfig({
  chains: [celoL2Testnet, celo],
  transports: {
    [celoL2Testnet.id]: http(),
    [celo.id]: http(),
  },
  ssr: true,
});
