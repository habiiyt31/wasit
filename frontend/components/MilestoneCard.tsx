"use client";

import { useState } from "react";
import { StatusBadge } from "./StatusBadge";
import type { Milestone } from "@/lib/wasitEscrow";

type Role = "buyer" | "seller" | "arbiter" | "senior_arbiter" | "spectator";

export function MilestoneCard({
  index,
  milestone,
  role,
  busy,
  appealBondWei,
  onSubmit,
  onBuyerApprove,
  onArbiterRule,
  onAppeal,
  onSeniorArbiterRule,
  onFinalize,
  onClaimAttempt,
  onForceRelease,
  onReclaimAbandoned,
}: {
  index: number;
  milestone: Milestone;
  role: Role;
  busy: boolean;
  appealBondWei: bigint;
  onSubmit: (deliverable: string) => void;
  onBuyerApprove: () => void;
  onArbiterRule: (approve: boolean) => void;
  onAppeal: (seniorArbiterAddress: string) => void;
  onSeniorArbiterRule: (approve: boolean) => void;
  onFinalize: () => void;
  onClaimAttempt: () => void;
  onForceRelease: () => void;
  onReclaimAbandoned: () => void;
}) {
  const [deliverable, setDeliverable] = useState("");
  const [seniorArbiterInput, setSeniorArbiterInput] = useState("");

  return (
    <div className="rounded-2xl border border-wasit-line bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-wasit-muted">
            Milestone {index + 1}
          </p>
          <p className="mt-1 font-display text-lg font-bold text-wasit-ink">
            {milestone.description}
          </p>
        </div>
        <StatusBadge status={milestone.status} />
      </div>

      <p className="mb-4 text-sm text-wasit-muted">
        Amount: <span className="font-semibold text-wasit-ink">{milestone.amount.toString()} wei</span>
        {" · "}Revisions used: {milestone.revision_count.toString()}
      </p>

      {milestone.verdict && (
        <div className="mb-4 rounded-xl bg-slate-50 p-3 text-sm text-wasit-muted">
          <span className="font-semibold text-wasit-ink">Last verdict: </span>
          {milestone.verdict}
        </div>
      )}

      {/* Seller: submit or resubmit */}
      {role === "seller" && (milestone.status === "pending" || milestone.status === "disputed") && (
        <div className="space-y-2">
          <textarea
            value={deliverable}
            onChange={(e) => setDeliverable(e.target.value)}
            placeholder="Link to a GitHub PR, gist, or raw file — the judge fetches and reviews the actual code"
            className="w-full rounded-lg border border-wasit-line p-3 text-sm"
            rows={3}
          />
          <button
            disabled={busy || !deliverable}
            onClick={() => onSubmit(deliverable)}
            className="w-full rounded-lg bg-wasit-amber py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy ? "Submitting…" : milestone.status === "disputed" ? "Resubmit revision" : "Submit deliverable"}
          </button>
        </div>
      )}

      {/* Seller: safety valve if arbiter goes silent before ever ruling */}
      {role === "seller" && milestone.status === "disputed" && (
        <div className="mt-2 flex gap-2">
          <button
            disabled={busy}
            onClick={onClaimAttempt}
            className="flex-1 rounded-lg border border-wasit-line py-2 text-xs font-semibold text-wasit-ink disabled:opacity-40"
          >
            Log claim attempt
          </button>
          <button
            disabled={busy}
            onClick={onForceRelease}
            className="flex-1 rounded-lg border border-wasit-red py-2 text-xs font-semibold text-wasit-red disabled:opacity-40"
          >
            Force release
          </button>
        </div>
      )}

      {/* Buyer: manual approve override, or reclaim if seller ghosted */}
      {role === "buyer" && milestone.status === "disputed" && (
        <button
          disabled={busy}
          onClick={onBuyerApprove}
          className="mt-2 w-full rounded-lg border border-wasit-line py-2 text-xs font-semibold text-wasit-ink disabled:opacity-40"
        >
          Manually approve anyway
        </button>
      )}
      {role === "buyer" && milestone.status === "pending" && (
        <button
          disabled={busy}
          onClick={onReclaimAbandoned}
          className="mt-2 w-full rounded-lg border border-wasit-line py-2 text-xs font-semibold text-wasit-muted disabled:opacity-40"
        >
          Reclaim (seller never submitted)
        </button>
      )}

      {/* Arbiter: first-instance ruling on an exhausted dispute */}
      {role === "arbiter" && milestone.status === "disputed" && (
        <div className="mt-2 flex gap-2">
          <button
            disabled={busy}
            onClick={() => onArbiterRule(true)}
            className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            Rule for seller
          </button>
          <button
            disabled={busy}
            onClick={() => onArbiterRule(false)}
            className="flex-1 rounded-lg bg-wasit-red py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            Rule for buyer
          </button>
        </div>
      )}

      {/* Either party: appeal window open after first-instance ruling */}
      {(role === "buyer" || role === "seller") && milestone.status === "pending_finalization" && (
        <div className="mt-3 rounded-xl border border-dashed border-wasit-amber/50 bg-wasit-amber/5 p-3">
          <p className="mb-2 text-xs font-semibold text-wasit-ink">
            First-instance ruling: {milestone.arbiter_verdict === "approve" ? "for seller" : "for buyer"}.
            Appeal window is open.
          </p>
          <input
            value={seniorArbiterInput}
            onChange={(e) => setSeniorArbiterInput(e.target.value)}
            placeholder="Senior arbiter address (0x...)"
            className="mb-2 w-full rounded-lg border border-wasit-line p-2 text-xs font-mono"
          />
          <button
            disabled={busy || !seniorArbiterInput}
            onClick={() => onAppeal(seniorArbiterInput)}
            className="w-full rounded-lg bg-wasit-ink py-2 text-xs font-bold text-wasit-bg disabled:opacity-40"
          >
            Appeal ({appealBondWei.toString()} wei bond, forfeited if upheld)
          </button>
        </div>
      )}

      {/* Anyone: finalize once the appeal window has passed unchallenged */}
      {milestone.status === "pending_finalization" && (
        <button
          disabled={busy}
          onClick={onFinalize}
          className="mt-2 w-full rounded-lg border border-wasit-line py-2 text-xs font-semibold text-wasit-muted disabled:opacity-40"
        >
          Finalize (appeal window closed)
        </button>
      )}

      {/* Senior arbiter: final ruling on an appeal */}
      {role === "senior_arbiter" && milestone.status === "appealed" && (
        <div className="mt-2 rounded-xl border border-wasit-ink/20 bg-wasit-ink/5 p-3">
          <p className="mb-2 text-xs font-semibold text-wasit-ink">
            Final ruling — no further appeal from here.
          </p>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => onSeniorArbiterRule(true)}
              className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              Uphold / rule for seller
            </button>
            <button
              disabled={busy}
              onClick={() => onSeniorArbiterRule(false)}
              className="flex-1 rounded-lg bg-wasit-red py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              Reverse / rule for buyer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
