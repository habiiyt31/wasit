import { TransactionStatus } from "genlayer-js/types";
import type { CalldataEncodable } from "genlayer-js/types";
import { getReadClient, ensureCorrectNetwork } from "./genlayer";
import { logActivity, explorerTxUrl } from "./activityLog";

export type Milestone = {
  description: string;
  amount: bigint;
  deliverable: string;
  verdict: string;
  status:
    | "pending"
    | "disputed"
    | "pending_finalization"
    | "appealed"
    | "released"
    | "refunded";
  revision_count: bigint;
  claim_attempts: bigint;
  arbiter_verdict: "" | "approve" | "reject";
  ruled_at_day: bigint;
  appeal_arbiter: `0x${string}`;
  appellant: `0x${string}`;
};

async function withReadRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const message = String(err?.message ?? err);
      const looksTransient = /failed to fetch|network|timeout|fetch failed/i.test(message);
      if (!looksTransient || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
  throw new Error("Could not reach the contract after multiple attempts.");
}

async function writeContractWithRetry(
  client: Awaited<ReturnType<typeof ensureCorrectNetwork>>,
  params: { address: `0x${string}`; functionName: string; args: CalldataEncodable[]; value: bigint },
  maxAttempts = 3
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.writeContract(params);
    } catch (err: any) {
      const message = String(err?.message ?? err);
      const looksTransient =
        /rate limit|failed to fetch|network|timeout|eth_gasPrice|eth_estimateGas/i.test(message);
      const looksUserCaused = /user rejected|insufficient funds|denied/i.test(message);
      if (looksUserCaused || !looksTransient || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw new Error("Could not submit the transaction after multiple attempts.");
}

async function writeAndWait(
  escrowAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  functionName: string,
  args: CalldataEncodable[],
  value: bigint = 0n,
  opts?: { interval?: number; retries?: number }
) {
  const client = await ensureCorrectNetwork(walletAddress);
  const hash = await writeContractWithRetry(client, {
    address: escrowAddress,
    functionName,
    args,
    value,
  });

  logActivity({ hash, functionName, args, status: "pending", timestamp: Date.now() });

  try {
    const receipt = await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
      retries: opts?.retries ?? 60,
      interval: opts?.interval ?? 3000,
    });
    logActivity({ hash, functionName, args, status: "finalized", timestamp: Date.now() });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return { hash, receipt };
  } catch (err: any) {
    logActivity({ hash, functionName, args, status: "pending-long", timestamp: Date.now() });
    throw new Error(
      `Still waiting on validator consensus (this can take longer than usual). Check the transaction directly: ${explorerTxUrl(hash)}`
    );
  }
}

// ── setup (buyer, before funding) ──────────────────────────

export async function addMilestone(
  escrowAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  description: string,
  amountWei: bigint
) {
  return writeAndWait(escrowAddress, walletAddress, "add_milestone", [description, amountWei]);
}

export async function lockMilestones(escrowAddress: `0x${string}`, walletAddress: `0x${string}`) {
  return writeAndWait(escrowAddress, walletAddress, "lock_milestones", []);
}

/**
 * Funds the escrow. For native GEN, totalWei is attached as the
 * transaction value. For an ERC20 token deal, send the tokens to
 * escrowAddress yourself first (see contract header comment), then
 * call this with totalWei = 0n.
 */
export async function fund(
  escrowAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  sellerAddress: `0x${string}`,
  totalWei: bigint
) {
  return writeAndWait(escrowAddress, walletAddress, "fund", [sellerAddress], totalWei);
}

// ── work / judging ──────────────────────────────────────────

export async function submitMilestone(
  escrowAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  index: bigint,
  deliverableUrl: string
) {
  // Runs the LLM judge across validators (fetches deliverableUrl and
  // reviews it as code) -- give this one more room than a plain
  // state-change call.
  return writeAndWait(
    escrowAddress,
    walletAddress,
    "submit_milestone",
    [index, deliverableUrl],
    0n,
    { interval: 5000, retries: 90 }
  );
}

export async function buyerApprove(
  escrowAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  index: bigint
) {
  return writeAndWait(escrowAddress, walletAddress, "milestone_buyer_approve", [index]);
}

export async function arbiterRule(
  escrowAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  index: bigint,
  approve: boolean
) {
  return writeAndWait(escrowAddress, walletAddress, "milestone_arbiter_rule", [index, approve]);
}

export async function appealRuling(
  escrowAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  index: bigint,
  seniorArbiterAddress: `0x${string}`,
  appealBondWei: bigint
) {
  return writeAndWait(
    escrowAddress,
    walletAddress,
    "appeal_ruling",
    [index, seniorArbiterAddress],
    appealBondWei
  );
}

export async function seniorArbiterRule(
  escrowAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  index: bigint,
  approve: boolean
) {
  return writeAndWait(escrowAddress, walletAddress, "senior_arbiter_rule", [index, approve]);
}

export async function finalizeRuling(
  escrowAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  index: bigint
) {
  return writeAndWait(escrowAddress, walletAddress, "finalize_ruling", [index]);
}

export async function claimAttempt(
  escrowAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  index: bigint
) {
  return writeAndWait(escrowAddress, walletAddress, "milestone_claim_attempt", [index]);
}

export async function forceRelease(
  escrowAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  index: bigint
) {
  return writeAndWait(escrowAddress, walletAddress, "milestone_force_release", [index]);
}

export async function reclaimAbandoned(
  escrowAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  index: bigint
) {
  return writeAndWait(escrowAddress, walletAddress, "buyer_reclaim_abandoned", [index]);
}

// ── reads ───────────────────────────────────────────────────

export async function getState(escrowAddress: `0x${string}`): Promise<string> {
  return withReadRetry(async () => {
    const client = getReadClient();
    return (await client.readContract({
      address: escrowAddress,
      functionName: "get_state",
      args: [],
    })) as string;
  });
}

export async function getMilestoneCount(escrowAddress: `0x${string}`): Promise<bigint> {
  return withReadRetry(async () => {
    const client = getReadClient();
    const r = await client.readContract({
      address: escrowAddress,
      functionName: "get_milestone_count",
      args: [],
    });
    return BigInt(r as any);
  });
}

export async function getMilestone(escrowAddress: `0x${string}`, index: bigint): Promise<Milestone> {
  return withReadRetry(async () => {
    const client = getReadClient();
    return (await client.readContract({
      address: escrowAddress,
      functionName: "get_milestone",
      args: [index],
    })) as unknown as Milestone;
  });
}

export async function getBuyer(escrowAddress: `0x${string}`): Promise<`0x${string}`> {
  return withReadRetry(async () => {
    const client = getReadClient();
    return (await client.readContract({
      address: escrowAddress,
      functionName: "get_buyer",
      args: [],
    })) as `0x${string}`;
  });
}

export async function getSeller(escrowAddress: `0x${string}`): Promise<`0x${string}`> {
  return withReadRetry(async () => {
    const client = getReadClient();
    return (await client.readContract({
      address: escrowAddress,
      functionName: "get_seller",
      args: [],
    })) as `0x${string}`;
  });
}

export async function getArbiter(escrowAddress: `0x${string}`): Promise<`0x${string}`> {
  return withReadRetry(async () => {
    const client = getReadClient();
    return (await client.readContract({
      address: escrowAddress,
      functionName: "get_arbiter",
      args: [],
    })) as `0x${string}`;
  });
}

export async function getTotalAmount(escrowAddress: `0x${string}`): Promise<bigint> {
  return withReadRetry(async () => {
    const client = getReadClient();
    const r = await client.readContract({
      address: escrowAddress,
      functionName: "get_total_amount",
      args: [],
    });
    return BigInt(r as any);
  });
}

/** Convenience: fetch every milestone in one call for a dashboard view. */
export async function listMilestones(escrowAddress: `0x${string}`): Promise<Milestone[]> {
  const count = await getMilestoneCount(escrowAddress);
  const out: Milestone[] = [];
  for (let i = 0n; i < count; i++) {
    out.push(await getMilestone(escrowAddress, i));
  }
  return out;
}
