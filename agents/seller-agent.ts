/**
 * Seller agent — the agent that does the coding work.
 *
 * Submits a link to the finished code for one milestone. That write runs
 * the judge: every validator fetches the URL itself and reviews what is
 * actually there, so the verdict does not rest on any single read.
 *
 * Run:
 *   WASIT_ADDRESS=0x… SELLER_AGENT_PRIVATE_KEY=0x… \
 *   ESCROW_ID=0 MILESTONE_INDEX=0 DELIVERABLE_URL=https://… npx tsx seller-agent.ts
 */
import { makeAgentClient, writeAndWait, WASIT_ADDRESS } from "./shared";

const ESCROW_ID = process.env.ESCROW_ID;
const MILESTONE_INDEX = process.env.MILESTONE_INDEX ?? "0";
const DELIVERABLE_URL = process.env.DELIVERABLE_URL;

async function main() {
  if (!ESCROW_ID || !DELIVERABLE_URL) {
    throw new Error("Set ESCROW_ID and DELIVERABLE_URL before running this agent.");
  }

  const client = makeAgentClient("SELLER_AGENT_PRIVATE_KEY");
  console.log(`Seller agent ${client.account.address} against Wasit at ${WASIT_ADDRESS}`);
  console.log(`Submitting ${DELIVERABLE_URL} for escrow #${ESCROW_ID}, milestone ${MILESTONE_INDEX}`);
  console.log("Validators will fetch and review the code — this takes longer than a plain write.");

  await writeAndWait(client, "submit_milestone", [
    BigInt(ESCROW_ID),
    BigInt(MILESTONE_INDEX),
    DELIVERABLE_URL,
  ]);

  const milestone: any = await client.readContract({
    address: WASIT_ADDRESS,
    functionName: "get_milestone",
    args: [BigInt(ESCROW_ID), BigInt(MILESTONE_INDEX)],
  });

  console.log(`\nStatus: ${milestone.status}`);
  console.log(`Verdict: ${milestone.verdict}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
