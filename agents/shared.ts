import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

/**
 * This is the part that actually answers "can an AI agent use WASIT
 * without a human clicking a button" — createAccount(privateKey)
 * returns a real local signer (confirmed against genlayer-js@1.1.8's
 * own type declarations: it's a viem-style Account object with its
 * own .sign()/.signMessage()), and createClient({ account }) accepts
 * that Account directly. No window.ethereum, no MetaMask, no browser
 * anywhere in this file. Compare this to frontend/lib/genlayer.ts,
 * which deliberately takes the OPPOSITE path (account as a plain
 * address string + an injected provider) because that file is for a
 * human at a browser. Two different account shapes for two different
 * kinds of caller — genlayer-js supports both natively.
 */

export const chain = studionet;

export const FACTORY_ADDRESS = process.env.WASIT_FACTORY_ADDRESS as
  | `0x${string}`
  | undefined;

if (!FACTORY_ADDRESS) {
  throw new Error(
    "Set WASIT_FACTORY_ADDRESS in your environment before running an agent (see README.md)."
  );
}

/**
 * Builds a client that signs with a private key held directly by the
 * calling process — this is the agent itself, not a human relaying
 * through a wallet extension.
 */
export function makeAgentClient(privateKeyEnvVar: string) {
  const privateKey = process.env[privateKeyEnvVar] as `0x${string}` | undefined;
  if (!privateKey) {
    throw new Error(
      `Set ${privateKeyEnvVar} in your environment — a Studionet-funded private key for this agent.`
    );
  }
  const account = createAccount(privateKey);
  const client = createClient({ chain, account });
  return { client, address: account.address as `0x${string}` };
}

/**
 * Same ACCEPTED-not-FINALIZED reasoning as frontend/lib/wasitFactory.ts
 * and wasitEscrow.ts — see that file's comment for why.
 */
export async function writeAndWait(
  client: ReturnType<typeof makeAgentClient>["client"],
  params: { address: `0x${string}`; functionName: string; args: unknown[]; value: bigint },
  opts?: { interval?: number; retries?: number }
) {
  const hash = await client.writeContract(params as any);
  console.log(`  -> tx submitted: ${hash}`);
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: opts?.interval ?? 3000,
    retries: opts?.retries ?? 60,
  });
  console.log(`  -> tx accepted`);
  return { hash, receipt };
}
