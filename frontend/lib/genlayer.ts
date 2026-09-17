import { createClient } from "genlayer-js";
import { localnet, studionet, studioDevnet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { defineChain } from "viem";
import { getSelectedProvider, describeWalletError } from "./wallets";

/**
 * This file is deliberately modeled on lib/genlayer.ts from your own
 * confluence project -- specifically the FLAT version, not the one
 * under lib/genlayer/ + lib/wallet/ in that same repo. Both exist in
 * that codebase, but only the flat one (lib/genlayer.ts, lib/contract.ts,
 * lib/useWallet.ts) is actually imported by any page or component --
 * the more elaborate EIP-6963 multi-wallet version was built but never
 * wired in. Worth knowing if you go back to that repo for anything
 * else: don't assume the fancier-looking file is the live one without
 * checking, the way I almost did here.
 */

/**
 * "Studio Next" -- the Consensus v0.6 / Studio v0.123 release-candidate
 * deployment required for the Agent Tank hackathon. Same chain ID
 * (61997) and consensus contracts as genlayer-js's own `studioDevnet`
 * export, built on top of it rather than from scratch per the v0.6
 * migration guide's warning ("chain identity and consensus contract
 * addresses must move together") -- only the RPC transport and
 * explorer are overridden, to the exact URLs the hackathon
 * organizers gave (studio-next.genlayer.com / explorer-studio-dev),
 * which differ from the studio-dev.genlayer.com default baked into
 * this SDK build.
 */
const studioNext = defineChain({
  ...studioDevnet,
  name: "GenLayer Studio Next",
  rpcUrls: {
    default: { http: ["https://studio-next.genlayer.com/api"] },
  },
  blockExplorers: {
    default: { name: "GenLayer Explorer", url: "https://explorer-studio-dev.genlayer.com/" },
  },
});

const NETWORK = process.env.NEXT_PUBLIC_GENLAYER_NETWORK ?? "studioNext";

// No explicit return type on purpose -- genlayer-js/chains doesn't
// export a public chain type to annotate this with, and past attempts
// to guess at the internal type name broke the build when the SDK's
// internal layout shifted. Letting TypeScript infer it here is more
// resilient to that.
export function resolveChain() {
  switch (NETWORK) {
    case "studioNext":
      return studioNext;
    case "studionet":
      return studionet;
    case "localnet":
      return localnet;
    case "testnetAsimov":
      return testnetAsimov;
    case "testnetBradbury":
      return testnetBradbury;
    default:
      throw new Error(
        `Unknown NEXT_PUBLIC_GENLAYER_NETWORK "${NETWORK}". Use "studioNext", "studionet", ` +
          `"localnet", "testnetAsimov", or "testnetBradbury".`
      );
  }
}

// Deliberately NOT lowercased, and NOT typed as a template-literal
// `0x${string}` -- passed through exactly as printed by `genlayer
// deploy` / a contract deploy transaction's receipt. Confluence's own
// lib/genlayer.ts documents why: lowercasing a CONTRACT address made
// every read fail with "Contract <address> not found" against a
// contract confirmed live on the Explorer, because the node looks up
// deployed contract state by the exact address string in whatever
// casing it had at deploy time. This is the opposite rule from the
// wallet/sender address below -- don't merge the two.
export const WASIT_ADDRESS = (process.env.NEXT_PUBLIC_WASIT_ADDRESS ?? "") as any;

/** True once a contract address is configured, so pages can show a
 *  setup message instead of failing every read with a confusing RPC
 *  error. */
export function hasContractAddress(): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(String(WASIT_ADDRESS).trim());
}

/** Explorer link for a transaction, used in the "still waiting" message. */
export function explorerTxUrl(hash: string): string {
  const base =
    (process.env.NEXT_PUBLIC_EXPLORER_URL as string) ??
    "https://explorer-studio-dev.genlayer.com";
  return `${base}/tx/${hash}`;
}

export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

/** Read-only client. No wallet needed. */
export function getReadClient() {
  return createClient({ chain: resolveChain() });
}

/**
 * Normalizes a WALLET-supplied address before it's ever sent to the
 * RPC. Different wallets return eth_accounts/eth_requestAccounts
 * results in different casing, and GenLayer's RPC has been observed
 * rejecting some of those variants with "Invalid params: Incorrect
 * address format." Lowercase hex is universally accepted. This is
 * specific to the sender/wallet address -- see WASIT_ADDRESS above
 * for why a deployed contract address must NOT get the same treatment.
 */
export function normalizeAddress(address: string): `0x${string}` {
  const trimmed = (address ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error(`Wallet returned an invalid address: "${address}"`);
  }
  return trimmed.toLowerCase() as `0x${string}`;
}

/** Write client bound to the connected wallet address. */
function getWriteClient(walletAddress: string) {
  return createClient({
    chain: resolveChain(),
    account: normalizeAddress(walletAddress),
    provider: getSelectedProvider(),
  });
}

/**
 * Ensures the connected wallet is on the configured GenLayer network.
 *
 * Per GenLayer's own docs for the browser-wallet flow,
 * `client.connect(network)` is the officially documented way to do
 * this, so it's tried first. As a fallback -- because that call
 * depends on a MetaMask-only Snaps RPC method (wallet_getSnaps) that
 * other EIP-1193 wallets like Rabby, OKX Wallet, or Coinbase Wallet
 * don't implement, and plenty of regular MetaMask installs don't have
 * Snaps enabled either -- this falls back to the plain EIP-3085/3326
 * switch/add-chain calls, which every injected wallet supports.
 */
export async function ensureCorrectNetwork(walletAddress: string) {
  const client = getWriteClient(walletAddress);
  const chain = resolveChain();

  try {
    await client.connect(NETWORK as any);
    return client;
  } catch {
    // Fall through to the manual flow below.
  }

  const provider = getSelectedProvider();
  const expectedChainIdHex = `0x${chain.id.toString(16)}`;

  try {
    const currentChainId: string = await provider.request({ method: "eth_chainId" });

    if (currentChainId !== expectedChainIdHex) {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: expectedChainIdHex }],
        });
      } catch (switchErr: any) {
        // 4902 = chain not added to the wallet yet -- add then retry switch.
        if (switchErr?.code === 4902) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: expectedChainIdHex,
                chainName: chain.name,
                rpcUrls: chain.rpcUrls.default.http,
                nativeCurrency: chain.nativeCurrency,
                blockExplorerUrls: chain.blockExplorers?.default?.url
                  ? [chain.blockExplorers.default.url]
                  : undefined,
              },
            ],
          });
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: expectedChainIdHex }],
          });
        } else {
          throw switchErr;
        }
      }
    }
  } catch (err: any) {
    throw new Error(
      `Please switch your wallet to ${chain.name} (chain ID ${chain.id}) and try again. (${describeWalletError(
        err
      )})`
    );
  }

  return client;
}
