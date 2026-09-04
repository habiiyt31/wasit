"use client";

export function shortAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}···${address.slice(-4)}`;
}

import { useWallet } from "@/lib/useWallet";

export function ConnectButton() {
  const { address, connecting, error, connect, disconnect } = useWallet();

  if (address) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-wasit-line bg-white px-4 py-2 text-sm font-semibold text-wasit-ink">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        {shortAddress(address)}
        <button onClick={disconnect} className="ml-1 text-xs text-wasit-muted hover:text-wasit-red">
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={connect}
        disabled={connecting}
        className="rounded-full bg-wasit-ink px-5 py-2 text-sm font-bold text-wasit-bg hover:bg-black disabled:opacity-50"
      >
        {connecting ? "Connecting…" : "Connect MetaMask"}
      </button>
      {error && <span className="max-w-xs text-right text-xs text-wasit-red">{error}</span>}
    </div>
  );
}
