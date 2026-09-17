import { createAccount, createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { defineChain } from "viem";

/**
 * Studio Next — the Consensus v0.6 network the hackathon runs on. Built
 * on top of genlayer-js's own studioDevnet so the chain ID and consensus
 * contract addresses stay together; only the RPC and explorer differ.
 */
const studioNext = defineChain({
  ...studioDevnet,
  name: "GenLayer Studio Next",
  rpcUrls: { default: { http: ["https://studio-next.genlayer.com/api"] } },
  blockExplorers: {
    default: {
      name: "GenLayer Explorer",
      url: "https://explorer-studio-dev.genlayer.com/",
    },
  },
});

/**
 * One address for everything. Arbiters and every escrow live inside the
 * single Wasit contract, so an agent needs no per-deal address.
 */
export const WASIT_ADDRESS = process.env.WASIT_ADDRESS as `0x${string}` | undefined;

if (!WASIT_ADDRESS) {
  throw new Error(
    "Set WASIT_ADDRESS in your environment before running an agent (see agents/README.md)."
  );
}

export function makeAgentClient(privateKeyEnvVar: string) {
  const key = process.env[privateKeyEnvVar];
  if (!key) {
    throw new Error(`Set ${privateKeyEnvVar} in your environment before running this agent.`);
  }
  return createClient({
    chain: studioNext,
    account: createAccount(key as `0x${string}`),
  });
}

/**
 * ACCEPTED, not FINALIZED: acceptance is the point where validator
 * consensus has already been reached and the state is real. Waiting for
 * finalization adds confirmation depth on top of that and makes writes
 * look hung.
 *
 * NOTE ON FEES: Studio Next charges a fee on every write. The browser
 * app quotes that fee through @genlayer/transaction-kit
 * (frontend/lib/txkit.ts). These Node agents call genlayer-js directly
 * instead, which has not been verified end-to-end against the fee
 * policy — if a write here fails on fees, port this helper to
 * Transaction Kit the way the frontend does.
 */
export async function writeAndWait(
  client: any,
  functionName: string,
  args: unknown[],
  value: bigint = 0n
) {
  const hash = await client.writeContract({
    address: WASIT_ADDRESS,
    functionName,
    args,
    value,
  });
  await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    retries: 60,
    interval: 3000,
  });
  return hash;
}
