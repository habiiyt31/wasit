"use client";

/**
 * Multi-wallet discovery via EIP-6963.
 *
 * The previous version reached straight for `window.ethereum`, which is
 * whichever extension won the race to inject itself. With two wallets
 * installed that is effectively random, and there was no way to pick the
 * other one. EIP-6963 replaces that single global with an announcement
 * protocol: the page asks, every installed wallet answers with its own
 * provider object and metadata, and the person chooses.
 *
 * `window.ethereum` is still kept as a last-resort fallback for older
 * wallets that never implement the announcement.
 */

export type WalletInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

export type DiscoveredWallet = {
  info: WalletInfo;
  provider: any;
};

const STORAGE_KEY = "wasit:wallet-rdns";

const discovered = new Map<string, DiscoveredWallet>();
const listeners = new Set<() => void>();
let selectedRdns: string | null = null;
let started = false;

/**
 * useSyncExternalStore compares snapshots by identity, so getSnapshot has
 * to return the SAME array until the store actually changes. Building a
 * fresh array on every call makes React think the store changed on every
 * render, which it answers with "Maximum update depth exceeded". The
 * snapshot is therefore rebuilt only inside emit().
 */
const EMPTY: DiscoveredWallet[] = [];
let snapshot: DiscoveredWallet[] = EMPTY;

function rebuildSnapshot() {
  const found = Array.from(discovered.values());
  if (found.length > 0) {
    snapshot = found;
    return;
  }
  // Fallback for wallets that never announce themselves under EIP-6963.
  if (typeof window !== "undefined" && window.ethereum) {
    snapshot = [
      {
        info: {
          uuid: "injected",
          name: "Browser wallet",
          icon: "",
          rdns: "injected",
        },
        provider: window.ethereum,
      },
    ];
    return;
  }
  snapshot = EMPTY;
}

function emit() {
  rebuildSnapshot();
  listeners.forEach((fn) => fn());
}

/** Idempotent: safe to call from every component that mounts. */
export function startDiscovery() {
  if (started || typeof window === "undefined") return;
  started = true;

  selectedRdns = window.localStorage.getItem(STORAGE_KEY);

  window.addEventListener("eip6963:announceProvider", (event: any) => {
    const detail = event?.detail;
    if (!detail?.info?.rdns || !detail?.provider) return;
    // Keyed by rdns, not uuid: a wallet that re-announces (on a reload,
    // or after being unlocked) issues a fresh uuid each time, which
    // would otherwise show the same wallet twice in the picker.
    discovered.set(detail.info.rdns, detail);
    emit();
  });

  window.dispatchEvent(new Event("eip6963:requestProvider"));

  // Seeds the injected fallback, and notifies anything already subscribed.
  emit();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Stable snapshot for useSyncExternalStore. Never builds a new array. */
export function listWallets(): DiscoveredWallet[] {
  return snapshot;
}

/** Server render has no wallets, and this must also be identity-stable. */
export function emptyWallets(): DiscoveredWallet[] {
  return EMPTY;
}

export function selectWallet(rdns: string) {
  selectedRdns = rdns;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, rdns);
  }
  emit();
}

export function clearSelection() {
  selectedRdns = null;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  emit();
}

export function getSelectedWallet(): DiscoveredWallet | null {
  if (selectedRdns) {
    const exact = discovered.get(selectedRdns);
    if (exact) return exact;
    if (selectedRdns === "injected" && typeof window !== "undefined" && window.ethereum) {
      return snapshot[0] ?? null;
    }
  }
  return null;
}

/**
 * The provider every signing path should use. Falls back to
 * `window.ethereum` so a wallet that never announced itself still works
 * once the person has connected it.
 */
export function getSelectedProvider(): any {
  const wallet = getSelectedWallet();
  if (wallet) return wallet.provider;
  if (typeof window !== "undefined" && window.ethereum) return window.ethereum;
  throw new Error("No wallet connected. Choose a wallet to continue.");
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

/**
 * Turns a raw EIP-1193 provider error into a message a person can act on.
 * Wallets throw plain {code, message} objects, and `err.message` alone is
 * either missing or something like "Internal JSON-RPC error." that gives
 * no next step. The codes below are the ones actually seen coming out of
 * `eth_requestAccounts` / `wallet_switchEthereumChain` across MetaMask,
 * Rabby, OKX Wallet, and Coinbase Wallet.
 */
export function describeWalletError(err: unknown): string {
  const code = (err as any)?.code ?? (err as any)?.cause?.code;
  const raw = String(
    (err as any)?.message ?? (err as any)?.cause?.message ?? (err ?? "")
  );

  if (code === 4001 || /user rejected/i.test(raw)) {
    return "Connection request rejected in the wallet.";
  }
  if (code === -32002 || /already processing|request of type.*already pending/i.test(raw)) {
    return "This wallet already has a connection request open. Open the wallet extension, approve or dismiss it, then try again.";
  }
  if (code === 4100) {
    return "This site isn't authorized by the wallet yet. Approve the connection there and try again.";
  }
  if (code === 4900 || code === 4901) {
    return "The wallet reports itself as disconnected. Unlock it and try again.";
  }
  if (raw) return raw;
  return "Could not connect to that wallet.";
}
