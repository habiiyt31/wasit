"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { MilestoneCard } from "@/components/MilestoneCard";
import { useWallet } from "@/lib/useWallet";
import { ZERO_ADDRESS } from "@/lib/genlayer";
import { genToWei, weiToGen } from "@/lib/units";
import {
  getEscrow,
  getMilestones,
  getTotalAmount,
  fund,
  submitMilestone,
  buyerApprove,
  arbiterRule,
  appealRuling,
  seniorArbiterRule,
  finalizeRuling,
  claimAttempt,
  reclaimAbandoned,
  forceRelease,
  appealBond,
  type Escrow,
  type Milestone,
} from "@/lib/wasit";

export default function EscrowPage() {
  const params = useParams<{ id: string }>();
  const escrowId = BigInt(params.id ?? "0");
  const { address } = useWallet();

  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [total, setTotal] = useState<bigint>(0n);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seller, setSeller] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [e, ms, t] = await Promise.all([
        getEscrow(escrowId),
        getMilestones(escrowId),
        getTotalAmount(escrowId),
      ]);
      setEscrow(e);
      setMilestones(ms);
      setTotal(t);
    } catch (err: any) {
      setError(err?.message ?? "Could not load this escrow.");
    } finally {
      setLoading(false);
    }
  }, [escrowId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(action: () => Promise<unknown>) {
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  const isBuyer =
    !!address && !!escrow && address.toLowerCase() === escrow.buyer.toLowerCase();

  return (
    <>
      <SiteHeader back />
      <main className="mx-auto max-w-[780px] px-f3 py-f5">
        {loading && <p className="text-muted">Reading the contract…</p>}

        {!loading && !escrow && (
          <p className="rounded border border-dashed border-line p-f4 text-center text-muted">
            No escrow with id {params.id}.
          </p>
        )}

        {escrow && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-f2">
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted">Escrow #{params.id}</p>
                <h1 className="mt-[3px] font-display text-m font-extrabold">
                  {escrow.project_title}
                </h1>
              </div>
              <div className="flex flex-none flex-col items-end gap-[6px]">
                <StatusBadge status={escrow.state} />
                <span className="font-mono text-sm">{weiToGen(total)} GEN</span>
              </div>
            </div>

            <p className="mt-f3 max-w-[60ch] text-muted">{escrow.project_description}</p>

            <dl className="mt-f3 grid gap-f2 border-y border-line py-f3 text-sm sm:grid-cols-3">
              {[
                ["Buyer", escrow.buyer],
                ["Seller", escrow.seller],
                ["Arbiter", escrow.arbiter],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-[2px] break-all font-mono text-xs">
                    {value === ZERO_ADDRESS ? "not set yet" : value}
                  </dd>
                </div>
              ))}
            </dl>

            {error && <p className="mt-f3 text-sm text-sending">{error}</p>}

            {escrow.state === "OPEN" && isBuyer && !escrow.milestones_locked && (
              <section className="panel mt-f4">
                <h2 className="font-display text-[17px] font-bold">Milestones not locked yet</h2>
                <p className="mt-f1 text-sm text-muted">
                  The milestones for this escrow are still being locked on-chain. Wait a
                  moment then refresh — the Fund button will appear once they are confirmed.
                </p>
                <button className="btn mt-f2 w-full" onClick={refresh}>
                  Refresh
                </button>
              </section>
            )}

            {escrow.state === "OPEN" && isBuyer && escrow.milestones_locked && (
              <section className="panel mt-f4">
                <h2 className="font-display text-[17px] font-bold">Fund this escrow</h2>
                <p className="mt-f1 text-sm text-muted">
                  Name the selling agent and send the full{" "}
                  <span className="font-mono">{weiToGen(total)} GEN</span> in one
                  transaction. The amount has to match exactly.
                </p>
                <input
                  className="input mt-f2 font-mono text-xs"
                  value={seller}
                  onChange={(e) => setSeller(e.target.value)}
                  placeholder="Seller address (0x…)"
                />
                <button
                  className="btn mt-f2 w-full"
                  disabled={busy || !seller.trim()}
                  onClick={() => run(() => fund(address!, escrowId, seller.trim(), total))}
                >
                  {busy ? "Working…" : `Fund ${weiToGen(total)} GEN`}
                </button>
              </section>
            )}

            {escrow.state === "OPEN" && !isBuyer && (
              <p className="mt-f4 rounded border border-dashed border-line p-f3 text-sm text-muted">
                Waiting for the buyer to fund this escrow.
              </p>
            )}

            <section className="mt-f4 grid gap-f2">
              {milestones.map((m, i) => (
                <MilestoneCard
                  key={i}
                  index={i}
                  milestone={m}
                  escrow={escrow}
                  wallet={address}
                  busy={busy}
                  onSubmit={(idx, url) =>
                    run(() => submitMilestone(address!, escrowId, idx, url))
                  }
                  onBuyerApprove={(idx) => run(() => buyerApprove(address!, escrowId, idx))}
                  onArbiterRule={(idx, ok) =>
                    run(() => arbiterRule(address!, escrowId, idx, ok))
                  }
                  onAppeal={(idx, seniorAddr) =>
                    run(() =>
                      appealRuling(
                        address!,
                        escrowId,
                        idx,
                        seniorAddr,
                        appealBond(milestones[Number(idx)].amount)
                      )
                    )
                  }
                  onSeniorRule={(idx, ok) =>
                    run(() => seniorArbiterRule(address!, escrowId, idx, ok))
                  }
                  onFinalize={(idx) => run(() => finalizeRuling(address!, escrowId, idx))}
                  onClaimAttempt={(idx) => run(() => claimAttempt(address!, escrowId, idx))}
                  onReclaim={(idx) => run(() => reclaimAbandoned(address!, escrowId, idx))}
                  onForceRelease={(idx) => run(() => forceRelease(address!, escrowId, idx))}
                />
              ))}
            </section>
          </>
        )}
      </main>
    </>
  );
}
