"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ConnectButton } from "./ConnectButton";
import { LogoMark } from "./LogoMark";

export function AppNav({
  right,
  showDashboard = true,
}: {
  right?: ReactNode;
  showDashboard?: boolean;
}) {
  return (
    <nav className="navbar">
      <Link href="/">
        <LogoMark />
      </Link>
      <div className="flex items-center gap-1 sm:gap-2">
        <Link href="/agents" className="btn btn-ghost text-sm py-2 px-3 sm:px-4">
          Agents
        </Link>
        <Link href="/leaderboard" className="btn btn-ghost text-sm py-2 px-3 sm:px-4">
          Leaderboard
        </Link>
        {showDashboard && (
          <Link href="/dashboard" className="btn btn-ghost text-sm py-2 px-3 sm:px-4 hidden sm:inline-flex">
            Dashboard
          </Link>
        )}
        {right ?? <ConnectButton />}
      </div>
    </nav>
  );
}
