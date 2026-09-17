"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  startDiscovery,
  subscribe,
  listWallets,
  emptyWallets,
  selectWallet,
  clearSelection,
  getSelectedProvider,
  getSelectedWallet,
  describeWalletError,
  type DiscoveredWallet,
} from "./wallets";

const DISCONNECTED_KEY = "wasit:wallet-disconnected";
const ADDRESS_KEY = "wasit:wallet-address";

export function useWallet() {
  // ALWAYS start as null on first render — both server and client must
  // agree on the initial value or React throws a hydration mismatch.
  // The localStorage restore happens in a useEffect (client-only).
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listenerAttached = useRef(false);

  const wallets = useSyncExternalStore<DiscoveredWallet[]>(
    subscribe,
    listWallets,
    emptyWallets
  );

  useEffect(() => {
    startDiscovery();
  }, []);

  // Restore address from localStorage on mount (client-only, after hydration).
  useEffect(() => {
    if (window.localStorage.getItem(DISCONNECTED_KEY) === "1") return;
    const saved = window.localStorage.getItem(ADDRESS_KEY);
    if (saved) setAddress(saved as `0x${string}`);
  }, []);

  // Attach accountsChanged listener once a wallet is discovered.
  useEffect(() => {
    if (window.localStorage.getItem(DISCONNECTED_KEY) === "1") return;
    const wallet = getSelectedWallet();
    if (!wallet || listenerAttached.current) return;
    listenerAttached.current = true;

    // Verify account is still accessible (wallet may have been locked).
    wallet.provider
      .request({ method: "eth_accounts" })
      .then((accounts: string[]) => {
        const acc = (accounts?.[0] as `0x${string}`) ?? null;
        setAddress(acc);
        if (acc) window.localStorage.setItem(ADDRESS_KEY, acc);
        else window.localStorage.removeItem(ADDRESS_KEY);
      })
      .catch(() => {
        // The remembered wallet didn't answer at all -- most likely it
        // was removed, disabled, or is otherwise no longer reachable.
        // Silently keeping the old address around left the UI showing a
        // "connected" wallet that could no longer actually sign anything,
        // which is one of the ways this used to surface as "the wallet
        // errors out" later, on a write, instead of here where the real
        // cause is visible.
        setAddress(null);
        window.localStorage.removeItem(ADDRESS_KEY);
      });

    const onAccountsChanged = (accounts: string[]) => {
      const acc = (accounts?.[0] as `0x${string}`) ?? null;
      setAddress(acc);
      if (acc) {
        window.localStorage.setItem(ADDRESS_KEY, acc);
      } else {
        window.localStorage.removeItem(ADDRESS_KEY);
        window.localStorage.setItem(DISCONNECTED_KEY, "1");
        clearSelection();
      }
    };
    wallet.provider.on?.("accountsChanged", onAccountsChanged);
    return () => {
      wallet.provider.removeListener?.("accountsChanged", onAccountsChanged);
      listenerAttached.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets.length]);

  // Synchronous re-entrancy guard: the `connecting` *state* is what
  // disables the button, but a second call can still land before React
  // commits that disabled state (e.g. a fast double-click, or a second
  // wallet's button firing while the first is still awaiting the
  // extension's popup). A ref is checked and set synchronously, so it
  // catches that window too.
  const connectingRef = useRef(false);

  const connect = useCallback(async (rdns: string) => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setConnecting(true);
    setError(null);
    try {
      selectWallet(rdns);
      const provider = getSelectedProvider();
      const accounts: string[] = await provider.request({ method: "eth_requestAccounts" });
      const acc = (accounts?.[0] as `0x${string}`) ?? null;
      window.localStorage.removeItem(DISCONNECTED_KEY);
      if (acc) window.localStorage.setItem(ADDRESS_KEY, acc);
      setAddress(acc);
      listenerAttached.current = false;
    } catch (err: any) {
      setError(describeWalletError(err));
      // Only drop the wallet selection when it looks genuinely unusable.
      // For a plain rejection (4001) or an already-open request (-32002)
      // the wallet itself is fine -- clearing the selection here just
      // forces the person to reopen the sheet and pick it again before
      // they can retry, for no benefit.
      const code = err?.code;
      if (code !== 4001 && code !== -32002) {
        clearSelection();
      }
    } finally {
      connectingRef.current = false;
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    window.localStorage.setItem(DISCONNECTED_KEY, "1");
    window.localStorage.removeItem(ADDRESS_KEY);
    clearSelection();
    setAddress(null);
    setError(null);
    listenerAttached.current = false;
  }, []);

  return { address, connecting, error, wallets, connect, disconnect };
}
