"use client";

import { useState } from "react";
import { StatusBadge } from "./StatusBadge";
import { weiToGen } from "@/lib/units";
import { appealBond, type Escrow, type Milestone } from "@/lib/wasit";

type Props = {
  index: number;
  milestone: Milestone;
  escrow: Escrow;
  wallet: `0x${string}` | null;
  busy: boolean;
  onSubmit: (index: bigint, url: string) => void;
  onBuyerApprove: (index: bigint) => void;
  onArbiterRule: (index: bigint, approve: boolean) => void;
  onAppeal: (index: bigint, seniorAddress: string) => void;
  onSeniorRule: (index: bigint, approve: boolean) => void;
  onFinalize: (index: bigint) => void;
  onClaimAttempt: (index: bigint) => void;
  onReclaim: (index: bigint) => void;
  onForceRelease: (index: bigint) => void;
};

export function MilestoneCard(props: Props) {
  const { index, milestone: m, escrow: e, wallet, busy } = props;
  const [url, setUrl] = useState("");
  const [senior, setSenior] = useState("");
  const i = BigInt(index);

  const is = (addr: string) => !!wallet && wallet.toLowerCase() === addr.toLowerCase();
  const isBuyer = is(e.buyer);
  const isSeller = is(e.seller);
  const isArbiter = is(e.arbiter);
  const isSeniorArbiter = is(m.appeal_arbiter);

  const funded = e.state === "FUNDED";
  const revisionsLeft = m.revision_count < e.max_revisions;

  return (
    <article className="panel">
      <div className="flex items-start justify-between gap-f2">
        <div className="min-w-0">
          <p className="text-xs text-muted">Milestone {index + 1}</p>
          <h3 className="mt-[3px] font-display text-[17px] font-semibold">
            {m.description}
          </h3>
        </div>
        <div className="flex flex-none flex-col items-end gap-[6px]">
          <StatusBadge status={m.status} />
          <span className="font-mono text-xs">{weiToGen(m.amount)} GEN</span>
        </div>
      </div>

      {m.deliverable && (
        <a
          href={m.deliverable}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-f2 block break-all border-t border-dashed border-line pt-f2 font-mono text-xs text-muted underline underline-offset-2 hover:text-pitch"
        >
          {m.deliverable}
        </a>
      )}

      {m.verdict && (
        <p className="mt-f2 rounded bg-stone p-f2 text-sm leading-relaxed">{m.verdict}</p>
      )}

      {(m.revision_count > 0n || m.claim_attempts > 0n) && (
        <p className="mt-f2 text-xs text-muted">
          {m.revision_count.toString()} of {e.max_revisions.toString()} revisions used
          {m.claim_attempts > 0n
            ? `, ${m.claim_attempts.toString()} of ${e.max_claim_attempts.toString()} claim attempts logged`
            : ""}
        </p>
      )}

      {isSeller && funded && (m.status === "pending" || (m.status === "disputed" && revisionsLeft)) && (
        <div className="mt-f3 border-t border-line pt-f3">
          <label className="field-label" htmlFor={`deliverable-${index}`}>
            Link to the code
            <span className="field-hint"> — a pull request, gist, or raw file</span>
          </label>
          <textarea
            id={`deliverable-${index}`}
            value={url}
            onChange={(ev) => setUrl(ev.target.value)}
            rows={2}
            className="input"
            placeholder="https://github.com/…/pull/312"
          />
          <button
            className="btn mt-f2 w-full"
            disabled={busy || !url.trim()}
            onClick={() => props.onSubmit(i, url.trim())}
          >
            {m.status === "disputed" ? "Submit revision" : "Submit for review"}
          </button>
        </div>
      )}

      {isBuyer && m.status === "disputed" && (
        <button
          className="btn-ghost mt-f3 w-full"
          disabled={busy}
          onClick={() => props.onBuyerApprove(i)}
        >
          Accept and pay anyway
        </button>
      )}

      {isSeller && m.status === "disputed" && !revisionsLeft && (
        <button
          className="btn-ghost mt-f2 w-full"
          disabled={busy}
          onClick={() => props.onClaimAttempt(i)}
        >
          Log a claim attempt
        </button>
      )}

      {isSeller &&
        m.status === "disputed" &&
        !revisionsLeft &&
        m.claim_attempts >= e.max_claim_attempts && (
          <button
            className="btn mt-f2 w-full"
            disabled={busy}
            onClick={() => props.onForceRelease(i)}
          >
            Release without a ruling
          </button>
        )}

      {isArbiter && m.status === "disputed" && !revisionsLeft && (
        <div className="mt-f3 grid grid-cols-2 gap-f1 border-t border-line pt-f3">
          <button className="btn" disabled={busy} onClick={() => props.onArbiterRule(i, true)}>
            Rule for seller
          </button>
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={() => props.onArbiterRule(i, false)}
          >
            Rule for buyer
          </button>
        </div>
      )}

      {m.status === "pending_finalization" && (
        <div className="mt-f3 rounded border border-dashed border-booking bg-booking/10 p-f2">
          <p className="text-sm font-medium">
            Ruled {m.arbiter_verdict === "approve" ? "for the seller" : "for the buyer"}.
            Funds stay put until the appeal window closes.
          </p>

          {(isBuyer || isSeller) && (
            <>
              <input
                value={senior}
                onChange={(ev) => setSenior(ev.target.value)}
                className="input mt-f2 font-mono text-xs"
                placeholder="Senior arbiter address (0x…)"
              />
              <button
                className="btn-ghost mt-f1 w-full"
                disabled={busy || !senior.trim()}
                onClick={() => props.onAppeal(i, senior.trim())}
              >
                Appeal — bond {weiToGen(appealBond(m.amount))} GEN
              </button>
            </>
          )}

          <button
            className="btn-ghost mt-f1 w-full"
            disabled={busy}
            onClick={() => props.onFinalize(i)}
          >
            Carry out the ruling
          </button>
        </div>
      )}

      {isSeniorArbiter && m.status === "appealed" && (
        <div className="mt-f3 grid grid-cols-2 gap-f1 border-t border-line pt-f3">
          <button className="btn" disabled={busy} onClick={() => props.onSeniorRule(i, true)}>
            Uphold for seller
          </button>
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={() => props.onSeniorRule(i, false)}
          >
            Uphold for buyer
          </button>
        </div>
      )}

      {isBuyer && funded && m.status === "pending" && (
        <button
          className="btn-ghost mt-f2 w-full"
          disabled={busy}
          onClick={() => props.onReclaim(i)}
        >
          Reclaim — seller never started
        </button>
      )}
    </article>
  );
}
