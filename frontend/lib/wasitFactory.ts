import { TransactionStatus } from "genlayer-js/types";
import type { CalldataEncodable } from "genlayer-js/types";
import { getReadClient, ensureCorrectNetwork, FACTORY_ADDRESS } from "./genlayer";
import { logActivity, explorerTxUrl } from "./activityLog";

/**
 * ACCEPTED, not FINALIZED -- matches confluence's own lib/contract.ts,
 * with the same reasoning documented there: per GenLayer's docs
 * ("Using a Browser Wallet (MetaMask)"), the browser-wallet example
 * waits for ACCEPTED. That's the point in the transaction lifecycle
 * (Pending -> Proposing -> Committing -> Revealing -> Accepted ->
 * Finalized) where validator consensus has already been reached and
 * the state is real -- FINALIZED is extra confirmation depth on top
 * of that, and waiting for it made writes look hung even though
 * they'd already gone through.
 */

export type ArbiterInfo = {
  address: `0x${string}`;
  stake: bigint;
  rulings: bigint;
  eligible: boolean;
};

/**
 * Studionet is a shared RPC that occasionally drops a request outright
 * ("Failed to fetch") independent of the query itself. Reads happen
 * far more often than writes, so without a retry here the same class
 * of hiccup writeContractWithRetry handles below would surface
 * constantly as a full-page error.
 */
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

/**
 * genlayer-js's writeContract() internally calls eth_gasPrice /
 * eth_estimateGas before submitting anything, and those specific
 * calls have been observed getting rate-limited or dropped on
 * Studionet independent of whether the write itself would have gone
 * through. A failure here never reached the network -- no hash was
 * returned yet -- so retrying the whole submission can't
 * double-execute anything.
 */
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
  walletAddress: `0x${string}`,
  functionName: string,
  args: CalldataEncodable[],
  value: bigint = 0n
) {
  const client = await ensureCorrectNetwork(walletAddress);
  const hash = await writeContractWithRetry(client, {
    address: FACTORY_ADDRESS,
    functionName,
    args,
    value,
  });

  logActivity({ hash, functionName, args, status: "pending", timestamp: Date.now() });

  try {
    const receipt = await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
      retries: 60,
      interval: 3000,
    });
    logActivity({ hash, functionName, args, status: "finalized", timestamp: Date.now() });
    // Deliberate pause before the caller refreshes reads -- see
    // withReadRetry above for why firing reads immediately after a
    // write resolves is exactly when Studionet has been observed
    // dropping requests.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return { hash, receipt };
  } catch (err: any) {
    logActivity({ hash, functionName, args, status: "pending-long", timestamp: Date.now() });
    throw new Error(
      `Still waiting on validator consensus (this can take longer than usual). Check the transaction directly: ${explorerTxUrl(hash)}`
    );
  }
}

export type CreateEscrowParams = {
  projectTitle: string;
  projectDescription: string;
  arbiterAddress: `0x${string}`;
  tokenAddress: `0x${string}`; // ZERO_ADDRESS for native GEN
  feeBps: bigint;
  feeRecipientAddress: `0x${string}`;
  maxRevisions: bigint;
  maxClaimAttempts: bigint;
  abandonmentTimeoutDays: bigint;
  appealWindowDays: bigint;
};

// ── writes ──────────────────────────────────────────────────

export async function stakeAsArbiter(walletAddress: `0x${string}`, amountWei: bigint) {
  return writeAndWait(walletAddress, "stake_as_arbiter", [], amountWei);
}

export async function withdrawStake(walletAddress: `0x${string}`, amountWei: bigint) {
  return writeAndWait(walletAddress, "withdraw_stake", [amountWei]);
}

/**
 * Deploys a new WasitEscrow via the factory. The freshly deployed
 * contract's address needs to be read back out of the receipt --
 * which field that lands on hasn't been confirmed against a real
 * Studio deploy yet (flagged in wasitEscrow.ts / README too). Log the
 * receipt the first time you run this for real and adjust
 * extractDeployedAddress() below if needed.
 */
export async function createEscrow(walletAddress: `0x${string}`, params: CreateEscrowParams) {
  return writeAndWait(walletAddress, "create_escrow", [
    params.projectTitle,
    params.projectDescription,
    params.arbiterAddress,
    params.tokenAddress,
    params.feeBps,
    params.feeRecipientAddress,
    params.maxRevisions,
    params.maxClaimAttempts,
    params.abandonmentTimeoutDays,
    params.appealWindowDays,
  ]);
}

export function extractDeployedAddress(receipt: unknown): `0x${string}` | null {
  const r = receipt as any;
  return r?.to_address || r?.recipient || r?.data?.contract_address || null;
}

// ── reads ───────────────────────────────────────────────────

export async function getEscrowCount(): Promise<bigint> {
  return withReadRetry(async () => {
    const client = getReadClient();
    const r = await client.readContract({
      address: FACTORY_ADDRESS,
      functionName: "get_escrow_count",
      args: [],
    });
    return BigInt(r as any);
  });
}

export async function getEscrow(escrowId: bigint): Promise<`0x${string}`> {
  return withReadRetry(async () => {
    const client = getReadClient();
    return (await client.readContract({
      address: FACTORY_ADDRESS,
      functionName: "get_escrow",
      args: [escrowId],
    })) as `0x${string}`;
  });
}

export async function getBuyerOf(escrowId: bigint): Promise<`0x${string}`> {
  return withReadRetry(async () => {
    const client = getReadClient();
    return (await client.readContract({
      address: FACTORY_ADDRESS,
      functionName: "get_buyer_of",
      args: [escrowId],
    })) as `0x${string}`;
  });
}

export async function getArbiterCount(): Promise<bigint> {
  return withReadRetry(async () => {
    const client = getReadClient();
    const r = await client.readContract({
      address: FACTORY_ADDRESS,
      functionName: "get_arbiter_count",
      args: [],
    });
    return BigInt(r as any);
  });
}

export async function getArbiterByIndex(index: bigint): Promise<`0x${string}`> {
  return withReadRetry(async () => {
    const client = getReadClient();
    return (await client.readContract({
      address: FACTORY_ADDRESS,
      functionName: "get_arbiter_by_index",
      args: [index],
    })) as `0x${string}`;
  });
}

export async function getArbiterStake(arbiterAddress: `0x${string}`): Promise<bigint> {
  return withReadRetry(async () => {
    const client = getReadClient();
    const r = await client.readContract({
      address: FACTORY_ADDRESS,
      functionName: "get_arbiter_stake",
      args: [arbiterAddress],
    });
    return BigInt(r as any);
  });
}

export async function getArbiterRulingCount(arbiterAddress: `0x${string}`): Promise<bigint> {
  return withReadRetry(async () => {
    const client = getReadClient();
    const r = await client.readContract({
      address: FACTORY_ADDRESS,
      functionName: "get_arbiter_ruling_count",
      args: [arbiterAddress],
    });
    return BigInt(r as any);
  });
}

export async function isArbiterEligible(arbiterAddress: `0x${string}`): Promise<boolean> {
  return withReadRetry(async () => {
    const client = getReadClient();
    return (await client.readContract({
      address: FACTORY_ADDRESS,
      functionName: "is_arbiter_eligible",
      args: [arbiterAddress],
    })) as boolean;
  });
}

export async function isSeniorArbiter(arbiterAddress: `0x${string}`): Promise<boolean> {
  return withReadRetry(async () => {
    const client = getReadClient();
    return (await client.readContract({
      address: FACTORY_ADDRESS,
      functionName: "is_senior_arbiter",
      args: [arbiterAddress],
    })) as boolean;
  });
}

/** Convenience: fetch every registered arbiter with stake + rulings. */
export async function listArbiters(): Promise<ArbiterInfo[]> {
  const count = await getArbiterCount();
  const out: ArbiterInfo[] = [];
  for (let i = 0n; i < count; i++) {
    const address = await getArbiterByIndex(i);
    const [stake, rulings, eligible] = await Promise.all([
      getArbiterStake(address),
      getArbiterRulingCount(address),
      isArbiterEligible(address),
    ]);
    out.push({ address, stake, rulings, eligible });
  }
  return out;
}
