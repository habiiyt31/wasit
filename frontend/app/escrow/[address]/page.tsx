"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Logo, Wordmark } from "@/components/Logo";
import { ConnectButton } from "@/components/ConnectButton";
import { StatusBadge } from "@/components/StatusBadge";
import { MilestoneCard } from "@/components/MilestoneCard";
import { useWallet } from "@/lib/useWallet";
import {
  getState,
  getBuyer,
  getSeller,
  getArbiter,
  getTotalAmount,
  listMilestones,
  fund,
  submitMilestone,
  buyerApprove,
  arbiterRule,
  appealRuling,
  seniorArbiterRule,
  finalizeRuling,
  claimAttempt,
  forceRelease,
  reclaimAbandoned,
  type Milestone,
} from "@/lib/wasitEscrow";

export default function EscrowDetailPage() {
  const params = useParams();
  const address = params.address as `0x${string}`;
  const { address: connected, connect } = useWallet();

  const [state, setState] = useState<string>("");
  const [buyer, setBuyer] = useState<`0x${string}` | null>(null);
  const [seller, setSeller] = useState<`0x${string}` | null>(null);
  const [arbiter, setArbiter] = useState<`0x${string}` | null>(null);
  const [totalAmount, setTotalAmount] = useState<bigint>(0n);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState("");
  const [sellerToFund, setSellerToFund] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, b, sl, ab, total, ms] = await Promise.all([
        getState(address),
        getBuyer(address),
        getSeller(address),
        getArbiter(address),
        getTotalAmount(address),
        listMilestones(address),
      ]);
      setState(s);
      setBuyer(b);
      setSeller(sl);
      setArbiter(ab);
      setTotalAmount(total);
      setMilestones(ms);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  function role(): "buyer" | "seller" | "arbiter" | "spectator" {
    if (!connected) return "spectator";
    if (buyer && connected.toLowerCase() === buyer.toLowerCase()) return "buyer";
    if (seller && connected.toLowerCase() === seller.toLowerCase()) return "seller";
    if (arbiter && connected.toLowerCase() === arbiter.toLowerCase()) return "arbiter";
    return "spectator";
  }

  function roleForMilestone(
    m: Milestone
  ): "buyer" | "seller" | "arbiter" | "senior_arbiter" | "spectator" {
    if (connected && m.appeal_arbiter && connected.toLowerCase() === m.appeal_arbiter.toLowerCase()) {
      return "senior_arbiter";
    }
    return role();
  }

  async function ensureWallet(): Promise<`0x${string}`> {
    if (connected) return connected;
    await connect();
    if (!connected) throw new Error("Connect your wallet first.");
    return connected;
  }

  async function handleFund() {
    setError(null);
    try {
      const wallet = await ensureWallet();
      await fund(address, wallet, sellerToFund as `0x${string}`, BigInt(fundAmount));
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function handleMilestoneAction(index: number, fn: (wallet: `0x${string}`) => Promise<any>) {
    setBusyIndex(index);
    setError(null);
    try {
      const wallet = await ensureWallet();
      await fn(wallet);
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusyIndex(null);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo size={32} />
          <Wordmark className="text-lg" />
        </div>
        <ConnectButton />
      </header>

      {loading ? (
        <p className="text-sm text-wasit-muted">Loading…</p>
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="font-mono text-xs text-wasit-muted">{address}</p>
              <p className="mt-1 text-sm text-wasit-muted">
                Total: <span className="font-semibold text-wasit-ink">{totalAmount.toString()} wei</span>
              </p>
            </div>
            <StatusBadge status={state} />
          </div>

          {state === "OPEN" && (
            <div className="mb-8 rounded-2xl border border-wasit-line bg-white p-5">
              <p className="mb-3 text-sm font-semibold text-wasit-ink">
                Fund this escrow (buyer only)
              </p>
              <input
                value={sellerToFund}
                onChange={(e) => setSellerToFund(e.target.value)}
                placeholder="Seller address (0x...)"
                className="mb-2 w-full rounded-lg border border-wasit-line p-3 text-sm font-mono"
              />
              <input
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                placeholder="Total amount in wei (must match sum of milestones)"
                className="mb-3 w-full rounded-lg border border-wasit-line p-3 text-sm"
              />
              <button
                onClick={handleFund}
                className="w-full rounded-lg bg-wasit-ink py-2.5 text-sm font-bold text-wasit-bg"
              >
                Fund escrow
              </button>
            </div>
          )}

          {error && <p className="mb-4 text-sm text-wasit-red">{error}</p>}

          <div className="space-y-4">
            {milestones.map((m, i) => (
              <MilestoneCard
                key={i}
                index={i}
                milestone={m}
                role={roleForMilestone(m)}
                busy={busyIndex === i}
                appealBondWei={(m.amount * 500n) / 10000n}
                onSubmit={(deliverable) =>
                  handleMilestoneAction(i, (wallet) =>
                    submitMilestone(address, wallet, BigInt(i), deliverable)
                  )
                }
                onBuyerApprove={() =>
                  handleMilestoneAction(i, (wallet) => buyerApprove(address, wallet, BigInt(i)))
                }
                onArbiterRule={(approve) =>
                  handleMilestoneAction(i, (wallet) =>
                    arbiterRule(address, wallet, BigInt(i), approve)
                  )
                }
                onAppeal={(seniorArbiterAddress) =>
                  handleMilestoneAction(i, (wallet) =>
                    appealRuling(
                      address,
                      wallet,
                      BigInt(i),
                      seniorArbiterAddress as `0x${string}`,
                      (m.amount * 500n) / 10000n
                    )
                  )
                }
                onSeniorArbiterRule={(approve) =>
                  handleMilestoneAction(i, (wallet) =>
                    seniorArbiterRule(address, wallet, BigInt(i), approve)
                  )
                }
                onFinalize={() =>
                  handleMilestoneAction(i, (wallet) => finalizeRuling(address, wallet, BigInt(i)))
                }
                onClaimAttempt={() =>
                  handleMilestoneAction(i, (wallet) => claimAttempt(address, wallet, BigInt(i)))
                }
                onForceRelease={() =>
                  handleMilestoneAction(i, (wallet) => forceRelease(address, wallet, BigInt(i)))
                }
                onReclaimAbandoned={() =>
                  handleMilestoneAction(i, (wallet) => reclaimAbandoned(address, wallet, BigInt(i)))
                }
              />
            ))}
          </div>

          <p className="mt-8 text-xs text-wasit-muted">
            Connected as: {role()} {connected ? `(${connected.slice(0, 6)}…${connected.slice(-4)})` : ""}
          </p>
        </>
      )}
    </main>
  );
}
