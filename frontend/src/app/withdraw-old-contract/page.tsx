"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";
import { ConnectButton } from "@/components/ConnectButton";
import { LemonPulseLoader } from "@/components/LemonPulseLoader";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";
const MAINNET_CUSD = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const OLD_CONTRACT = "0x365acb045184f93ba6d3a64ccb62de5a1f2988cd";

export default function WithdrawOldContractPage() {
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();

  const [adminSecret, setAdminSecret] = useState("");
  const [contract, setContract] = useState(OLD_CONTRACT);
  const [token, setToken] = useState(MAINNET_CUSD);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (address && !recipient) setRecipient(address);
  }, [address, recipient]);

  async function checkBalance() {
    if (!adminSecret.trim()) return void toast.error("Enter ADMIN_SECRET first.");
    if (!contract.trim()) return void toast.error("Enter contract address.");

    setBusy(true);
    try {
      const url = new URL(`${SERVER}/api/admin/contract-balance`);
      url.searchParams.set("adminSecret", adminSecret.trim());
      url.searchParams.set("contract", contract.trim());
      url.searchParams.set("token", token.trim() || MAINNET_CUSD);
      const r = await fetch(url.toString());
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed to check balance");
      setBalance((d as { balanceFormatted?: string }).balanceFormatted ?? null);
      toast.success("Balance fetched.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!adminSecret.trim()) return void toast.error("Enter ADMIN_SECRET first.");
    if (!contract.trim() || !recipient.trim()) return void toast.error("Contract and recipient are required.");

    setBusy(true);
    try {
      const r = await fetch(`${SERVER}/api/admin/withdraw-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminSecret: adminSecret.trim(),
          contract: contract.trim(),
          token: token.trim() || MAINNET_CUSD,
          recipient: recipient.trim(),
          amount: amount.trim() || undefined,
          decimals: 18,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Withdraw failed");
      toast.success("Withdraw transaction submitted.");
      const tx = (d as { hash?: string }).hash;
      if (tx) toast.message("Tx hash", { description: tx });
      await checkBalance();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8]">
        <LemonPulseLoader className="h-10 w-10" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <header className="flex items-center justify-between border-b border-black/[0.06] px-6 py-4">
        <Link href="/dashboard" className="text-sm font-semibold text-[#1a1206]/60 no-underline hover:text-[#1a1206]">
          ← Dashboard
        </Link>
        <h1 className="m-0 text-lg font-black tracking-[-0.02em] text-[#1a1206]">Withdraw Old Contract Funds</h1>
        <ConnectButton />
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        {!authenticated ? (
          <div className="rounded-2xl border border-black/[0.08] bg-white p-6 text-center">
            <p className="m-0 text-sm text-[#1a1206]/60">Connect wallet to continue.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-black/[0.08] bg-white p-6 shadow-[0_1px_12px_rgba(0,0,0,0.05)]">
            <p className="mt-0 text-xs font-bold uppercase tracking-[0.1em] text-[#1a1206]/35">Mainnet withdraw</p>
            <p className="text-sm text-[#1a1206]/55">
              Default contract is <code>0x365a...98cd</code>. Leave amount empty to withdraw full token balance.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <input className="input" type="password" placeholder="ADMIN_SECRET" value={adminSecret} onChange={(e) => setAdminSecret(e.target.value)} />
              <input className="input" placeholder="Contract address" value={contract} onChange={(e) => setContract(e.target.value)} />
              <input className="input" placeholder="Token address (default cUSD)" value={token} onChange={(e) => setToken(e.target.value)} />
              <input className="input" placeholder="Recipient address" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
              <input className="input" placeholder="Amount (optional)" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>

            {balance !== null && <p className="mt-3 text-xs text-[#1a1206]/55">Current token balance: {balance}</p>}

            <div className="mt-4 flex gap-2">
              <button type="button" className="btn btn-secondary" onClick={checkBalance} disabled={busy}>
                Check balance
              </button>
              <button type="button" className="btn btn-primary" onClick={withdraw} disabled={busy}>
                {busy ? "Processing..." : "Withdraw"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
