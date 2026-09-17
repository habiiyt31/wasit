"use client";

import { useCallback, useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { useWallet } from "@/lib/useWallet";
import { genToWei, weiToGen } from "@/lib/units";
import {
  stakeAsArbiter,
  withdrawStake,
  listArbiters,
  getMinArbiterBond,
  getSeniorArbiterBond,
  type ArbiterInfo,
} from "@/lib/wasit";

export default function ArbiterPage() {
  const { address } = useWallet();

  const [minBond, setMinBond] = useState<bigint>(0n);
  const [seniorBond, setSeniorBond] = useState<bigint>(0n);
  const [myStake, setMyStake] = useState<bigint>(0n);
  const [myRulings, setMyRulings] = useState<bigint>(0n);
  const [directory, setDirectory] = useState<ArbiterInfo[]>([]);

  const [stakeAmount, setStakeAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [min, senior, list] = await Promise.all([
        getMinArbiterBond(),
        getSeniorArbiterBond(),
        // Pass address so the connected wallet is guaranteed to appear
        // in the table immediately after a successful stake, even before
        // the contract's enumeration index propagates to the RPC cache.
        listArbiters(address ?? undefined),
      ]);
      setMinBond(min);
      setSeniorBond(senior);
      setDirectory(list);

      // Derive myStake and myRulings from the list we already fetched
      // instead of making two extra RPC calls — the list already
      // contains the connected address (injected by listArbiters when
      // it has stake). This keeps total requests well under the 30/min
      // Studio Next rate limit.
      if (address) {
        const me = list.find(
          (a) => a.address.toLowerCase() === address.toLowerCase()
        );
        setMyStake(me?.stake ?? 0n);
        setMyRulings(me?.rulings ?? 0n);
      }
    } catch (err: any) {
      setError(err?.message ?? "Could not read the arbiter registry.");
    }
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(action: () => Promise<unknown>, done: string) {
    if (!address) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
      await refresh();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  const eligible = myStake >= minBond && minBond > 0n;
  const senior = myStake >= seniorBond && seniorBond > 0n;

  return (
    <>
      <SiteHeader back />
      <main className="mx-auto max-w-[1080px] px-f3 py-f5">
        <h1 className="font-display text-m font-extrabold">Become an arbiter</h1>
        <p className="mt-f2 max-w-[60ch] text-muted">
          Post a bond so buyers can choose you. Bonding five times the minimum also lets
          you hear appeals. Every ruling you make is recorded in the open.
        </p>

        <div className="mt-f4 grid items-start gap-f5 lg:grid-cols-[38.2fr_61.8fr]">
          <div className="grid gap-f3">
            <div className="panel">
              <p className="font-display text-m font-extrabold leading-none">
                {weiToGen(myStake)} GEN
              </p>
              <p className="mt-f1 text-sm text-muted">
                {address
                  ? `Your bond · ${myRulings.toString()} rulings recorded`
                  : "Connect a wallet to see your bond"}
              </p>
              {address && (
                <p className="mt-f2 text-sm">
                  {senior
                    ? "You can hear appeals."
                    : eligible
                    ? `Buyers can choose you. ${weiToGen(seniorBond)} GEN unlocks appeals.`
                    : `${weiToGen(minBond)} GEN is the minimum to be chosen.`}
                </p>
              )}
            </div>

            <div className="panel">
              <label className="field-label" htmlFor="stake">
                Add to your bond
              </label>
              <input
                id="stake"
                className="input"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                placeholder={minBond > 0n ? weiToGen(minBond) : "10"}
                inputMode="decimal"
              />
              <button
                className="btn mt-f2 w-full"
                disabled={busy || !address || !stakeAmount.trim()}
                onClick={() =>
                  run(
                    () => stakeAsArbiter(address!, genToWei(stakeAmount)),
                    "Bond posted."
                  )
                }
              >
                {busy ? "Working…" : "Post bond"}
              </button>
              <p className="mt-f2 text-xs text-muted">
                Bonds are tracked per address, and posting again adds to the same one.
              </p>
            </div>

            <div className="panel">
              <label className="field-label" htmlFor="withdraw">
                Withdraw from your bond
              </label>
              <input
                id="withdraw"
                className="input"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0"
                inputMode="decimal"
              />
              <button
                className="btn-ghost mt-f2 w-full"
                disabled={busy || !address || !withdrawAmount.trim()}
                onClick={() =>
                  run(
                    () => withdrawStake(address!, genToWei(withdrawAmount)),
                    "Withdrawal sent."
                  )
                }
              >
                {busy ? "Working…" : "Withdraw"}
              </button>
            </div>

            {error && <p className="text-sm text-sending">{error}</p>}
            {notice && <p className="text-sm text-turf">{notice}</p>}
          </div>

          <div>
            <h2 className="font-display text-[17px] font-bold">Arbiters</h2>
            <div className="mt-f2 overflow-hidden rounded border border-line bg-paper">
              {directory.length === 0 && (
                <p className="p-f3 text-sm text-muted">
                  Nobody has posted a bond yet.
                </p>
              )}
              {directory.map((a) => (
                <div
                  key={a.address}
                  className="flex items-center justify-between gap-f3 border-b border-line px-f3 py-f2 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{a.address}</p>
                    <p className="mt-[2px] text-xs text-muted">
                      {weiToGen(a.stake)} GEN · {a.rulings.toString()} rulings
                    </p>
                  </div>
                  <span
                    className={`flex-none rounded-full px-f2 py-[3px] text-xs font-bold ${
                      a.senior
                        ? "bg-pitch text-chalk"
                        : a.eligible
                        ? "bg-turf/12 text-turf"
                        : "bg-stone text-muted"
                    }`}
                  >
                    {a.senior ? "Senior" : a.eligible ? "Eligible" : "Under bond"}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-f2 text-xs text-muted">Read straight from the contract.</p>
          </div>
        </div>
      </main>
    </>
  );
}
