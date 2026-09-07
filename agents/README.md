# WASIT agent demo — no browser, no human clicking anything

`frontend/` proves WASIT works for a human at a wallet. This folder
proves the thing the "Agentic marketplace disputes" track criterion
is actually asking for: two independent AI agents completing an
escrow deal against each other, with no browser, no MetaMask, and no
person in the loop clicking a button.

## Why this is a real test of that, not a simulation

`buyer-agent.ts` and `seller-agent.ts` are two separate scripts with
two separate private keys. Run them in two separate terminals (or two
separate machines) and neither one ever sees the other's key or
process memory — the only thing that connects them is the escrow
contract's address, printed by the buyer agent at the end, handed to
the seller agent the same way a real buyer would hand a real seller a
contract address: openly, because it isn't a secret.

Both scripts sign with `createAccount(privateKey)` from `genlayer-js`
directly — confirmed against the installed package's own type
declarations to be a real local signer (the same account shape used
under the hood by any wallet), not a browser-relayed signature. There
is no `window.ethereum` anywhere in this folder.

## Setup

```bash
cd agents
npm install
cp .env.example .env
```

Generate two fresh private keys (one per agent) and fund both via
Studio's faucet:

```bash
node --input-type=module -e "import {generatePrivateKey} from 'genlayer-js'; console.log(generatePrivateKey())"
```

Fill in `.env`:
- `WASIT_FACTORY_ADDRESS` — your deployed factory
- `BUYER_AGENT_PRIVATE_KEY` / `SELLER_AGENT_PRIVATE_KEY` — the two keys above
- `SELLER_AGENT_ADDRESS` — derive it from the seller's private key, or just run the seller agent once and read the address it prints
- `ARBITER_ADDRESS` — an address that has already called `stake_as_arbiter()` on the factory (see the main README's tutorial)

## Run it

**Terminal 1:**
```bash
npm run buyer
```
Creates an escrow, adds one milestone (0.3 GEN), locks it, funds it.
Prints the deployed escrow's address at the end.

**Terminal 2** (paste the address from Terminal 1):
```bash
npm run seller -- 0xTHE_ESCROW_ADDRESS
```
Submits a deliverable URL for milestone 0. This is the real judged
step — GenLayer validators fetch the URL and review it, the same
`gl.eq_principle.prompt_comparative` path a human buyer's deal would
go through. Prints the milestone's final status (`released` or
`disputed`).

Optionally pass your own URL:
```bash
npm run seller -- 0xTHE_ESCROW_ADDRESS https://gist.github.com/you/your-real-pr
```

## What this does and doesn't prove

**Proves:** the contract layer has no human-specific dependency —
anything that can hold a private key and call `writeContract` can be
a buyer, a seller, or an arbiter. That's true whether the caller is a
person's MetaMask or an autonomous agent's key management, because
the contract only ever sees an address and a signature, never a
"human" or "agent" flag.

**Doesn't prove:** that any *particular* AI agent framework (an LLM
with tool-calling, an autonomous loop, etc.) is wired up to call these
scripts on its own initiative. That's a thin wrapper on top of what's
here — give an agent framework tool-calling access to the four
functions in `shared.ts`/`buyer-agent.ts`/`seller-agent.ts` and it can
run this loop itself. That wrapper isn't built here; what's here is
proof the substrate underneath it doesn't get in the way.
