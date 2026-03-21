"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig, celoL2Testnet } from "@/lib/wagmi";
import { celo } from "wagmi/chains";
import { useState } from "react";
import { Toaster } from "sonner";

const isProd = process.env.NEXT_PUBLIC_NETWORK === "mainnet";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ""}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#D6820A",
          logo: "/lemon-logo.png",
          walletChainType: "ethereum-only",
        },
        loginMethods: ["email", "wallet"],
        defaultChain: isProd ? celo : celoL2Testnet,
        supportedChains: isProd ? [celo] : [celoL2Testnet, celo],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
