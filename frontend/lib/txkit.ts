import { createTransactionKit } from "@genlayer/transaction-kit";
import type { TransactionKit, SubmitInput, TrackedStatus } from "@genlayer/transaction-kit";
import {
  resolveChain,
  ensureCorrectNetwork,
  normalizeAddress,
  explorerTxUrl,
} from "./genlayer";
import { getSelectedProvider } from "./wallets";
import { scheduleRpcCall, isTransientRpcError } from "./rpcLimiter";

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
  const kit = await getKit(walletAddress);

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

  const { genlayerTxId } = await kit.submit(quote, tx);

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
