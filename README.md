# WASIT — Milestone Escrow for Agent-to-Agent Code Work

GenLayer positions itself as the adjudication layer for cases that need genuine judgment, not just a rule to check. WASIT applies that to subcontracting: one agent hires another to write code, and independent GenLayer validators fetch the real deliverable from its URL and judge it against the spec separately — no single manipulated read decides the outcome.

## The trust problem this solves

Putting an AI in charge of judging a deliverable creates a new failure mode: the submission can try to talk the judge into a pass. WASIT makes sure a single compromised read can't win alone — `submit_milestone()` fetches the code and runs the review independently across validators via `gl.eq_principle.prompt_comparative`. And a first-instance ruling isn't final: either side can escalate to a higher-bonded senior arbiter before funds move.

## Two contracts

- **`WasitFactory`** — deployed once. Registry of every escrow it created, plus arbiter staking/reputation.
- **`WasitEscrow`** — deployed fresh per deal by `WasitFactory.create_escrow()`. Deploy standalone once, manually, purely to test its logic before trusting the factory's deploy path.

## How one escrow works

```
OPEN --(add_milestone x N, lock_milestones, fund)--> FUNDED
                                                         |
                                          submit_milestone()
                                    ------------------------------------
                                    |                                  |
                                APPROVED                            DISPUTED
                       (funds release now)                             |
                                                          revision_count < max_revisions?
                                                              yes              no
                                                          resubmit    milestone_arbiter_rule()
                                                                             |
                                                                   pending_finalization
                                                                (funds STILL not moved)
                                                    ---------------------------------------
                                                    |                    |                |
                                          appeal_ruling()      window passes      milestone_buyer_approve()
                                        (either party, bonded)  unchallenged        (buyer override)
                                                    |                    |
                                                appealed        finalize_ruling()
                                                    |            (anyone can call)
                                        senior_arbiter_rule()
                                        (final, no further appeal)
```

Two independent safety valves:
- **`buyer_reclaim_abandoned()`** — milestone `pending` past `abandonment_timeout_days` since funding, seller never submitted → buyer reclaims directly, no fee taken.
- **`milestone_force_release()`** — milestone stuck `disputed` because the arbiter goes silent after revisions exhausted → seller force-releases after `max_claim_attempts` logged attempts.

## Two-tier appeals

`milestone_arbiter_rule()` does **not** move funds. It opens an `appeal_window_days` window during which either party can call `appeal_ruling()`, posting a bond (`APPEAL_BOND_BPS`, 5%) to escalate to a **senior arbiter** (staked `SENIOR_BOND_MULTIPLIER`, 5x, the factory's minimum). That ruling is final:
- **Reverses** the original verdict → appellant's bond refunded.
- **Upholds** it → bond forfeited to `fee_recipient`.

If nobody appeals, anyone can call `finalize_ruling()` to execute the original verdict. This exists because the track this was built for is named "Disputes, **appeals**, and rule enforcement" — a single final arbiter only covers two of those three words.

## Arbiter staking is bonding + reputation, not slashing

`WasitFactory` tracks stake (`get_arbiter_stake`) and ruling count (`get_arbiter_ruling_count`), gating eligibility (`is_arbiter_eligible`, `is_senior_arbiter`). No mechanism here slashes a bond for a "bad" ruling — that needs a meta-dispute process this version doesn't attempt. Stated plainly rather than overclaimed.

## Why this exists next to Internet Court

GenLayer's own [Internet Court](https://internetcourt.org) (launched July 10 2026, 27 founding members including OKX and MetaMask) is a generic, cross-vertical dispute-resolution standard — a protocol other systems plug into, deliberately not specifying how any one vertical should be judged. WASIT is one concrete, opinionated implementation of the "payment and escrow" + "disputes" layers for one vertical: agent-to-agent code subcontracting, judged as real fetched code, not generic prose.

**Track: Onchain Justice.** Matches "Agentic marketplace disputes. Escrow released when a deliverable meets machine-readable terms."

## Contract parameters

| Constant / arg | Value | Why |
|---|---|---|
| `project_title` | >= 10 chars | enough to identify what's being built |
| `project_description` | >= 40 chars | gives the judge prompt real context |
| `fee_bps` | <= 1000 (10%) | capped protocol cut |
| `max_revisions` | <= 5 | bounds the resubmit loop |
| `max_claim_attempts` | >= 3 | seller's safety valve if arbiter goes silent |
| `abandonment_timeout_days` | per escrow | buyer's safety valve if seller goes silent |
| `appeal_window_days` | per escrow | time to escalate a first-instance ruling |
| `APPEAL_BOND_BPS` | 500 (5%) | discourages frivolous appeals |
| `SENIOR_BOND_MULTIPLIER` | 5x | senior arbiter's word is final, bar is higher |
| `MAX_MILESTONES` | 20 | keeps summation loops bounded |

## Is this actually usable by AI agents, or just a web form for humans?

Both — but they're genuinely separate paths. `frontend/` is the
human-at-a-browser path (MetaMask). `agents/` is the answer to
whether an autonomous agent can do this with no human and no browser
involved at all: two standalone scripts, each with its own private
key, signing directly via `createAccount()` (confirmed a real local
signer against genlayer-js's own types, not a browser relay) and
completing a full escrow deal against each other. See `agents/README.md`
for what this does and doesn't prove.

## Project structure

```
wasit/
  contracts/
    wasit_escrow.py      # per-deal contract, deployed by the factory
    wasit_factory.py       # deployed once
  tests/
    direct/                 # pure Python, no network
    integration/              # full deploy + consensus
  agents/
    buyer-agent.ts / seller-agent.ts  # standalone AI-agent processes, no browser
    shared.ts                          # createAccount()-based client setup
  frontend/
    app/                        # page.tsx, create/, escrow/[address]/, arbiter/
    components/                   # Logo, ConnectButton, StatusBadge, MilestoneCard
    lib/
      genlayer.ts                   # chain resolution, clients, network switching
      wasitFactory.ts / wasitEscrow.ts  # typed read/write wrappers
      useWallet.ts                        # plain hook, no context provider
      activityLog.ts                        # localStorage tx tracking
    .env.example
  genlayer.config.json
  gltest.config.yaml
  pyproject.toml
  package.json
  README.md
```

## Networks

Studionet by default: RPC `https://studio.genlayer.com/api`, chain ID `61999`, explorer `explorer-studio.genlayer.com`, faucet built into Studio's account selector. `frontend/lib/genlayer.ts` also resolves `localnet`, `testnetAsimov`, `testnetBradbury` via `NEXT_PUBLIC_GENLAYER_NETWORK`.

Studionet resets periodically (a working address can come back "not found" later — redeploy) and its RPC occasionally drops requests under load ("Failed to fetch") — both handled with retry+backoff in `lib/wasitFactory.ts`/`lib/wasitEscrow.ts`, not bugs in this app.

## Setup — deploying and testing both contracts

**Only two manual deploys, total, ever.** After that, every real user
just connects a wallet on the web app and submits a form — the
Factory's `create_escrow()` calls `gl.deploy_contract()` for them
automatically. Nobody after you ever touches a CLI or fills in a raw
constructor.

**Deploy the Factory FIRST, not the Escrow.** This matters for a
concrete reason, not just tidiness: `milestone_arbiter_rule()` and
`senior_arbiter_rule()` both call back into the factory
(`record_arbiter_ruling`). If you deploy the escrow standalone with a
placeholder `factory_addr`, that callback breaks the moment your test
reaches an arbiter ruling — which is most of what's worth testing.
Deploying the Factory first means every later step uses its real
address, so the full flow (including arbiter rulings and appeals)
actually works end to end.

```bash
npm install -g genlayer
pip install genvm-linter genlayer-test
npm run network   # choose studionet, fund via the faucet
npm run lint       # lints BOTH contracts
```

**Step 1 — deploy `wasit_factory.py`.** One constructor argument:

| Arg | Example |
|---|---|
| `min_arbiter_bond` | `1000000000000000000` (1 GEN) |

```bash
genlayer deploy --contract contracts/wasit_factory.py
```

Note the printed address — call it `FACTORY` below. You'll also need
it in `frontend/.env.local` later (`NEXT_PUBLIC_FACTORY_ADDRESS`,
copied exactly as printed — see the address-casing section).

**Step 2 — deploy `wasit_escrow.py` standalone.** This is a one-time
TEST of the escrow's own logic in isolation from the factory's deploy
mechanism — never how a real deal gets created (that's step 4, below).
Use the real `FACTORY` address from Step 1, not a placeholder:

```bash
genlayer deploy --contract contracts/wasit_escrow.py
```

Fill in real constructor values (an empty/zero deploy correctly fails the contract's own asserts — see below, not a bug):

| Arg | Example |
|---|---|
| `buyer_addr` | your wallet address |
| `project_title` | `Rate limiter middleware` |
| `project_description` | `Implement a token bucket rate limiter for the public API gateway, handling burst traffic gracefully.` |
| `arbiter_addr` | a second address, can be your own for this first test |
| `factory_addr` | `FACTORY` from Step 1 — the real address, not `0x000...000` |
| `token_address` | `0x0000000000000000000000000000000000000000` (native GEN) |
| `fee_bps` | `250` |
| `fee_recipient_addr` | your wallet address |
| `max_revisions` | `3` |
| `max_claim_attempts` | `3` |
| `abandonment_timeout_days` | `14` |
| `appeal_window_days` | `3` |

**Step 3 — walk the full state machine manually**, in order: add 2 milestones + lock + fund -> submit a passing deliverable, confirm release -> submit a failing one, confirm `disputed`, confirm resubmit increments `revision_count` -> exhaust revisions, call `milestone_arbiter_rule`, confirm `pending_finalization` and funds NOT moved -> try `appeal_ruling` with an unstaked senior address, confirm rejection -> `finalize_ruling` after the window passes, confirm payout.

**Step 4 — point the frontend at the Factory:**

```bash
cd frontend && cp .env.example .env.local
# paste FACTORY into NEXT_PUBLIC_FACTORY_ADDRESS, exactly as printed
npm install && npm run dev
```

Then re-walk the same checklist from Step 3, but through the factory's `/create` page this time — this catches anything specific to `gl.deploy_contract()` that a standalone deploy can't.

## A worked failure (what a rejected deploy looks like)

Deploying with every argument empty/zero produces:

```
AssertionError: project_title must be at least 10 characters
```

This is correct behavior. The useful thing to check: **all 5 validators independently threw the identical error and voted Agree** — consensus working on a rejection, not just an acceptance. Same guarantee `submit_milestone()`'s judge relies on, visible here in its simplest form.

## Still genuinely unverified

1. Whether the escrow-to-factory `record_arbiter_ruling` cross-contract write call resolves synchronously in the same transaction, or is queued. Verified: the call syntax against sdk.genlayer.com. Not verified: execution/consensus semantics of a contract-to-contract write specifically.
2. ERC20 `balance_of`/`transfer` method names — confirmed against a doc example, not a real deployed token. Push-based funding was chosen specifically to avoid needing an unconfirmed `transfer_from`.
3. Which field on a `create_escrow()` receipt holds the new escrow's address — `extractDeployedAddress()` guesses a few field names and logs the full receipt to console if none match.

## The `wallet_getSnaps` fix

`ensureCorrectNetwork()` tries `client.connect(network)` first (the documented path), but that depends on MetaMask Snaps (`wallet_getSnaps`), which most plain MetaMask installs and every non-MetaMask wallet (OKX, Rabby) don't have a handler for. Fix: catch that failure, fall back to plain `eth_chainId` / `wallet_switchEthereumChain` (EIP-3326) / `wallet_addEthereumChain` (EIP-3085).

## Only lowercase the wallet address, never the contract address

The wallet/sender address is lowercased (`normalizeAddress` in `lib/genlayer.ts`) since wallets return inconsistent casing and Studio's RPC has rejected some checksummed variants. `FACTORY_ADDRESS` is left exactly as printed by `genlayer deploy` — lowercasing a contract address made reads fail with "Contract not found" against a contract confirmed live on the Explorer, since the node looks up state by the exact address string as deployed.

## Wait for ACCEPTED, not FINALIZED

Pending -> Proposing -> Committing -> Revealing -> Accepted -> Finalized. Consensus is already real at Accepted. Both wrapper files wait for `TransactionStatus.ACCEPTED` — waiting for Finalized made writes look hung even after they'd gone through.

## Time comes from the protocol, never the caller

Every write needing "today" derives it from `_current_day()`, reading `gl.message_raw["datetime"]` — never a plain argument (forgeable). Real trap: `gl.message` is a 5-field NamedTuple with **no** `datetime` field; `gl.message.datetime` raises `AttributeError` on a live deploy despite some docs implying it's valid.

## Testing

```bash
pip install pytest && npm run test:direct      # tests/direct/, no network
pip install genlayer-test && npm run test:integration  # gltest --network localnet/studionet
```

`npm run lint` before every deploy — run on both files, since `wasit_factory.py` embeds `wasit_escrow.py`'s full text as `WASIT_ESCROW_SOURCE`, so a change to one almost always means re-syncing the other.

Manual QA order: connect/disconnect wallet -> create escrow (spec, arbiter, milestones, fund) -> submit passing deliverable, confirm balance change -> submit failing one, confirm dispute+resubmit -> push to arbiter, appeal, confirm funds don't move until resolved -> let a window close unchallenged, confirm `finalize_ruling` pays out -> abandonment reclaim before/after timeout.

## Keeping the factory's embedded source in sync

`wasit_factory.py`'s `WASIT_ESCROW_SOURCE` is a literal copy of `wasit_escrow.py` wrapped in `'''...'''` (`gl.deploy_contract()` takes source as text, not a file reference). Whenever `wasit_escrow.py` changes, regenerate that block — never hand-edit the copy — and confirm `wasit_escrow.py` has no `'''` sequences of its own (would break the wrapper; use `"""` docstrings there instead).

## Full function tutorial — every method, one real worked scenario

Everything below uses ONE consistent scenario end to end. Fake but
properly-formatted addresses, real GEN amounts. Every public function
in both contracts appears at least once, in the order you'd actually
call them, with the exact args and the result you should see if it
succeeds.

**Cast:**
| Role | Address |
|---|---|
| Buyer | `0x1111111111111111111111111111111111aAaA` |
| Seller | `0x2222222222222222222222222222222222bBbB` |
| Regular arbiter | `0x3333333333333333333333333333333333cCcC` |
| Senior arbiter | `0x4444444444444444444444444444444444dDdD` |
| Fee recipient | `0x5555555555555555555555555555555555eEeE` |

### 1. Deploy the factory

```
genlayer deploy --contract contracts/wasit_factory.py
  min_arbiter_bond = 1000000000000000000        # 1 GEN
```
→ prints a factory address. Call it `FACTORY` below.

### 2. Arbiters stake

```
FACTORY.stake_as_arbiter()  from 0x3333...cCcC, value = 1000000000000000000   # exactly the minimum
```
**Result:** succeeds. `get_arbiter_stake("0x3333...cCcC")` → `1000000000000000000`.
`is_arbiter_eligible("0x3333...cCcC")` → `true`. `is_senior_arbiter("0x3333...cCcC")` → `false` (needs 5x).

```
FACTORY.stake_as_arbiter()  from 0x4444...dDdD, value = 5000000000000000000   # 5 GEN
```
**Result:** `is_senior_arbiter("0x4444...dDdD")` → `true`.

```
FACTORY.get_arbiter_count()          → 2
FACTORY.get_arbiter_by_index(0)      → "0x3333...cCcC"
FACTORY.get_arbiter_by_index(1)      → "0x4444...dDdD"
```

### 3. Buyer creates an escrow

```
FACTORY.create_escrow(
  project_title            = "Rate limiter middleware",
  project_description      = "Implement a token bucket rate limiter for the public API gateway, handling burst traffic gracefully.",
  arbiter_addr              = "0x3333333333333333333333333333333333cCcC",
  token_address              = "0x0000000000000000000000000000000000000000",   # native GEN
  fee_bps                     = 250,                                            # 2.5%
  fee_recipient_addr           = "0x5555555555555555555555555555555555eEeE",
  max_revisions                 = 3,
  max_claim_attempts             = 3,
  abandonment_timeout_days        = 14,
  appeal_window_days               = 3,
)  from 0x1111...aAaA
```
**Result:** `WasitEscrow` deployed. Call its address `ESCROW`.
`FACTORY.get_escrow_count()` → `1`. `FACTORY.get_escrow(0)` → `ESCROW`.
`FACTORY.get_buyer_of(0)` → `"0x1111...aAaA"`.

### 4. Buyer sets up milestones

```
ESCROW.add_milestone("Endpoint returns 429 after limit exceeded", 300000000000000000)   # 0.3 GEN
  → returns 0
ESCROW.add_milestone("Config is per-route, documented in README", 200000000000000000)   # 0.2 GEN
  → returns 1
ESCROW.lock_milestones()
```
**Result:** `get_milestone_count()` → `2`. `get_milestone(0).status` → `"pending"`.
`get_total_amount()` → `500000000000000000` (0.5 GEN).

### 5. Buyer funds

```
ESCROW.fund("0x2222222222222222222222222222222222bBbB")  from 0x1111...aAaA, value = 500000000000000000
```
**Result:** `get_state()` → `"FUNDED"`. `get_seller()` → `"0x2222...bBbB"`.

### 6. Milestone 0 — clean pass

```
ESCROW.submit_milestone(0, "https://gist.github.com/example/rate-limiter-v1")  from 0x2222...bBbB
```
**Result:** validators fetch the URL, judge APPROVED. `get_milestone(0).status` → `"released"`.
Seller's balance increases by `300000000000000000 * 9750/10000 = 292500000000000000`
(0.3 GEN minus 2.5% fee). Fee recipient gets `7500000000000000`.

### 7. Milestone 1 — dispute, revision, arbiter, appeal (the full path)

```
ESCROW.submit_milestone(1, "https://gist.github.com/example/config-v1-incomplete")  from 0x2222...bBbB
```
**Result:** judged DISPUTED (README section missing). `get_milestone(1).status` → `"disputed"`,
`revision_count` → `0`.

```
ESCROW.submit_milestone(1, "https://gist.github.com/example/config-v2")  from 0x2222...bBbB
```
Still disputed. `revision_count` → `1`. Repeat two more times (still failing spec) →
`revision_count` → `3`, hits `max_revisions`.

```
ESCROW.submit_milestone(1, "...")  from 0x2222...bBbB
```
**Result:** REVERTS — `"wasit: revision limit reached, this must go to the arbiter now"`.
This is the correct handoff point.

```
ESCROW.milestone_arbiter_rule(1, approve=False)  from 0x3333...cCcC
```
**Result:** `get_milestone(1).status` → `"pending_finalization"`. Funds have **not** moved.
`FACTORY.get_arbiter_ruling_count("0x3333...cCcC")` → `1`.

Seller disagrees with the reject and appeals:

```
ESCROW.appeal_ruling(1, "0x4444444444444444444444444444444444dDdD")
  from 0x2222...bBbB, value = 200000000000000000 * 500/10000 = 10000000000000000   # 5% of 0.2 GEN
```
**Result:** `get_milestone(1).status` → `"appealed"`, `appeal_arbiter` → `"0x4444...dDdD"`,
`appellant` → `"0x2222...bBbB"` (the seller).

```
ESCROW.senior_arbiter_rule(1, approve=True)  from 0x4444...dDdD
```
**Result:** reverses the original reject. `get_milestone(1).status` → `"released"`.
Seller gets `195000000000000000` (0.2 GEN minus fee). The 5% appeal bond
(`10000000000000000`) is refunded to the seller, since the senior
arbiter reversed the ruling. `FACTORY.get_arbiter_ruling_count("0x4444...dDdD")` → `1`.
`get_state()` → `"RESOLVED"` (both milestones now terminal).

### 8. Alternate paths (not part of the story above — separate scenarios)

**Buyer overrides a dispute directly, skipping the arbiter:**
```
ESCROW.milestone_buyer_approve(1)  from 0x1111...aAaA
```
Only valid while `status == "disputed"`. Releases immediately, appends
`"[MANUALLY APPROVED BY BUYER]"` to the verdict.

**Appeal window closes with nobody appealing:**
```
ESCROW.finalize_ruling(1)  from ANY address, after ruled_at_day + appeal_window_days has passed
```
Executes the arbiter's original verdict exactly as ruled.

**Seller rescues a stuck dispute if the arbiter goes silent:**
```
ESCROW.milestone_claim_attempt(1)  from 0x2222...bBbB   # call 3 times (max_claim_attempts)
ESCROW.milestone_force_release(1)  from 0x2222...bBbB   # after revisions exhausted AND 3 claim attempts logged
```
Releases to the seller as a timeout safety valve.

**Buyer rescues funds if the seller never submits anything:**
```
ESCROW.buyer_reclaim_abandoned(1)  from 0x1111...aAaA
  # only valid if milestone.status == "pending" AND
  # current_day > funded_at_day + abandonment_timeout_days
```
Full refund to buyer, no fee taken (no judging work happened).

**Arbiter withdraws their stake:**
```
FACTORY.withdraw_stake(1000000000000000000)  from 0x3333...cCcC
```
Sends the bond back to the arbiter's own wallet. No lockup check in
this version — see **Path forward** on why that's a known gap, not an
oversight.

## Design notes

- `@allow_storage` above `@dataclass` is mandatory for `Milestone` (stored in a `TreeMap`).
- `TreeMap[u256, Milestone]`, not a nested `DynArray` — GenVM storage doesn't support that.
- Push-based ERC20 funding, not `transferFrom` — see unverified item 2.
- `_EOA(...).emit_transfer(value=...)` for EOA payouts vs. `gl.get_contract_at(self.factory).emit()...` for the escrow-to-factory reputation callback — not interchangeable, wrong one fails silently at execution.
- One escrow per deal (deployed by the factory), not one shared contract holding many escrows — matches this codebase's `x402Escrow` pattern, keeps state fully independent per deal.
- Both reads and writes retry on transient RPC failure, with a deliberate pause after a write before refreshing reads.

## Deploying the frontend to Vercel

Root Directory = `frontend`. Env vars: `NEXT_PUBLIC_GENLAYER_NETWORK=studionet`, `NEXT_PUBLIC_FACTORY_ADDRESS=<your deployed factory address>`.

## Path forward

- Arbiter slashing — needs a meta-dispute process, not attempted here.
- Portable seller reputation — factory currently tracks arbiter reputation only.
- Multi-milestone parallelism — requiring several milestones to pass together, for work only meaningful as a whole.

## License

MIT
