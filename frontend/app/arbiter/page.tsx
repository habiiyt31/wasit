"use client";

import { useEffect, useState } from "react";
import { Logo, Wordmark } from "@/components/Logo";
import { ConnectButton } from "@/components/ConnectButton";
import { useWallet } from "@/lib/useWallet";
import { stakeAsArbiter, withdrawStake, getArbiterStake, getArbiterRulingCount } from "@/lib/wasitFactory";

export default function ArbiterPage() {
  const { address, connect } = useWallet();
  const [stakeAmount, setStakeAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [myStake, setMyStake] = useState<bigint>(0n);
  const [myRulings, setMyRulings] = useState<bigint>(0n);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(addr: `0x${string}`) {
    const [stake, rulings] = await Promise.all([
      getArbiterStake(addr),
      getArbiterRulingCount(addr),
    ]);
    setMyStake(stake);
    setMyRulings(rulings);
  }

  useEffect(() => {
    if (address) refresh(address);
  }, [address]);

  async function ensureWallet(): Promise<`0x${string}`> {
    if (address) return address;
    await connect();
    if (!address) throw new Error("Connect your wallet first.");
    return address;
  }

  async function handleStake() {
    if (!stakeAmount) return;
    setBusy(true);
    setError(null);
    try {
      const wallet = await ensureWallet();
      await stakeAsArbiter(wallet, BigInt(stakeAmount));
      await refresh(wallet);
      setStakeAmount("");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw() {
    if (!withdrawAmount) return;
    setBusy(true);
    setError(null);
    try {
      const wallet = await ensureWallet();
      await withdrawStake(wallet, BigInt(withdrawAmount));
      await refresh(wallet);
      setWithdrawAmount("");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo size={32} />
          <Wordmark className="text-lg" />
        </div>
        <ConnectButton />
      </header>

      <h1 className="font-display text-2xl font-bold text-wasit-ink">Become an arbiter</h1>
      <p className="mt-1 mb-8 text-sm text-wasit-muted">
        Post a bond to become eligible for buyers to select you. Every ruling you make is
        recorded publicly — bonding plus a reputation counter, not a slashing system.
      </p>

      {address && (
        <div className="mb-8 rounded-2xl border border-wasit-line bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-wasit-muted">Your status</p>
          <p className="mt-2 text-2xl font-display font-bold text-wasit-ink">
            {myStake.toString()} <span className="text-sm font-body text-wasit-muted">wei staked</span>
          </p>
          <p className="mt-1 text-sm text-wasit-muted">{myRulings.toString()} rulings made</p>
        </div>
      )}

      <div className="space-y-4">
        <div className="rounded-2xl border border-wasit-line bg-white p-5">
          <p className="mb-3 text-sm font-semibold text-wasit-ink">Stake</p>
          <input
            value={stakeAmount}
            onChange={(e) => setStakeAmount(e.target.value)}
            placeholder="Amount in wei"
            className="mb-3 w-full rounded-lg border border-wasit-line p-3 text-sm"
          />
          <button
            onClick={handleStake}
            disabled={busy || !stakeAmount}
            className="w-full rounded-lg bg-wasit-ink py-2.5 text-sm font-bold text-wasit-bg disabled:opacity-40"
          >
            {busy ? "Staking…" : "Stake"}
          </button>
        </div>

        <div className="rounded-2xl border border-wasit-line bg-white p-5">
          <p className="mb-3 text-sm font-semibold text-wasit-ink">Withdraw</p>
          <input
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            placeholder="Amount in wei"
            className="mb-3 w-full rounded-lg border border-wasit-line p-3 text-sm"
          />
          <button
            onClick={handleWithdraw}
            disabled={busy || !withdrawAmount}
            className="w-full rounded-lg border border-wasit-line py-2.5 text-sm font-bold text-wasit-ink disabled:opacity-40"
          >
            {busy ? "Withdrawing…" : "Withdraw"}
          </button>
        </div>

        {error && <p className="text-sm text-wasit-red">{error}</p>}
      </div>
    </main>
  );
}
