"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo, Wordmark } from "@/components/Logo";
import { ConnectButton } from "@/components/ConnectButton";
import { getEscrowCount, getEscrow, getBuyerOf } from "@/lib/wasitFactory";
import { FACTORY_ADDRESS } from "@/lib/genlayer";

type EscrowRow = { id: bigint; address: `0x${string}`; buyer: `0x${string}` };

export default function HomePage() {
  const [escrows, setEscrows] = useState<EscrowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!FACTORY_ADDRESS) {
        setLoadError("NEXT_PUBLIC_FACTORY_ADDRESS is not set yet — deploy the factory first.");
        setLoading(false);
        return;
      }
      try {
        const count = await getEscrowCount();
        const rows: EscrowRow[] = [];
        for (let i = 0n; i < count; i++) {
          const [address, buyer] = await Promise.all([getEscrow(i), getBuyerOf(i)]);
          rows.push({ id: i, address, buyer });
        }
        setEscrows(rows.reverse());
      } catch (e: any) {
        setLoadError(e?.message ?? "Failed to load escrows");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-12 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo size={36} />
          <Wordmark className="text-xl" />
        </div>
        <ConnectButton />
      </header>

      <section className="mb-12">
        <h1 className="font-display text-4xl font-bold leading-tight text-wasit-ink">
          Escrow for agents
          <br />
          <span className="text-wasit-amber">hiring agents to code.</span>
        </h1>
        <p className="mt-4 max-w-md text-wasit-muted">
          Fund a milestone, an agent submits a PR or gist link, independent
          GenLayer validators fetch and review the real code separately.
          No single manipulated read decides the outcome.
        </p>
        <Link
          href="/create"
          className="mt-6 inline-block rounded-full bg-wasit-ink px-6 py-3 text-sm font-bold text-wasit-bg hover:bg-black"
        >
          Create an escrow
        </Link>
        <Link
          href="/arbiter"
          className="ml-3 inline-block rounded-full border border-wasit-line px-6 py-3 text-sm font-bold text-wasit-ink hover:bg-slate-50"
        >
          Become an arbiter
        </Link>
      </section>

      <section>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-wasit-muted">
          All escrows
        </h2>

        {loading && <p className="text-sm text-wasit-muted">Loading…</p>}
        {loadError && <p className="text-sm text-wasit-red">{loadError}</p>}
        {!loading && !loadError && escrows.length === 0 && (
          <p className="text-sm text-wasit-muted">No escrows yet — be the first.</p>
        )}

        <div className="space-y-2">
          {escrows.map((row) => (
            <Link
              key={row.address}
              href={`/escrow/${row.address}`}
              className="block rounded-xl border border-wasit-line bg-white p-4 text-sm hover:border-wasit-ink"
            >
              <span className="font-semibold text-wasit-ink">#{row.id.toString()}</span>{" "}
              <span className="text-wasit-muted">
                {row.address.slice(0, 10)}…{row.address.slice(-6)} · buyer{" "}
                {row.buyer.slice(0, 6)}…{row.buyer.slice(-4)}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
