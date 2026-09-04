import { createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";

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

const NETWORK = process.env.NEXT_PUBLIC_GENLAYER_NETWORK ?? "studionet";

// No explicit return type on purpose -- genlayer-js/chains doesn't
// export a public chain type to annotate this with, and past attempts
// to guess at the internal type name broke the build when the SDK's
// internal layout shifted. Letting TypeScript infer it here is more
// resilient to that.
export function resolveChain() {
  switch (NETWORK) {
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
        `Unknown NEXT_PUBLIC_GENLAYER_NETWORK "${NETWORK}". Use "studionet", "localnet", ` +
          `"testnetAsimov", or "testnetBradbury".`
      );
  }
}

// Deliberately NOT lowercased, and NOT typed as a template-literal
// `0x${string}` -- passed through exactly as printed by `genlayer
// deploy` / the factory's create_escrow() receipt. Confluence's own
// lib/genlayer.ts documents why: lowercasing a CONTRACT address made
// every read fail with "Contract <address> not found" against a
// contract confirmed live on the Explorer, because the node looks up
// deployed contract state by the exact address string in whatever
// casing it had at deploy time. This is the opposite rule from the
// wallet/sender address below -- don't merge the two.
export const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? "") as any;

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
 * specific to the sender/wallet address -- see FACTORY_ADDRESS above
 * for why a deployed contract address must NOT get the same treatment.
 */
function normalizeAddress(address: string): `0x${string}` {
  const trimmed = (address ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error(`Wallet returned an invalid address: "${address}"`);
  }
  return trimmed.toLowerCase() as `0x${string}`;
}

/** Write client bound to the connected wallet address. */
export function getWriteClient(walletAddress: string) {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No browser wallet found. Install MetaMask to continue.");
  }
  return createClient({
    chain: resolveChain(),
    account: normalizeAddress(walletAddress),
    provider: window.ethereum,
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

  const provider = window.ethereum;
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
      `Please switch your wallet to ${chain.name} (chain ID ${chain.id}) and try again. (${
        err?.message ?? err
      })`
    );
  }

  return client;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
