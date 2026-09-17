/**
 * Buyer agent — the agent that subcontracts a coding task.
 *
 * Creates an escrow, adds its milestones, locks them, and funds it. In
 * the single-contract rebuild this is four ordinary writes against one
 * address; it used to require deploying a per-deal contract and
 * registering it with a factory.
 *
 * Run:
 *   WASIT_ADDRESS=0x… BUYER_AGENT_PRIVATE_KEY=0x… \
 *   ARBITER_ADDRESS=0x… SELLER_ADDRESS=0x… npx tsx buyer-agent.ts
 */
import { parseEther } from "viem";
import { makeAgentClient, writeAndWait, WASIT_ADDRESS } from "./shared";

const ARBITER_ADDRESS = process.env.ARBITER_ADDRESS;
const SELLER_ADDRESS = process.env.SELLER_ADDRESS;

const PROJECT_TITLE = "Rate limiter for the API gateway";
const PROJECT_DESCRIPTION =
  "A Node service fronting our internal APIs. It needs per-key rate limiting " +
  "so one noisy client cannot exhaust capacity for everyone else.";

const MILESTONES = [
  {
    description: "Token bucket middleware, 100 requests per minute per API key",
    amount: parseEther("0.5"),
  },
  {
    description: "Return 429 with a Retry-After header, covered by tests",
    amount: parseEther("0.3"),
  },
];

async function main() {
  if (!ARBITER_ADDRESS || !SELLER_ADDRESS) {
    throw new Error("Set ARBITER_ADDRESS and SELLER_ADDRESS before running this agent.");
  }

  const client = makeAgentClient("BUYER_AGENT_PRIVATE_KEY");
  const buyer = client.account.address;
  console.log(`Buyer agent ${buyer} against Wasit at ${WASIT_ADDRESS}`);

  await writeAndWait(client, "create_escrow", [
    PROJECT_TITLE,
    PROJECT_DESCRIPTION,
    ARBITER_ADDRESS,
    250n, // 2.5% protocol fee
    buyer, // fee recipient
    2n, // revisions allowed
    3n, // claim attempts before a force release
    30n, // abandonment timeout, days
    3n, // appeal window, days
  ]);

  // The contract returns the new id, but reading a return value back off
  // a tracked transaction is version-dependent. The count is
  // authoritative, and this escrow is always the most recent one.
  const count: bigint = await client.readContract({
    address: WASIT_ADDRESS,
    functionName: "get_escrow_count",
    args: [],
  });
  const escrowId = count - 1n;
  console.log(`Created escrow #${escrowId}`);

  let total = 0n;
  for (const m of MILESTONES) {
    await writeAndWait(client, "add_milestone", [escrowId, m.description, m.amount]);
    total += m.amount;
    console.log(`Added milestone: ${m.description}`);
  }

  await writeAndWait(client, "lock_milestones", [escrowId]);
  console.log("Milestones locked");

  await writeAndWait(client, "fund", [escrowId, SELLER_ADDRESS], total);
  console.log(`Funded with ${total} wei. Seller ${SELLER_ADDRESS} can start.`);
  console.log(`\nRun the seller agent with:  ESCROW_ID=${escrowId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
