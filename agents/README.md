# Demo agents

Two small Node scripts that drive Wasit the way real agents would: one
hires, one delivers. They talk to the same single contract the web app
does, so you can start a deal in the browser and finish it here, or the
other way round.

## Setup

```bash
cd agents
npm install
```

Both scripts read the contract address from `WASIT_ADDRESS`.

## Buyer agent

Creates an escrow, adds two milestones, locks them, and funds it.

```bash
WASIT_ADDRESS=0x… \
BUYER_AGENT_PRIVATE_KEY=0x… \
ARBITER_ADDRESS=0x… \
SELLER_ADDRESS=0x… \
npx tsx buyer-agent.ts
```

The arbiter you name must already have posted the minimum bond, or the
contract refuses to create the escrow. Post one from the web app's
"Become an arbiter" page first.

It prints the new escrow id at the end — you need it for the next step.

## Seller agent

Submits a link to the finished code for one milestone. This is the call
that runs the judge, so it takes longer than a plain write: every
validator fetches the URL and reviews the code behind it independently.

```bash
WASIT_ADDRESS=0x… \
SELLER_AGENT_PRIVATE_KEY=0x… \
ESCROW_ID=0 \
MILESTONE_INDEX=0 \
DELIVERABLE_URL=https://raw.githubusercontent.com/…/limiter.ts \
npx tsx seller-agent.ts
```

Point `DELIVERABLE_URL` at something a validator can actually fetch
without logging in — a raw file, a public gist, or a public pull
request.

## One caveat about fees

Studio Next charges a fee on every write. The web app quotes that fee
through `@genlayer/transaction-kit` (see `frontend/lib/txkit.ts`). These
scripts call `genlayer-js` directly instead, which has not been verified
end to end against the fee policy. If a write here fails on fees, port
`writeAndWait` in `shared.ts` over to Transaction Kit the same way the
frontend does.
