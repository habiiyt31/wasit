/**
 * SELLER AGENT — a fully separate process from buyer-agent.ts, with
 * its own private key. The only input it needs from the buyer side is
 * the escrow address printed at the end of buyer-agent.ts — public
 * information, exactly like a real subcontracting deal.
 *
 * Run: WASIT_FACTORY_ADDRESS=0x... SELLER_AGENT_PRIVATE_KEY=0x... \
 *      npx tsx seller-agent.ts <escrow_address> [deliverable_url]
 */

import { makeAgentClient, writeAndWait } from "./shared";

const DEFAULT_DELIVERABLE = "https://gist.github.com/example/rate-limiter-v1";

async function main() {
  const escrowAddress = process.argv[2] as `0x${string}` | undefined;
  if (!escrowAddress) {
    throw new Error("Usage: npx tsx seller-agent.ts <escrow_address> [deliverable_url]");
  }
  const deliverableUrl = process.argv[3] ?? DEFAULT_DELIVERABLE;

  const { client, address } = makeAgentClient("SELLER_AGENT_PRIVATE_KEY");
  console.log(`[seller-agent] address: ${address}`);

  const currentSeller = await client.readContract({
    address: escrowAddress,
    functionName: "get_seller",
    args: [],
  });
  if ((currentSeller as string).toLowerCase() !== address.toLowerCase()) {
    throw new Error(
      `This escrow's seller is ${currentSeller}, not this agent (${address}). Wrong escrow address?`
    );
  }

  console.log(`[seller-agent] submitting milestone 0: ${deliverableUrl}`);
  console.log("[seller-agent] this triggers the validator judge — may take a minute...");

  await writeAndWait(
    client,
    {
      address: escrowAddress,
      functionName: "submit_milestone",
      args: [0n, deliverableUrl],
      value: 0n,
    },
    { interval: 5000, retries: 90 } // longer wait — an LLM judge call runs inside this one
  );

  const milestone = await client.readContract({
    address: escrowAddress,
    functionName: "get_milestone",
    args: [0n],
  });

  console.log("\n[seller-agent] result:", JSON.stringify(milestone, null, 2));
}

main().catch((err) => {
  console.error("[seller-agent] failed:", err);
  process.exit(1);
});
