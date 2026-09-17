import type { CalldataEncodable } from "genlayer-js/types";
import { getReadClient, WASIT_ADDRESS } from "./genlayer";
import { submitAndTrack } from "./txkit";
import { withRpcRetry } from "./rpcLimiter";

/**
 * One contract, one address. The previous version of this file was two
 * modules — wasitFactory.ts and wasitEscrow.ts — because an escrow was
 * its own deployed contract that had to be registered against a factory.
 * Every escrow is now a record inside the single Wasit contract,
 * addressed by a numeric id, so there is no per-deal address to deploy,
 * register, store, or later fail to find.
 */

export type MilestoneStatus =
  | "pending"
  | "disputed"
  | "pending_finalization"
  | "appealed"
  | "released"
  | "refunded";

export type Milestone = {
  description: string;
  amount: bigint;
  deliverable: string;
  verdict: string;
  status: MilestoneStatus;
  revision_count: bigint;
  claim_attempts: bigint;
  arbiter_verdict: "" | "approve" | "reject";
  ruled_at_day: bigint;
  appeal_arbiter: `0x${string}`;
  appellant: `0x${string}`;
};

export type Escrow = {
  buyer: `0x${string}`;
  seller: `0x${string}`;
  arbiter: `0x${string}`;
  fee_recipient: `0x${string}`;
  fee_bps: bigint;
  project_title: string;
  project_description: string;
  state: "OPEN" | "FUNDED" | "RESOLVED";
  milestones_locked: boolean;
  milestone_count: bigint;
  max_revisions: bigint;
  max_claim_attempts: bigint;
  abandonment_timeout_days: bigint;
  appeal_window_days: bigint;
  funded_at_day: bigint;
};

export type ArbiterInfo = {
  address: `0x${string}`;
  stake: bigint;
  rulings: bigint;
  eligible: boolean;
  senior: boolean;
};

/**
 * Every read goes through the shared app-wide queue in lib/rpcLimiter.ts:
 * it paces calls so the whole app stays under Studio Next's ~30 req/min
 * cap (not just this one function), and retries a transient failure --
 * including an explicit rate-limit response, which the previous version
 * of this helper did not recognize and so never retried.
 */
async function read<T>(functionName: string, args: CalldataEncodable[] = []): Promise<T> {
  const client = getReadClient();
  return withRpcRetry(
    () => client.readContract({ address: WASIT_ADDRESS, functionName, args }) as Promise<T>,
    { label: functionName }
  );
}

/**
 * genlayer-js's readContract() JSON-safes its result by default
 * (jsonSafeReturn: true): every on-chain integer -- which the node
 * decodes as a real BigInt -- gets converted to a plain `number` if it
 * fits in Number.MAX_SAFE_INTEGER, or to a decimal *string* if it
 * doesn't (which is every wei amount above ~0.009 GEN, since 1 GEN is
 * 10^18 wei). Every field below is typed `bigint`, but that's a
 * compile-time-only annotation -- at runtime it's actually a number or
 * a string straight out of the RPC response. Doing bigint arithmetic
 * on it (`amount * 500n`, `count - 1n`, formatEther(amount), etc.)
 * throws "TypeError: Cannot mix BigInt and other types, use explicit
 * conversions" the moment the UI touches it. BigInt(x) reconstructs
 * the real bigint from either the number or string form, so every
 * read below is normalized back to what its type already claims.
 */
function toBig(x: unknown): bigint {
  return typeof x === "bigint" ? x : BigInt(x as number | string | boolean);
}

async function write(
  walletAddress: `0x${string}`,
  functionName: string,
  args: CalldataEncodable[],
  value: bigint = 0n
) {
  const status = await submitAndTrack(
    { kind: "write", address: WASIT_ADDRESS, method: functionName, args: args as unknown[] },
    walletAddress,
    value
  );
  return { hash: (status.evmTxHash ?? status.genlayerTxId) as `0x${string}`, status };
}

// ── arbiters ───────────────────────────────────────────────────────

export async function getMinArbiterBond(): Promise<bigint> {
  return toBig(await read<unknown>("get_min_arbiter_bond"));
}

export async function getSeniorArbiterBond(): Promise<bigint> {
  return toBig(await read<unknown>("get_senior_arbiter_bond"));
}

export async function getArbiterStake(address: string): Promise<bigint> {
  return toBig(await read<unknown>("get_arbiter_stake", [address]));
}

export async function getArbiterRulings(address: string): Promise<bigint> {
  return toBig(await read<unknown>("get_arbiter_ruling_count", [address]));
}

export async function listArbiters(
  /** Pass the connected wallet address to guarantee it appears in the
   *  list the moment after a successful stake, even if the contract's
   *  enumeration index hasn't propagated to the RPC cache yet. */
  connectedAddress?: string
): Promise<ArbiterInfo[]> {
  const count = toBig(await read<unknown>("get_arbiter_count"));

  const [minBond, seniorBond] = await Promise.all([
    getMinArbiterBond(),
    getSeniorArbiterBond(),
  ]);

  // No manual pacing here any more -- every read below (3 per arbiter:
  // index lookup + stake + rulings) goes through the shared queue in
  // lib/rpcLimiter.ts, which paces the whole app against the RPC's
  // ~30 req/min budget. That's what the old fixed 700/300/300ms sleeps
  // were approximating locally; the shared queue does it correctly
  // (accounting for every other read happening anywhere else in the app
  // at the same time) and adds no delay at all when nowhere near the cap.
  const out: ArbiterInfo[] = [];
  for (let i = 0n; i < count; i++) {
    const address = await read<`0x${string}`>("get_arbiter_by_index", [i]);
    const stake = await getArbiterStake(address);
    const rulings = await getArbiterRulings(address);

    out.push({
      address,
      stake,
      rulings,
      eligible: stake >= minBond,
      senior: stake >= seniorBond,
    });
  }

  // If the caller supplied a connected address AND it has stake on-chain
  // but isn't in the index yet (RPC propagation delay), inject it so the
  // UI doesn't look like the transaction was lost.
  if (connectedAddress) {
    const normalised = connectedAddress.toLowerCase();
    const alreadyListed = out.some(
      (a) => a.address.toLowerCase() === normalised
    );
    if (!alreadyListed) {
      try {
        const stake = await getArbiterStake(connectedAddress);
        if (stake > 0n) {
          const rulings = await getArbiterRulings(connectedAddress);
          out.unshift({
            address: connectedAddress as `0x${string}`,
            stake,
            rulings,
            eligible: stake >= minBond,
            senior: stake >= seniorBond,
          });
        }
      } catch {
        // If the read fails, it's fine — we just don't inject.
      }
    }
  }

  return out;
}

export async function stakeAsArbiter(walletAddress: `0x${string}`, amountWei: bigint) {
  return write(walletAddress, "stake_as_arbiter", [], amountWei);
}

export async function withdrawStake(walletAddress: `0x${string}`, amountWei: bigint) {
  return write(walletAddress, "withdraw_stake", [amountWei]);
}

// ── escrows ────────────────────────────────────────────────────────

export type CreateEscrowParams = {
  projectTitle: string;
  projectDescription: string;
  arbiterAddress: string;
  feeBps: bigint;
  feeRecipientAddress: string;
  maxRevisions: bigint;
  maxClaimAttempts: bigint;
  abandonmentTimeoutDays: bigint;
  appealWindowDays: bigint;
};

/**
 * Creating an escrow is now a single ordinary write. It used to be a
 * contract deploy plus a registration call, either of which could leave
 * a half-created deal behind.
 */
export async function createEscrow(
  walletAddress: `0x${string}`,
  params: CreateEscrowParams
) {
  return write(walletAddress, "create_escrow", [
    params.projectTitle,
    params.projectDescription,
    params.arbiterAddress,
    params.feeBps,
    params.feeRecipientAddress,
    params.maxRevisions,
    params.maxClaimAttempts,
    params.abandonmentTimeoutDays,
    params.appealWindowDays,
  ]);
}

export async function getEscrowCount(): Promise<bigint> {
  return toBig(await read<unknown>("get_escrow_count"));
}

export async function getEscrow(escrowId: bigint): Promise<Escrow> {
  const raw = await read<any>("get_escrow", [escrowId]);
  return {
    ...raw,
    fee_bps: toBig(raw.fee_bps),
    milestone_count: toBig(raw.milestone_count),
    max_revisions: toBig(raw.max_revisions),
    max_claim_attempts: toBig(raw.max_claim_attempts),
    abandonment_timeout_days: toBig(raw.abandonment_timeout_days),
    appeal_window_days: toBig(raw.appeal_window_days),
    funded_at_day: toBig(raw.funded_at_day),
  };
}

export async function getTotalAmount(escrowId: bigint): Promise<bigint> {
  return toBig(await read<unknown>("get_total_amount", [escrowId]));
}

export async function getMilestoneCount(escrowId: bigint): Promise<bigint> {
  return toBig(await read<unknown>("get_milestone_count", [escrowId]));
}

export async function getMilestone(escrowId: bigint, index: bigint): Promise<Milestone> {
  const raw = await read<any>("get_milestone", [escrowId, index]);
  return {
    ...raw,
    amount: toBig(raw.amount),
    revision_count: toBig(raw.revision_count),
    claim_attempts: toBig(raw.claim_attempts),
    ruled_at_day: toBig(raw.ruled_at_day),
  };
}

export async function getMilestones(escrowId: bigint): Promise<Milestone[]> {
  const count = await getMilestoneCount(escrowId);
  const out: Milestone[] = [];
  for (let i = 0n; i < count; i++) out.push(await getMilestone(escrowId, i));
  return out;
}

export async function addMilestone(
  walletAddress: `0x${string}`,
  escrowId: bigint,
  description: string,
  amountWei: bigint
) {
  return write(walletAddress, "add_milestone", [escrowId, description, amountWei]);
}

export async function lockMilestones(walletAddress: `0x${string}`, escrowId: bigint) {
  return write(walletAddress, "lock_milestones", [escrowId]);
}

export async function fund(
  walletAddress: `0x${string}`,
  escrowId: bigint,
  sellerAddress: string,
  totalWei: bigint
) {
  return write(walletAddress, "fund", [escrowId, sellerAddress], totalWei);
}

// ── work and judging ───────────────────────────────────────────────

export async function submitMilestone(
  walletAddress: `0x${string}`,
  escrowId: bigint,
  index: bigint,
  deliverableUrl: string
) {
  // Runs the judge across validators: each one fetches deliverableUrl
  // and reviews the code behind it. Transaction Kit's tracker is built
  // to sit through long LLM-backed transactions, so this needs no
  // special polling treatment.
  return write(walletAddress, "submit_milestone", [escrowId, index, deliverableUrl]);
}

export async function buyerApprove(
  walletAddress: `0x${string}`,
  escrowId: bigint,
  index: bigint
) {
  return write(walletAddress, "milestone_buyer_approve", [escrowId, index]);
}

export async function arbiterRule(
  walletAddress: `0x${string}`,
  escrowId: bigint,
  index: bigint,
  approve: boolean
) {
  return write(walletAddress, "milestone_arbiter_rule", [escrowId, index, approve]);
}

export async function appealRuling(
  walletAddress: `0x${string}`,
  escrowId: bigint,
  index: bigint,
  seniorArbiterAddress: string,
  bondWei: bigint
) {
  return write(
    walletAddress,
    "appeal_ruling",
    [escrowId, index, seniorArbiterAddress],
    bondWei
  );
}

export async function seniorArbiterRule(
  walletAddress: `0x${string}`,
  escrowId: bigint,
  index: bigint,
  approve: boolean
) {
  return write(walletAddress, "senior_arbiter_rule", [escrowId, index, approve]);
}

export async function finalizeRuling(
  walletAddress: `0x${string}`,
  escrowId: bigint,
  index: bigint
) {
  return write(walletAddress, "finalize_ruling", [escrowId, index]);
}

export async function claimAttempt(
  walletAddress: `0x${string}`,
  escrowId: bigint,
  index: bigint
) {
  return write(walletAddress, "milestone_claim_attempt", [escrowId, index]);
}

export async function reclaimAbandoned(
  walletAddress: `0x${string}`,
  escrowId: bigint,
  index: bigint
) {
  return write(walletAddress, "buyer_reclaim_abandoned", [escrowId, index]);
}

export async function forceRelease(
  walletAddress: `0x${string}`,
  escrowId: bigint,
  index: bigint
) {
  return write(walletAddress, "milestone_force_release", [escrowId, index]);
}

/** 5% of the milestone amount, matching APPEAL_BOND_BPS in the contract. */
export function appealBond(milestoneAmount: bigint): bigint {
  return (milestoneAmount * 500n) / 10000n;
}
