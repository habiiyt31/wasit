# WASIT

Milestone escrow for agents subcontracting code to agents. Independent
GenLayer validators fetch the real deliverable (a PR, a gist) and
review it against the milestone spec, separately — no single
manipulated read decides the outcome.

## Why this exists next to Internet Court

GenLayer Foundation's [Internet Court](https://internetcourt.org)
(launched July 10 2026, 27 founding members including OKX and
MetaMask) is a generic, cross-vertical standard for agent-to-agent
dispute resolution — identity, negotiation, contracts, payment/escrow,
execution, disputes. It's a protocol other systems plug into; it
deliberately does not specify how any one vertical should be judged.

WASIT isn't a competing standard — it's one concrete, opinionated
implementation of the "payment and escrow" + "disputes" layers, for
one vertical: an agent that subcontracts a coding task to another
agent. The deliverable is a real URL, fetched and reviewed as code
(correctness against spec, obvious bugs, obvious security issues), not
generic prose. That's a narrower, more specific judging problem than a
cross-vertical standard commits to — which is exactly where this
project's contribution sits.

**Track: Onchain Justice.** Matches "Agentic marketplace disputes.
Escrow released when a deliverable meets machine-readable terms."

## The appeal system (why this fully answers the track's own name)

The track is called "Disputes, **appeals**, and rule enforcement" — a
single arbiter whose ruling is final only covers two of those three
words. WASIT has a real two-tier appeal system:

1. A regular arbiter rules on a disputed milestone. Funds do **not**
   move yet.
2. An `appeal_window_days` window opens. Either party can escalate to
   a **senior arbiter** (staked 5x the regular minimum) by posting a
   5% bond of the milestone amount.
3. The senior arbiter's ruling is final. If they **reverse** the
   original verdict, the appellant gets their bond back. If they
   **uphold** it, the bond is forfeited to the fee recipient — an
   appeal that just wastes a senior arbiter's time isn't free.
4. If nobody appeals in time, anyone can call `finalize_ruling()` to
   execute the original verdict.

This is the concrete difference between "we have dispute resolution"
(true of almost every escrow contract) and "we have a justice system"
(true of very few).

## Project structure

Deliberately mirrors your confluence project's layout:

```
contracts/
  wasit_escrow.py      # per-deal contract
  wasit_factory.py       # deploys escrow instances, arbiter directory
tests/
  direct/                # pytest unit tests (pure-function logic)
  integration/            # gltest, runs against a real network
frontend/
  lib/
    genlayer.ts            # client + network setup — see below
    useWallet.ts            # wallet connection hook
    activityLog.ts           # local tx history (localStorage)
    wasitFactory.ts           # Factory read/write functions
    wasitEscrow.ts             # Escrow read/write functions
  components/, app/            # UI
package.json, pyproject.toml, gltest.config.yaml, genlayer.config.json
```

## MetaMask / RPC — what's actually proven vs. what's just built

Your confluence repo has **two parallel wallet implementations**, and
only one of them is actually wired into any page or component:

- `lib/genlayer.ts` + `lib/useWallet.ts` + `lib/contract.ts` (flat
  files) — imported by every page and component in that app. This is
  the one that's actually run against real MetaMask, so it's what
  WASIT's `frontend/lib/genlayer.ts` and `frontend/lib/useWallet.ts`
  are modeled on directly.
- `lib/genlayer/` + `lib/wallet/` (subfolders, EIP-6963 multi-wallet
  discovery, a `WalletProvider` context) — well-built, well-commented,
  but not imported by anything. Worth revisiting as a real upgrade
  later (multi-wallet support is a genuine gap the flat version
  doesn't cover), but it isn't proven the way the flat version is.

Concrete things carried over from the proven version, all with a
reason attached in the code comments:

- `ensureCorrectNetwork()` tries `client.connect(network)` first (the
  officially documented path), and only falls back to manual
  `wallet_switchEthereumChain` / `wallet_addEthereumChain` if that
  throws — which it does on any wallet without MetaMask Snaps enabled
  (`wallet_getSnaps` has no handler).
- The **wallet/sender** address gets lowercased before hitting the
  RPC; the **deployed contract** address (`FACTORY_ADDRESS`) does
  *not* — lowercasing it made every read fail with "Contract not
  found" against a contract confirmed live on the Explorer. These are
  opposite rules for two things that look similar; don't merge them.
- Writes wait for `TransactionStatus.ACCEPTED`, not `FINALIZED` —
  waiting for FINALIZED made writes look hung even after they'd
  already gone through.
- Both reads and writes retry on Studionet's observed rate-limiting /
  dropped-request behavior (`eth_gasPrice`, `eth_estimateGas`,
  "Failed to fetch").

## Setup

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. You'll see a "factory address not set" state
until you deploy the contract and fill in `.env.local`.

## Deploy order

1. Deploy `contracts/wasit_escrow.py` **standalone** first, in GenLayer
   Studio, and manually test its full flow (fund -> submit -> dispute
   -> revise -> arbiter rule -> appeal). This isolates "does the
   escrow logic work" from "does the factory deploy it correctly."
2. Deploy `contracts/wasit_factory.py`. Copy its address into
   `NEXT_PUBLIC_FACTORY_ADDRESS` in `frontend/.env.local`.
3. Call `create_escrow()` through the `/create` page (or directly in
   Studio) and confirm a new `WasitEscrow` actually deploys and is
   readable at `get_escrow(id)`.

## Things verified vs. things you still need to confirm

**Verified against the real installed `genlayer-js@1.1.8` package**
(read directly from its compiled source and `.d.ts` files) **and
against your own confluence project's proven, live wallet code** —
not from search results or a tutorial:
- `createClient({ chain, account, provider })` config shape
- `client.readContract` / `client.writeContract` / `client.deployContract`
  / `client.waitForTransactionReceipt` exact argument shapes
- `writeContract` requires `value: bigint` on every call
- Chains are `localnet` / `studionet` / `testnetAsimov` / `testnetBradbury`
- The `client.connect()` -> manual EIP-3326/3085 fallback pattern in
  `ensureCorrectNetwork()` — resolves what was previously an open
  question here about whether a MetaMask companion snap is required;
  it isn't, this fallback covers wallets without it
- Lowercase the wallet address, never the deployed contract address —
  opposite rules, both confirmed the hard way in your own repo's code
  comments (see `frontend/lib/genlayer.ts`)
- `TransactionStatus.ACCEPTED` is the right thing to wait for, not
  `FINALIZED`

**Still genuinely unverified:**
1. Which field on the transaction receipt holds a freshly deployed
   contract's address after `createEscrow()`. `app/create/page.tsx`
   calls `extractDeployedAddress()` in `lib/wasitFactory.ts`, which
   guesses `to_address` / `recipient` / `data.contract_address` in
   that order and throws with the full receipt logged to console if
   none of those are populated — check the console on your first real
   deploy and fix that one function if needed.
2. Everything already flagged in `contracts/wasit_escrow.py` and
   `wasit_factory.py`'s own header comments (cross-contract call
   semantics for the appeal system's factory callback, ERC20 method
   names against a real token).

This frontend compiles and type-checks cleanly against the real SDK
(`npx tsc --noEmit` and `npx next build` both pass in this repo as
delivered) — that proves the code is well-formed, not that every
runtime assumption above is correct. Those two are different claims;
don't collapse them into one.
