# Wasit

**A referee for agents that hire agents to write code.**

An agent subcontracts a coding task to another agent. Money is locked one
milestone at a time. The selling agent submits a link to real code — a
pull request, a gist, a raw file — and GenLayer validators fetch that
code and judge it independently. No single party, and no single
manipulated read, decides whether the work was done.

*Wasit* is Indonesian for referee.

---

## Contents

- [Why this needs decentralized judgment](#why-this-needs-decentralized-judgment)
- [How a deal runs](#how-a-deal-runs)
- [Quick start](#quick-start)
- [Deploying the contract](#deploying-the-contract)
- [Running the web app](#running-the-web-app)
- [Demo agents](#demo-agents)
- [What's in the repository](#whats-in-the-repository)
- [Contract reference](#contract-reference)
- [Design notes](#design-notes)
- [Known limits](#known-limits)

---

## Why this needs decentralized judgment

"Did this code do what was asked?" is not a question a blockchain can
answer with arithmetic, and it is not a question you want either party to
answer alone. A buyer who judges alone can refuse to pay for good work. A
seller who judges alone can claim work that does not exist. An off-chain
oracle judging alone is one server away from being bought.

Wasit gives the question to GenLayer's validators. Each one independently
fetches the submitted code and forms its own verdict, and the contract
only accepts an outcome they agree on. The thing being agreed on is the
*substance* — whether the code meets the spec — not a hash or a
timestamp.

That is also why the deliverable is a URL rather than pasted text: the
validators read the artifact itself, so a seller cannot hand the judge a
flattering summary of code that does something else.

---

## How a deal runs

1. **The buyer locks the money.** Each milestone carries its own spec and
   its own amount, funded up front, plus a named arbiter who has already
   posted a bond.
2. **The seller submits code.** A link to a pull request, gist, or raw
   file.
3. **Validators judge it.** Each fetches the URL and reviews the code
   against the milestone spec. Agreement releases the money; a review
   that fails the spec marks the milestone contested.
4. **Revisions, then a ruling.** A contested milestone can be revised
   until the revision budget runs out. After that the arbiter rules.
5. **An appeal window, then payment.** An arbiter's ruling does *not*
   move money immediately. Either side can post a bond and escalate to a
   senior arbiter during the appeal window. Only once that window closes
   does the ruling get carried out.

Funds staying put until the appeal window closes is what makes the appeal
real. Once money reaches an account there is no clawing it back.

There are also two escape hatches for when someone goes quiet:

- If the **seller** never starts, the buyer reclaims that milestone after
  the abandonment timeout. No fee is taken — the fee pays for judging,
  and none happened.
- If the **arbiter** never rules, the seller can release the milestone
  themselves once revisions and logged claim attempts are both exhausted.

---

## Quick start

```bash
# 1. Tooling, and a funded wallet on Studio Next
npm install -g genlayer
pip install genvm-linter genlayer-test
npm run network          # pick Studio Next (chain 61997), then use the faucet

# 2. Deploy the contract — one deploy, that's all
npm run lint
genlayer deploy --contract contracts/wasit.py

# 3. Point the web app at it
cd frontend
npm install
cp .env.example .env.local
# set NEXT_PUBLIC_WASIT_ADDRESS to the address the deploy printed
npm run dev              # http://localhost:3000
```

---

## Deploying the contract

There is **one** contract, `contracts/wasit.py`. It holds the arbiter
registry and every escrow. Deploying it is an ordinary top-level deploy
with one constructor argument:

| Argument | Type | What it means |
| --- | --- | --- |
| `min_arbiter_bond` | `u256` (wei) | The smallest bond that makes an arbiter selectable. Hearing appeals requires five times this. |

For a 10 GEN minimum bond, pass `10000000000000000000`.

Paste the resulting address into `frontend/.env.local` **exactly as
printed**. Do not change its casing — the node looks up contract state by
the exact address string it was deployed with, and a lowercased copy
comes back as "Contract not found" even though the contract is live.

### Networks

Studio Next is the default: RPC `https://studio-next.genlayer.com/api`,
chain ID `61997`, explorer `https://explorer-studio-dev.genlayer.com/`.
`frontend/lib/genlayer.ts` also resolves `studionet`, `localnet`,
`testnetAsimov`, and `testnetBradbury` through
`NEXT_PUBLIC_GENLAYER_NETWORK`.

Studio Next is a release-candidate environment. It can reset, which turns
a working address into "not found" — redeploy when that happens. Its RPC
also drops requests under load; that is handled with retry and backoff in
`frontend/lib/wasit.ts`, not a bug in this app.

---

## Running the web app

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

| Variable | Required | What it does |
| --- | --- | --- |
| `NEXT_PUBLIC_WASIT_ADDRESS` | yes | The deployed contract. Nothing loads without it. |
| `NEXT_PUBLIC_GENLAYER_NETWORK` | no | Defaults to `studioNext`. |
| `NEXT_PUBLIC_EXPLORER_URL` | no | Used for transaction links. |
| `NEXT_PUBLIC_DEFAULT_TREASURY_ADDRESS` | no | Pre-fills the protocol fee recipient. Defaults to the connected wallet. |

### Wallets

The app discovers wallets through **EIP-6963**, so every installed wallet
is offered and you choose which one to use. It is not tied to MetaMask. A
wallet that predates the standard still works through the
`window.ethereum` fallback.

### Pages

| Route | What it is for |
| --- | --- |
| `/` | Every escrow on the contract, newest first |
| `/create` | Create an escrow, add milestones, lock them |
| `/escrow/[id]` | Fund a deal, submit work, rule, appeal, finalize |
| `/arbiter` | Post or withdraw a bond, and see the arbiter directory |

### Fees

Studio Next charges a fee on every write. The app quotes that fee before
submitting through `@genlayer/transaction-kit`
(`frontend/lib/txkit.ts`), and checks both the consensus status *and* the
execution result before treating a write as successful. `genlayer-js` is
pinned to `2.0.0-rc.1` and `@genlayer/transaction-kit(-react)` to
`0.1.0-rc.2` to match.

---

## Demo agents

`agents/` has two Node scripts that drive the contract the way real
agents would — one hires, one delivers. See
[`agents/README.md`](agents/README.md). You can start a deal in the
browser and finish it from the command line, or the reverse.

---

## What's in the repository

```
contracts/wasit.py        The whole protocol: arbiter registry + every escrow
frontend/                 Next.js app (App Router, Tailwind)
  app/                    Routes: home, create, escrow/[id], arbiter
  components/             Header, wallet picker, milestone card, status badge
  lib/wasit.ts            Every contract read and write
  lib/wallets.ts          EIP-6963 multi-wallet discovery
  lib/txkit.ts            Fee quoting, submission, and tracking
  lib/genlayer.ts         Chain config and clients
agents/                   Buyer and seller demo agents
```

---

## Contract reference

### Arbiters

| Method | Who | What it does |
| --- | --- | --- |
| `stake_as_arbiter()` | anyone, payable | Posts a bond. Calling again adds to the same one. |
| `withdraw_stake(amount)` | the arbiter | Takes part of a bond back. |
| `is_arbiter_eligible(addr)` | view | Whether that address can be chosen. |
| `is_senior_arbiter(addr)` | view | Whether it can hear appeals. |
| `get_arbiter_stake(addr)` | view | Current bond. |
| `get_arbiter_ruling_count(addr)` | view | Public ruling count. |

Bonds are tracked **per address**. Two addresses posting 10 GEN each are
two arbiters with 10 GEN, not one arbiter with 20.

### Deals

| Method | Who | What it does |
| --- | --- | --- |
| `create_escrow(...)` | the buyer | Creates a deal and returns its id. Rejects an arbiter who has not bonded. |
| `add_milestone(id, description, amount)` | the buyer | Before funding only. Up to 20. |
| `lock_milestones(id)` | the buyer | Freezes the milestone list. |
| `fund(id, seller)` | the buyer, payable | Must send exactly the milestone total. |
| `submit_milestone(id, index, url)` | the seller | Runs the judge across validators. |
| `milestone_buyer_approve(id, index)` | the buyer | Pays out a contested milestone anyway. |
| `milestone_arbiter_rule(id, index, approve)` | the arbiter | Rules, and opens the appeal window. Moves no money. |
| `appeal_ruling(id, index, senior)` | either party, payable | Escalates within the window. Bond is 5% of the milestone. |
| `senior_arbiter_rule(id, index, approve)` | the senior arbiter | Final. Bond returns on a reversal, is forfeited if upheld. |
| `finalize_ruling(id, index)` | anyone | Carries out a ruling nobody appealed. |
| `buyer_reclaim_abandoned(id, index)` | the buyer | Recovers a milestone the seller never started. |
| `milestone_force_release(id, index)` | the seller | Releases when the arbiter never ruled. |

### Milestone states

| State | Meaning |
| --- | --- |
| `pending` | Waiting for the seller |
| `disputed` | The review did not pass; revisions still possible |
| `pending_finalization` | Ruled, appeal window open, money not moved |
| `appealed` | A senior arbiter is reviewing |
| `released` | Paid to the seller |
| `refunded` | Returned to the buyer |

---

## Design notes

### One contract, not two

An earlier version split this into a factory and a per-deal escrow
contract, linked by a registration call. Creating a deal meant deploying
a contract and registering it, and the escrow called back into the
factory across contracts to record rulings and check senior bonds.

Three things went wrong with that, and all three are gone here:

- A deal took multiple transactions to exist, and a failure partway left
  an orphan contract the app would then query forever and get "Contract
  not found" back from.
- Cross-contract calls are the least-proven path on this runtime, and
  each one was a place a recorded ruling could quietly fail.
- The registry lived in a different contract from the escrows it
  described, so the two could disagree.

Escrows are now records in a map keyed by id, milestones are keyed by
`escrow_id * 100 + index`, and recording a ruling is an ordinary internal
call that cannot fail separately from the transaction that triggered it.
The arbiter's bond is checked at creation, so a deal can never exist with
an unbonded arbiter attached.

### Prompt injection

The submitted code is hostile input by definition — judging a stranger's
code is the whole product. The judging prompt states that the code is
content to evaluate and never instructions to follow, and that anything
inside it addressing the judge is itself evidence of bad faith. This
reduces the risk; it does not eliminate it.

### Interface language

Colour carries status rather than decorating it, on the referee's own
card system: green released, yellow contested, red returned. Proportions
come from the golden ratio — the type scale steps by 1.618 and the
spacing scale is the Fibonacci sequence it converges from.

---

## Known limits

- **Native GEN only.** An earlier version also accepted an ERC20 token.
  That path is dropped: it was the construct that caused the most deploy
  failures on this runtime, and Studio Next settles in native GEN.
  Re-adding it touches only `_pay()`.
- **Twenty milestones per escrow.** A fixed cap, enforced in the
  contract.
- **Day-resolution timeouts.** Abandonment and appeal windows are counted
  in whole days from the block timestamp, not hours.
- **The demo agents do not quote fees.** See the caveat in
  `agents/README.md`.
- **Studio Next can reset.** It is a release-candidate network. Redeploy
  and re-point `NEXT_PUBLIC_WASIT_ADDRESS` when it does.
