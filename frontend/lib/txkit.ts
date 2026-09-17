import { createTransactionKit } from "@genlayer/transaction-kit";
import type { TransactionKit, SubmitInput, TrackedStatus } from "@genlayer/transaction-kit";
import {
  resolveChain,
  ensureCorrectNetwork,
  normalizeAddress,
  explorerTxUrl,
  getWriteClient,
} from "./genlayer";
import type { CalldataEncodable } from "genlayer-js/types";
import { getSelectedProvider } from "./wallets";
import { scheduleRpcCall, isTransientRpcError } from "./rpcLimiter";

/**
 * SubmitInput's write variant types `args` as bare `unknown[]` (it's
 * Transaction Kit's own input shape, built before genlayer-js's stricter
 * `CalldataEncodable[]`). The kit bridges this internally with an
 * identity function; PAYABLE_METHODS' direct genlayer-js calls below
 * need the same bridge, explicit about the cast rather than silent.
 */
const toCalldataArgs = (args: unknown[] | undefined) => args as CalldataEncodable[] | undefined;

/**
 * Contract methods whose execution can end with contracts/wasit.py's
 * `_pay`/`_release` actually sending GEN out -- a message GenVM
 * classifies as "external" (`gl.evm.contract_interface` / `_EOA(...).
 * emit_transfer(...)`), separate from the ordinary "internal" messages
 * every other write only ever produces.
 *
 * Confirmed against two real Studio Next transactions: an APPROVED
 * `submit_milestone` (which triggers `_release` -> `_pay`) failed at
 * execution with `fee no_matching_allocation # external`, while a
 * DISPUTED one on the same contract (no payout) succeeded. The
 * contract's payment logic itself is correct; the gap is in how the fee
 * for that external message gets declared before the write is sent.
 *
 * `@genlayer/transaction-kit@0.1.0-rc.2`'s own `estimate()` only calls
 * genlayer-js's non-simulating `estimateTransactionFees()`, which fills
 * in a `distribution` from static defaults/dev-profile suggestions and
 * never touches `messageAllocations` at all (`toPolicyQuote()` in the
 * kit doesn't even carry that field onto the `PolicyQuote` it returns).
 * `submit()` then only ever forwards `{ distribution, feeValue }` to
 * `client.writeContract()` -- `messageAllocations` is never sent, no
 * matter what. So any write that *can* end in a payout needs a fee
 * allocation the kit structurally never provides, and the failure
 * mode is invisible until the payout actually happens (a DISPUTED
 * verdict has nothing to pay, so it "succeeds" either way).
 *
 * genlayer-js itself has the missing piece:
 * `client.estimateTransactionFeesForWrite()` runs a real simulation of
 * the call (via Studio's `sim_estimateTransactionFees`, i.e. an actual
 * `gen_call`) -- for `submit_milestone` specifically, that means it
 * actually runs the judge -- and returns the exact `messageAllocations`
 * the real execution will need, which `client.writeContract({ fees })`
 * can then be given directly. This is also the only way to handle
 * `submit_milestone` correctly at all: whether it pays isn't known
 * until the judge's verdict is in, so only a live simulation (not a
 * static distribution) can produce the right allocation.
 *
 * These methods therefore skip the kit's estimate()/submit() pair
 * entirely and go through that simulate-based genlayer-js path instead
 * (see submitAndTrack below); `milestone_arbiter_rule` and
 * `appeal_ruling` are deliberately excluded even though they sit in the
 * same milestone flow, because the contract never calls `_pay` from
 * either (first-instance rulings just open the appeal window; funds
 * only move once `finalize_ruling` or `senior_arbiter_rule` runs) --
 * routing them through the simulate path would just be slower for no
 * reason. Every other write keeps using the kit as before.
 */
const PAYABLE_METHODS = new Set([
  "withdraw_stake",
  "submit_milestone",
  "milestone_buyer_approve",
  "senior_arbiter_rule",
  "finalize_ruling",
  "buyer_reclaim_abandoned",
  "milestone_force_release",
]);

/**
 * One kit per connected wallet address, reused across writes in the
 * same session instead of reconstructed on every call. Swapping
 * accounts (or reconnecting) just replaces the cache entry.
 */
let cached: { kit: TransactionKit; account: `0x${string}` } | null = null;

async function getKit(walletAddress: string): Promise<TransactionKit> {
  const account = normalizeAddress(walletAddress);

  // Also makes sure the wallet is actually pointed at Studio Next
  // before the kit ever tries to read live fee prices from it --
  // Transaction Kit doesn't switch chains itself, it assumes the
  // injected provider is already on the right one.
  await ensureCorrectNetwork(walletAddress);

  if (cached && cached.account === account) return cached.kit;

  const kit = createTransactionKit({
    chain: resolveChain(),
    provider: getSelectedProvider(),
    account,
  });
  cached = { kit, account };
  return kit;
}

/**
 * The fee quote itself is a read against Studio Next, so it's scheduled
 * through the same shared queue as every other read (lib/rpcLimiter.ts) --
 * otherwise a quote fired the moment a page's own reads are mid-burst
 * would land its own extra request outside that budget and could still
 * get rate-limited independently of the pacing lib/wasit.ts now does.
 * Transient-error detection also now shares that module's broader pattern
 * list (429 / "too many requests" / "rate limit" / Cloudflare "1010" /
 * DOCTYPE, on top of the network/timeout patterns this already had) so a
 * rate-limited quote gets retried instead of failing outright.
 */
async function estimateWithRetry(
  kit: TransactionKit,
  tx: SubmitInput,
  userValue: bigint | undefined,
  maxAttempts = 3
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await scheduleRpcCall(() => kit.estimate({ preset: "standard", userValue }, tx));
    } catch (err: any) {
      const message = String(err?.message ?? err);
      const looksUserCaused = /user rejected|insufficient funds|denied/i.test(message);
      if (looksUserCaused || !isTransientRpcError(err) || attempt === maxAttempts) throw err;
      const base = /429|too many request|rate.?limit|\b1010\b/i.test(message) ? 2500 : 1000;
      await new Promise((resolve) => setTimeout(resolve, base * attempt));
    }
  }
  throw new Error("Could not quote this transaction's fee after multiple attempts.");
}

/**
 * Same shape as estimateWithRetry above, for the simulate-based estimate
 * PAYABLE_METHODS uses instead. This call is heavier (a real `gen_call`
 * simulation, plus a fresh fee-policy read) and, for `submit_milestone`,
 * actually runs the judge against the submitted deliverable -- so it's
 * both slower and worth retrying just as carefully on a transient RPC
 * hiccup, through the same shared rate-limit queue as every other read.
 */
async function estimateForWriteWithRetry(
  client: ReturnType<typeof getWriteClient>,
  args: Parameters<typeof client.estimateTransactionFeesForWrite>[0],
  maxAttempts = 3
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await scheduleRpcCall(() => client.estimateTransactionFeesForWrite(args));
    } catch (err: any) {
      const message = String(err?.message ?? err);
      const looksUserCaused = /user rejected|insufficient funds|denied/i.test(message);
      if (looksUserCaused || !isTransientRpcError(err) || attempt === maxAttempts) throw err;
      const base = /429|too many request|rate.?limit|\b1010\b/i.test(message) ? 2500 : 1000;
      await new Promise((resolve) => setTimeout(resolve, base * attempt));
    }
  }
  throw new Error("Could not simulate this transaction's fee after multiple attempts.");
}

/**
 * Consensus v0.6 replacement for the old client.writeContract() /
 * client.deployContract() + waitForTransactionReceipt(ACCEPTED) pair.
 * Studio Next charges fees, so every deploy and write now needs a
 * quoted FeesDistribution before it can submit -- this is
 * estimate -> (re-estimate once if the live fee policy moved under
 * us) -> submit -> track, using Transaction Kit's `standard` preset
 * (funds up to 3 appeal rounds; bump per-call if a specific write is
 * known to need more headroom).
 *
 * Tracked until "decided" (validator consensus reached), not
 * "finalized" -- same ACCEPTED-not-FINALIZED reasoning the pre-v0.6
 * version of this file documented: finalization is extra confirmation
 * depth on top of a state that's already real, and waiting for it
 * makes writes look hung.
 *
 * `userValue` is the application-level GEN this call attaches (an
 * escrow funding amount, a stake, an appeal bond) -- separate from
 * the protocol fee, which the kit quotes on top of it.
 *
 * `final.successful` is Transaction Kit's combined status +
 * execution-result check (the "read status and execution together"
 * requirement from the v0.6 migration guide) -- ACCEPTED/FINALIZED
 * alone doesn't prove the call actually returned successfully.
 */
export async function submitAndTrack(
  tx: SubmitInput,
  walletAddress: string,
  userValue: bigint = 0n
): Promise<TrackedStatus> {
  // Still fetched even on the PAYABLE_METHODS path below: getKit() is
  // what actually calls ensureCorrectNetwork(), and kit.track() (used
  // by both paths) needs an instance regardless of how the write itself
  // got submitted.
  const kit = await getKit(walletAddress);

  let genlayerTxId: `0x${string}`;

  if (tx.kind === "write" && PAYABLE_METHODS.has(tx.method)) {
    // See the PAYABLE_METHODS comment above: this call can end in a real
    // payout, so quote it with a live simulation instead of the kit's
    // static estimate. No separate mismatch check here -- unlike the
    // kit's quote, this estimate is read fresh from the current fee
    // policy in the same call, immediately before submit, so there's no
    // earlier snapshot that could have gone stale.
    const client = getWriteClient(walletAddress);
    const estimate = await estimateForWriteWithRetry(client, {
      address: tx.address,
      functionName: tx.method,
      args: toCalldataArgs(tx.args),
      value: userValue,
      appealRounds: 3n, // matches the kit's "standard" preset used below
    });
    genlayerTxId = (await client.writeContract({
      address: tx.address,
      functionName: tx.method,
      args: toCalldataArgs(tx.args),
      value: userValue,
      fees: {
        distribution: estimate.distribution,
        messageAllocations: estimate.messageAllocations,
        feeValue: estimate.feeValue,
      },
    })) as `0x${string}`;
  } else {
    let quote = await estimateWithRetry(kit, tx, userValue);
    if (quote.verification.status === "mismatch") {
      // Stale fee-policy read -- re-estimate once against the live
      // policy before giving up, per Transaction Kit's documented
      // fail-closed behavior for a known mismatch.
      quote = await estimateWithRetry(kit, tx, userValue, 1);
      if (quote.verification.status === "mismatch") {
        throw new Error("Fee policy changed while quoting this transaction. Please try again.");
      }
    }
    ({ genlayerTxId } = await kit.submit(quote, tx));
  }

  let final: TrackedStatus;
  try {
    final = await kit.track(genlayerTxId, () => {}, { until: "decided" });
  } catch {
    throw new Error(
      `Still waiting on validator consensus (this can take longer than usual). Check the transaction directly: ${explorerTxUrl(genlayerTxId)}`
    );
  }

  if (!final.successful) {
    throw new Error(
      `Transaction did not succeed (${final.statusName ?? "unknown status"} / ${
        final.executionResultName ?? "unknown result"
      }). Check it directly: ${explorerTxUrl(genlayerTxId)}`
    );
  }

  // Same deliberate pause the pre-v0.6 version of this file had --
  // firing a read immediately after a write resolves is when the
  // Studio RPC has been observed dropping the very next request.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return final;
}
