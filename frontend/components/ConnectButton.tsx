"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/useWallet";

/** Shows 0x + first 4 + … + last 4 hex chars: 0x1234…5678 */
function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export function ConnectButton() {
  const { address, connecting, error, wallets, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  // Prevent hydration mismatch: don't render wallet-dependent UI until
  // after the first client-side paint, where localStorage is available.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (address) setOpen(false);
  }, [address]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Render a stable placeholder during SSR and first hydration paint.
  if (!mounted) {
    return (
      <div className="h-[38px] w-[130px] animate-pulse rounded-full border border-line bg-stone" />
    );
  }

  if (address) {
    return (
      <div className="flex items-center gap-f1 rounded-full border border-line bg-paper px-f3 py-[9px] text-sm font-bold">
        <span className="h-2 w-2 rounded-full bg-turf" />
        <span className="font-mono text-xs">{shortAddr(address)}</span>
        <button
          onClick={disconnect}
          className="ml-1 text-xs text-muted hover:text-sending"
          aria-label="Disconnect wallet"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        Connect wallet
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-pitch/40 p-f3"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="wallet-sheet-title"
        >
          <div className="w-full max-w-[400px] rounded-md border border-line bg-chalk p-f4">
            <h2 id="wallet-sheet-title" className="font-display text-[21px] font-extrabold">
              Connect wallet
            </h2>
            <p className="mt-[7px] text-sm text-muted">
              Wasit uses whichever wallet you pick, not whichever one loaded first.
            </p>

            <div className="mt-f3 grid gap-f1">
              {wallets.length === 0 && (
                <p className="rounded border border-line bg-paper p-f2 text-sm text-muted">
                  No wallet detected in this browser. Install one, then reload this page.
                </p>
              )}
              {wallets.map((w) => (
                <button
                  key={w.info.rdns}
                  onClick={() => connect(w.info.rdns)}
                  disabled={connecting}
                  className="flex items-center gap-f2 rounded border-[1.5px] border-line bg-paper p-f2 text-left transition-colors hover:border-pitch disabled:opacity-50"
                >
                  {w.info.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.info.icon} alt="" className="h-[30px] w-[30px] flex-none rounded-lg" />
                  ) : (
                    <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg bg-pitch font-display text-sm font-extrabold text-chalk">
                      {w.info.name.charAt(0)}
                    </span>
                  )}
                  <span className="font-bold">{w.info.name}</span>
                  <span className="ml-auto text-xs text-muted">
                    {connecting ? "Connecting…" : "Connect"}
                  </span>
                </button>
              ))}
            </div>

            {error && <p className="mt-f2 text-sm text-sending">{error}</p>}

            <p className="mt-f3 text-xs text-muted">
              Detected through EIP-6963 — newly installed wallets appear here on their own.
            </p>
            <button className="btn-ghost mt-f3 w-full" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
