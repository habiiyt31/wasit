"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { useWallet } from "@/lib/useWallet";
import { genToWei, weiToGen } from "@/lib/units";
import {
  createEscrow,
  addMilestone,
  lockMilestones,
  listArbiters,
  getEscrowCount,
  type ArbiterInfo,
} from "@/lib/wasit";

type Row = { description: string; amount: string };

export default function CreatePage() {
  const router = useRouter();
  const { address } = useWallet();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [arbiter, setArbiter] = useState("");
  const [rows, setRows] = useState<Row[]>([{ description: "", amount: "" }]);

  const [treasury, setTreasury] = useState(
    process.env.NEXT_PUBLIC_DEFAULT_TREASURY_ADDRESS ?? ""
  );
  const [feeBps, setFeeBps] = useState("250");
  const [maxRevisions, setMaxRevisions] = useState("2");
  const [maxClaimAttempts, setMaxClaimAttempts] = useState("3");
  const [abandonmentDays, setAbandonmentDays] = useState("30");
  const [appealDays, setAppealDays] = useState("3");

  const [arbiters, setArbiters] = useState<ArbiterInfo[]>([]);
  const [step, setStep] = useState<"form" | "creating" | "milestones" | "locking">("form");
  const [error, setError] = useState<string | null>(null);

  // Ref-based guard: prevents double-submission even if the button is
  // somehow clicked twice before React can re-render the disabled state.
  const submitting = useRef(false);

  useEffect(() => {
    listArbiters(address ?? undefined)
      .then((list) => setArbiters(list.filter((a) => a.eligible)))
      .catch(() => {});
  }, [address]);

  useEffect(() => {
    if (address && !treasury) setTreasury(address);
  }, [address, treasury]);

  const setRow = (i: number, key: keyof Row, value: string) =>
    setRows((prev) => prev.map((r, n) => (n === i ? { ...r, [key]: value } : r)));

  const filled = rows.filter((r) => r.description.trim() && r.amount.trim());
  const ready =
    !!address &&
    title.trim().length >= 10 &&
    description.trim().length >= 40 &&
    !!arbiter.trim() &&
    !!treasury.trim() &&
    filled.length > 0;

  async function handleCreate() {
    if (!address) return;
    // Hard guard: if a submission is already in flight (e.g. user double-
    // clicked or React batched two synthetic events), bail immediately so
    // we never create two escrows for the same form fill.
    if (submitting.current) return;
    submitting.current = true;

    setError(null);
    try {
      // Snapshot the current escrow count BEFORE we create, so the new
      // escrow's id is always (countBefore) regardless of any other
      // concurrent escrow creations happening in the same block.
      const countBefore = await getEscrowCount();

      setStep("creating");
      await createEscrow(address, {
        projectTitle: title.trim(),
        projectDescription: description.trim(),
        arbiterAddress: arbiter.trim(),
        feeBps: BigInt(feeBps || "0"),
        feeRecipientAddress: treasury.trim(),
        maxRevisions: BigInt(maxRevisions || "0"),
        maxClaimAttempts: BigInt(maxClaimAttempts || "3"),
        abandonmentTimeoutDays: BigInt(abandonmentDays || "30"),
        appealWindowDays: BigInt(appealDays || "3"),
      });

      const escrowId = countBefore; // new escrow's id = count before it was created

      setStep("milestones");
      for (const row of filled) {
        await addMilestone(
          address,
          escrowId,
          row.description.trim(),
          genToWei(row.amount)
        );
      }

      setStep("locking");
      await lockMilestones(address, escrowId);

      router.push(`/escrow/${escrowId.toString()}`);
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setStep("form");
      // Release the guard only on error so the user can retry;
      // on success we navigate away and this component unmounts.
      submitting.current = false;
    }
  }

  const busy = step !== "form";
  const busyLabel =
    step === "creating"
      ? "Creating the escrow…"
      : step === "milestones"
      ? "Adding milestones…"
      : step === "locking"
      ? "Locking milestones…"
      : "Create escrow";

  let totalPreview = "";
  try {
    totalPreview = weiToGen(
      filled.reduce((sum, r) => sum + genToWei(r.amount), 0n)
    );
  } catch {
    totalPreview = "";
  }

  return (
    <>
      <SiteHeader back />
      <main className="mx-auto max-w-[680px] px-f3 py-f5">
        <h1 className="font-display text-m font-extrabold">Create an escrow</h1>
        <p className="mt-f2 text-muted">
          You are the buyer. Pick an arbiter who has already posted a bond, describe each
          milestone, then fund it on the next screen.
        </p>

        {!address && (
          <p className="mt-f3 rounded border border-dashed border-line p-f3 text-sm text-muted">
            Connect a wallet to continue.
          </p>
        )}

        <div className="mt-f4 grid gap-f3">
          <div>
            <label className="field-label" htmlFor="title">
              Project title
              <span className="field-hint"> — at least 10 characters</span>
            </label>
            <input
              id="title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Rate limiter for the API gateway"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="desc">
              What the project is
              <span className="field-hint">
                {" "}
                — at least 40 characters; validators read this as context
              </span>
            </label>
            <textarea
              id="desc"
              className="input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Context a reviewer needs about the whole project, beyond any single milestone's spec."
            />
          </div>

          <div>
            <label className="field-label" htmlFor="arbiter">
              Arbiter
              <span className="field-hint"> — only bonded arbiters can be chosen</span>
            </label>
            {arbiters.length > 0 ? (
              <select
                id="arbiter"
                className="input font-mono text-xs"
                value={arbiter}
                onChange={(e) => setArbiter(e.target.value)}
              >
                <option value="">Choose an arbiter…</option>
                {arbiters.map((a) => (
                  <option key={a.address} value={a.address}>
                    {a.address.slice(0, 10)}…{a.address.slice(-4)} · {a.rulings.toString()}{" "}
                    rulings{a.senior ? " · senior" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="arbiter"
                className="input font-mono text-xs"
                value={arbiter}
                onChange={(e) => setArbiter(e.target.value)}
                placeholder="0x… — no bonded arbiters found, paste an address"
              />
            )}
          </div>

          <div>
            <div className="mb-f1 flex items-center justify-between">
              <span className="field-label mb-0">Milestones</span>
              <button
                className="text-sm font-bold text-turf underline underline-offset-2"
                onClick={() => setRows((p) => [...p, { description: "", amount: "" }])}
              >
                Add another
              </button>
            </div>

            <div className="grid gap-f2">
              {rows.map((row, i) => (
                <div key={i} className="flex gap-f1">
                  <input
                    className="input flex-1"
                    value={row.description}
                    onChange={(e) => setRow(i, "description", e.target.value)}
                    placeholder={`Milestone ${i + 1} — what the code must do`}
                  />
                  <input
                    className="input w-[130px]"
                    value={row.amount}
                    onChange={(e) =>
                      // Normalize comma to dot on input so users with
                      // locale keyboards (e.g. Indonesian) don't hit a
                      // parse error when they type "1,5" instead of "1.5".
                      setRow(i, "amount", e.target.value.replace(/,/g, "."))
                    }
                    placeholder="e.g. 1.5 GEN"
                    inputMode="decimal"
                  />
                  {rows.length > 1 && (
                    <button
                      className="px-f1 text-muted hover:text-sending"
                      onClick={() => setRows((p) => p.filter((_, n) => n !== i))}
                      aria-label={`Remove milestone ${i + 1}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            {totalPreview && (
              <p className="mt-f2 text-sm text-muted">
                Total to fund: <span className="font-mono">{totalPreview} GEN</span>
              </p>
            )}
          </div>

          <details className="rounded border border-line p-f2">
            <summary className="cursor-pointer text-sm font-bold">Advanced</summary>
            <div className="mt-f3 grid gap-f2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="treasury">
                  Protocol fee goes to
                  <span className="field-hint"> — not the arbiter</span>
                </label>
                <input
                  id="treasury"
                  className="input font-mono text-xs"
                  value={treasury}
                  onChange={(e) => setTreasury(e.target.value)}
                  placeholder="0x…"
                />
              </div>
              {[
                ["Protocol fee (bps, max 1000)", feeBps, setFeeBps],
                ["Revisions allowed (max 5)", maxRevisions, setMaxRevisions],
                ["Claim attempts (min 3)", maxClaimAttempts, setMaxClaimAttempts],
                ["Abandonment timeout (days)", abandonmentDays, setAbandonmentDays],
                ["Appeal window (days)", appealDays, setAppealDays],
              ].map(([label, value, set]: any) => (
                <div key={label}>
                  <label className="field-label">{label}</label>
                  <input
                    className="input"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
              ))}
            </div>
          </details>

          {error && <p className="text-sm text-sending">{error}</p>}

          <button className="btn w-full" disabled={!ready || busy} onClick={handleCreate}>
            {busyLabel}
          </button>

          {busy && (
            <p className="text-center text-sm text-muted">
              This takes several transactions. Approve each one in your wallet and keep
              this tab open.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
