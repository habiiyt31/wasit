"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { hasContractAddress } from "@/lib/genlayer";
import { getEscrowCount, getEscrow, getTotalAmount, type Escrow } from "@/lib/wasit";
import { weiToGen } from "@/lib/units";

type Row = { id: bigint; escrow: Escrow; total: bigint };

const STEPS = [
  {
    title: "The buyer locks the money",
    body: "Each milestone carries its own spec and its own amount, funded up front.",
  },
  {
    title: "The seller submits code",
    body: "A link to a pull request, gist, or raw file — not a description of the work.",
  },
  {
    title: "Validators judge it",
    body: "Each validator fetches that code itself and reaches its own verdict.",
  },
  {
    title: "Ruling, then appeal",
    body: "An arbiter's ruling opens an appeal window before any money actually moves.",
  },
];

export default function Home() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasContractAddress()) {
      setLoading(false);
      setLoadError("No contract address configured yet. Set NEXT_PUBLIC_WASIT_ADDRESS in frontend/.env.local, then reload.");
      return;
    }
    (async () => {
      try {
        const count = await getEscrowCount();
        const out: Row[] = [];
        for (let id = count - 1n; id >= 0n && out.length < 25; id--) {
          const escrow = await getEscrow(id);
          out.push({ id, escrow, total: await getTotalAmount(id) });
        }
        setRows(out);
      } catch (err: any) {
        setLoadError(err?.message ?? "Could not read escrows from the contract.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <SiteHeader />

      <main>
        <div className="mx-auto max-w-[1080px] px-f3">
          {/* 61.8 / 38.2 */}
          <section className="grid items-center gap-f5 py-f6 lg:grid-cols-[61.8fr_38.2fr]">
            <div>
              <h1 className="max-w-[15ch] font-display text-l font-extrabold tracking-[-0.02em]">
                A referee for agents that hire agents to write code.
              </h1>
              <p className="mt-f3 max-w-[46ch] text-[18px] text-muted">
                Money is locked one milestone at a time. The selling agent submits a
                link to real code, and GenLayer validators fetch it and judge it
                separately. No single party gets to decide the outcome on its own.
              </p>
              <div className="mt-f4 flex flex-wrap gap-f2">
                <Link href="/create" className="btn">
                  Create an escrow
                </Link>
                <Link href="/arbiter" className="btn-ghost">
                  Become an arbiter
                </Link>
              </div>
            </div>

            <figure className="m-0">
              <div className="overflow-hidden rounded border border-line bg-paper">
                <div className="border-b border-dashed border-line p-f3">
                  <p className="font-display text-[17px] font-semibold">
                    Rate limiter for the API gateway
                  </p>
                  <p className="mt-[6px] break-all font-mono text-xs text-muted">
                    github.com/acme/gateway/pull/312
                  </p>
                </div>
                <div className="p-f3">
                  <p className="text-sm text-muted">
                    Milestone 2 — token bucket middleware, 100 requests per minute per key.
                  </p>
                  <div className="mt-f2">
                    <StatusBadge status="released" />
                  </div>
                  <p className="mt-f2 text-sm leading-relaxed">
                    Per-key limiting matches the spec and the race condition is covered
                    by a test.
                  </p>
                </div>
                <div className="flex items-center justify-between bg-stone px-f3 py-f2 text-sm">
                  <span>Paid to the seller</span>
                  <span className="font-mono font-medium">240 GEN</span>
                </div>
              </div>
              <figcaption className="mt-f2 text-right text-xs text-muted">
                What a decided milestone looks like.
              </figcaption>
            </figure>
          </section>
        </div>

        <hr className="chalkline" />

        <div className="mx-auto max-w-[1080px] px-f3">
          <section className="py-f6">
            <h2 className="max-w-[20ch] font-display text-m font-extrabold">
              One match, four phases.
            </h2>
            <p className="mt-f2 max-w-[56ch] text-muted">
              All of it lives in one contract. There is no second contract to deploy and
              register, so an escrow cannot end up stranded at an address nothing knows
              about.
            </p>

            <ol className="relative mt-f4 grid list-none grid-cols-2 gap-f3 p-0 lg:grid-cols-4">
              <div
                className="absolute left-0 right-0 top-[11px] hidden h-px bg-line lg:block"
                aria-hidden="true"
              />
              {STEPS.map((step, n) => (
                <li key={step.title} className="relative">
                  <span className="relative z-10 grid h-[23px] w-[23px] place-items-center rounded-full border-[1.5px] border-pitch bg-chalk font-mono text-[11px]">
                    {n + 1}
                  </span>
                  <h3 className="mt-f2 font-display text-[17px] font-semibold">
                    {step.title}
                  </h3>
                  <p className="mt-[6px] text-sm text-muted">{step.body}</p>
                </li>
              ))}
            </ol>

            <div className="mt-f4 grid gap-f3 border-t border-line pt-f3 lg:grid-cols-3">
              {[
                ["#1F6F4A", "Green — paid out", "The review passed and the milestone amount goes to the seller."],
                ["#F2C230", "Yellow — contested", "Still open to revision until the revision budget runs out."],
                ["#D7263D", "Red — returned", "Rejected for good, and the milestone amount goes back to the buyer."],
              ].map(([color, title, body]) => (
                <div key={title} className="flex items-start gap-f2">
                  <span
                    className="h-[36px] w-[26px] flex-none rounded-[3px] shadow-sm"
                    style={{ background: color }}
                  />
                  <div>
                    <h3 className="font-display text-[15.5px] font-bold">{title}</h3>
                    <p className="mt-[3px] text-sm text-muted">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <hr className="chalkline" />

        <div className="mx-auto max-w-[1080px] px-f3">
          <section className="py-f6">
            <h2 className="font-display text-m font-extrabold">Escrows</h2>

            {loading && <p className="mt-f3 text-muted">Reading the contract…</p>}
            {loadError && <p className="mt-f3 text-sm text-sending">{loadError}</p>}

            {!loading && !loadError && rows.length === 0 && (
              <div className="mt-f3 rounded border border-dashed border-line p-f4 text-center">
                <p className="text-muted">Nothing here yet.</p>
                <Link href="/create" className="btn mt-f3">
                  Create the first escrow
                </Link>
              </div>
            )}

            <div className="mt-f3 grid gap-f2">
              {rows.map(({ id, escrow, total }) => (
                <Link
                  key={id.toString()}
                  href={`/escrow/${id.toString()}`}
                  className="flex items-center justify-between gap-f3 rounded border border-line bg-paper p-f3 transition-colors hover:border-pitch"
                >
                  <div className="min-w-0">
                    <p className="truncate font-display text-[17px] font-semibold">
                      {escrow.project_title}
                    </p>
                    <p className="mt-[3px] font-mono text-xs text-muted">
                      #{id.toString()} · {escrow.milestone_count.toString()} milestones
                    </p>
                  </div>
                  <div className="flex flex-none flex-col items-end gap-[6px]">
                    <StatusBadge status={escrow.state} />
                    <span className="font-mono text-xs">{weiToGen(total)} GEN</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <hr className="chalkline" />
        <div className="mx-auto flex max-w-[1080px] flex-wrap justify-between gap-f3 px-f3 py-f5 text-sm text-muted">
          <span>Wasit — milestone escrow on GenLayer.</span>
          <span className="font-mono text-xs">Studio Next · chain 61997</span>
        </div>
      </main>
    </>
  );
}
