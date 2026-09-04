export type ActivityEntry = {
  hash: string;
  functionName: string;
  args: unknown[];
  status: "pending" | "finalized" | "pending-long";
  timestamp: number;
};

const STORAGE_KEY = "wasit:activity-log";
const MAX_ENTRIES = 200;

function readLog(): ActivityEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ActivityEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLog(entries: ActivityEntry[]) {
  if (typeof window === "undefined") return;
  const serializable = entries.slice(0, MAX_ENTRIES);
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(serializable, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
  window.dispatchEvent(new Event("wasit:activity-updated"));
}

export function logActivity(entry: ActivityEntry) {
  const entries = readLog();
  const withoutDup = entries.filter((e) => e.hash !== entry.hash);
  writeLog([entry, ...withoutDup]);
}

export function getActivityLog(): ActivityEntry[] {
  return readLog();
}

export function explorerTxUrl(hash: string): string {
  const base =
    (process.env.NEXT_PUBLIC_EXPLORER_URL as string) ?? "https://explorer-studio.genlayer.com";
  return `${base}/tx/${hash}`;
}
