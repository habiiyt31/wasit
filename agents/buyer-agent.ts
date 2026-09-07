/**
 * BUYER AGENT — run this as its own process, independent from
 * seller-agent.ts. It never touches seller-agent.ts's private key or
 * process memory; the only thing connecting them is on-chain state
 * (the escrow contract) and the escrow address printed at the end,
 * which you hand to the seller agent the same way a real buyer would
 * hand a seller a contract address — it's public information, not a
 * secret.
 *
 * Run: WASIT_FACTORY_ADDRESS=0x... BUYER_AGENT_PRIVATE_KEY=0x... \
 *      SELLER_AGENT_ADDRESS=0x... ARBITER_ADDRESS=0x... \
 *      npx tsx buyer-agent.ts
 */

import { makeAgentClient, writeAndWait, FACTORY_ADDRESS } from "./shared";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MILESTONE_AMOUNT = 300000000000000000n; // 0.3 GEN

async function main() {
  const { client, address } = makeAgentClient("BUYER_AGENT_PRIVATE_KEY");
  console.log(`[buyer-agent] address: ${address}`);

  const sellerAddress = process.env.SELLER_AGENT_ADDRESS as `0x${string}` | undefined;
  const arbiterAddress = process.env.ARBITER_ADDRESS as `0x${string}` | undefined;
  const treasuryAddress = (process.env.TREASURY_ADDRESS as `0x${string}` | undefined) ?? address;

  if (!sellerAddress || !arbiterAddress) {
    throw new Error(
      "Set SELLER_AGENT_ADDRESS and ARBITER_ADDRESS in your environment (see README.md)."
    );
  }

  console.log("[buyer-agent] creating escrow...");
  const { receipt } = await writeAndWait(client, {
    address: FACTORY_ADDRESS!,
    functionName: "create_escrow",
    args: [
      "Rate limiter middleware",
      "Implement a token bucket rate limiter for the public API gateway, handling burst traffic gracefully.",
      arbiterAddress,
      ZERO_ADDRESS,
      250n, // fee_bps: 2.5%
      treasuryAddress,
      3n, // max_revisions
      3n, // max_claim_attempts
      14, // abandonment_timeout_days
      3, // appeal_window_days
    ],
    value: 0n,
  });

  // See README's "still unconfirmed" section — which receipt field
  // carries the freshly deployed address hasn't been checked against
  // a real Studio deploy yet.
  const escrowAddress =
    (receipt as any).to_address || (receipt as any).recipient || (receipt as any).data?.contract_address;

  if (!escrowAddress) {
    console.log("[buyer-agent] full receipt for manual inspection:", JSON.stringify(receipt, null, 2));
    throw new Error("Could not find the deployed escrow address in the receipt — fix this file once you know the right field.");
  }
  console.log(`[buyer-agent] escrow deployed at: ${escrowAddress}`);

  console.log("[buyer-agent] adding milestone...");
  await writeAndWait(client, {
    address: escrowAddress,
    functionName: "add_milestone",
    args: ["Endpoint returns HTTP 429 once the rate limit is exceeded", MILESTONE_AMOUNT],
    value: 0n,
  });

  console.log("[buyer-agent] locking milestones...");
  await writeAndWait(client, {
    address: escrowAddress,
    functionName: "lock_milestones",
    args: [],
    value: 0n,
  });

  console.log("[buyer-agent] funding escrow...");
  await writeAndWait(client, {
    address: escrowAddress,
    functionName: "fund",
    args: [sellerAddress],
    value: MILESTONE_AMOUNT,
  });

  console.log(`\n[buyer-agent] done. Hand this address to the seller agent:\n${escrowAddress}`);
}

main().catch((err) => {
  console.error("[buyer-agent] failed:", err);
  process.exit(1);
});
