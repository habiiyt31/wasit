"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo, Wordmark } from "@/components/Logo";
import { ConnectButton } from "@/components/ConnectButton";
import { useWallet } from "@/lib/useWallet";
import { createEscrow, extractDeployedAddress, listArbiters } from "@/lib/wasitFactory";
import { addMilestone, lockMilestones } from "@/lib/wasitEscrow";
import { ZERO_ADDRESS } from "@/lib/genlayer";

type MilestoneDraft = { description: string; amount: string };
type ArbiterOption = { address: `0x${string}`; stake: bigint; rulings: bigint };

export default function CreateEscrowPage() {
  const router = useRouter();
  const { address, connect } = useWallet();

  const [projectTitle, setProjectTitle] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [arbiterAddress, setArbiterAddress] = useState("");
  const [feeBps, setFeeBps] = useState("250");
  const [maxRevisions, setMaxRevisions] = useState("3");
  const [maxClaimAttempts, setMaxClaimAttempts] = useState("3");
  const [abandonmentDays, setAbandonmentDays] = useState("14");
  const [appealWindowDays, setAppealWindowDays] = useState("3");
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    { description: "", amount: "" },
  ]);

  const [arbiters, setArbiters] = useState<ArbiterOption[]>([]);
  const [step, setStep] = useState<"form" | "deploying" | "locking" | "done">("form");
  const [error, setError] = useState<string | null>(null);
  const [newEscrowAddress, setNewEscrowAddress] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await listArbiters();
        setArbiters(list.filter((a) => a.eligible));
      } catch {
        // Factory not deployed yet, or unreachable -- form still works,
        // the picker just stays empty and arbiterAddress can be typed
        // in manually.
      }
    })();
  }, []);

  function updateMilestone(i: number, field: keyof MilestoneDraft, value: string) {
    setMilestones((prev) => prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));
  }

  function addMilestoneRow() {
    setMilestones((prev) => [...prev, { description: "", amount: "" }]);
  }

  function removeMilestoneRow(i: number) {
    setMilestones((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit() {
    setError(null);
    try {
      let wallet = address;
      if (!wallet) {
        await connect();
        wallet = address;
        if (!wallet) throw new Error("Connect your wallet first.");
      }

      setStep("deploying");
      const { receipt } = await createEscrow(wallet, {
        projectTitle,
        projectDescription,
        arbiterAddress: arbiterAddress as `0x${string}`,
        tokenAddress: ZERO_ADDRESS,
        feeBps: BigInt(feeBps),
        feeRecipientAddress: arbiterAddress as `0x${string}`, // adjust to your own treasury address
        maxRevisions: BigInt(maxRevisions),
        maxClaimAttempts: BigInt(maxClaimAttempts),
        abandonmentTimeoutDays: BigInt(abandonmentDays),
        appealWindowDays: BigInt(appealWindowDays),
      });

      const deployedAddress = extractDeployedAddress(receipt);
      if (!deployedAddress) {
        console.warn("Full receipt for manual inspection:", receipt);
        throw new Error(
          "Could not find the new escrow's address in the receipt — check the console and fix extractDeployedAddress() in lib/wasitFactory.ts"
        );
      }

      setNewEscrowAddress(deployedAddress);

      setStep("locking");
      for (const m of milestones) {
        if (!m.description || !m.amount) continue;
        await addMilestone(deployedAddress, wallet, m.description, BigInt(m.amount));
      }
      await lockMilestones(deployedAddress, wallet);

      setStep("done");
      router.push(`/escrow/${deployedAddress}`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStep("form");
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

      <h1 className="font-display text-2xl font-bold text-wasit-ink">Create an escrow</h1>
      <p className="mt-1 mb-8 text-sm text-wasit-muted">
        You&apos;re the buyer. Set the spec, pick an arbiter, add milestones, then fund.
      </p>

      <div className="space-y-6">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-wasit-muted">
            Project title
          </label>
          <input
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            className="w-full rounded-lg border border-wasit-line p-3 text-sm"
            placeholder="e.g. Rate-limiter middleware for the API gateway"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-wasit-muted">
            Project context
          </label>
          <textarea
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            className="w-full rounded-lg border border-wasit-line p-3 text-sm"
            rows={3}
            placeholder="Context the validator judge should know about the whole project, beyond a single milestone's spec."
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-wasit-muted">
            Arbiter
          </label>
          {arbiters.length > 0 ? (
            <select
              value={arbiterAddress}
              onChange={(e) => setArbiterAddress(e.target.value)}
              className="w-full rounded-lg border border-wasit-line p-3 text-sm font-mono"
            >
              <option value="">Select a staked arbiter…</option>
              {arbiters.map((a) => (
                <option key={a.address} value={a.address}>
                  {a.address.slice(0, 10)}…{a.address.slice(-4)} · {a.rulings.toString()} rulings
                </option>
              ))}
            </select>
          ) : (
            <input
              value={arbiterAddress}
              onChange={(e) => setArbiterAddress(e.target.value)}
              className="w-full rounded-lg border border-wasit-line p-3 text-sm font-mono"
              placeholder="0x... (no staked arbiters found — paste an address)"
            />
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wide text-wasit-muted">
              Milestones
            </label>
            <button onClick={addMilestoneRow} className="text-xs font-bold text-wasit-amber">
              + Add milestone
            </button>
          </div>
          <div className="space-y-3">
            {milestones.map((m, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={m.description}
                  onChange={(e) => updateMilestone(i, "description", e.target.value)}
                  placeholder={`Milestone ${i + 1} spec (what the code must do)`}
                  className="flex-1 rounded-lg border border-wasit-line p-3 text-sm"
                />
                <input
                  value={m.amount}
                  onChange={(e) => updateMilestone(i, "amount", e.target.value)}
                  placeholder="Amount (wei)"
                  className="w-36 rounded-lg border border-wasit-line p-3 text-sm"
                />
                {milestones.length > 1 && (
                  <button
                    onClick={() => removeMilestoneRow(i)}
                    className="px-2 text-wasit-red"
                    aria-label="Remove milestone"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <details className="rounded-lg border border-wasit-line p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-wasit-ink">Advanced</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-wasit-muted">Protocol fee (bps, max 1000)</label>
              <input value={feeBps} onChange={(e) => setFeeBps(e.target.value)} className="w-full rounded-lg border border-wasit-line p-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-wasit-muted">Max revisions (max 5)</label>
              <input value={maxRevisions} onChange={(e) => setMaxRevisions(e.target.value)} className="w-full rounded-lg border border-wasit-line p-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-wasit-muted">Max claim attempts</label>
              <input value={maxClaimAttempts} onChange={(e) => setMaxClaimAttempts(e.target.value)} className="w-full rounded-lg border border-wasit-line p-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-wasit-muted">Abandonment timeout (days)</label>
              <input value={abandonmentDays} onChange={(e) => setAbandonmentDays(e.target.value)} className="w-full rounded-lg border border-wasit-line p-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-wasit-muted">Appeal window (days)</label>
              <input value={appealWindowDays} onChange={(e) => setAppealWindowDays(e.target.value)} className="w-full rounded-lg border border-wasit-line p-2 text-sm" />
            </div>
          </div>
        </details>

        {error && <p className="text-sm text-wasit-red">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={step !== "form" || !projectTitle || !arbiterAddress}
          className="w-full rounded-full bg-wasit-ink py-3 text-sm font-bold text-wasit-bg disabled:opacity-40"
        >
          {step === "form" && "Deploy escrow"}
          {step === "deploying" && "Deploying…"}
          {step === "locking" && "Locking milestones…"}
          {step === "done" && "Done — redirecting…"}
        </button>

        {newEscrowAddress && (
          <p className="text-xs text-wasit-muted">
            Deployed at <span className="font-mono">{newEscrowAddress}</span>
          </p>
        )}
      </div>
    </main>
  );
}
