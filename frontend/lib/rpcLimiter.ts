/**
 * Shared pacing + retry for every call this app makes to GenLayer's RPC.
 *
 * Studio Next enforces roughly 30 requests per rolling minute per client.
 * Before this file existed, that limit was approximated ad hoc in a few
 * places -- a fixed 700/300/300ms sleep between each arbiter's reads in
 * lib/wasit.ts, a narrower retry regex in lib/txkit.ts's estimateWithRetry,
 * and nothing at all in the two spots that fire the biggest bursts: the
 * home page's loop over every escrow (up to 50 reads back to back) and
 * escrow/[id]'s refresh(), which Promise.all's three reads, one of which
 * itself loops over every milestone with no pacing of its own.
 *
 * Every read in lib/wasit.ts, and the fee-estimation read in lib/txkit.ts,
 * now go through scheduleRpcCall() / withRpcRetry() instead. It is a
 * single global FIFO queue: whatever is calling it, and from wherever, only
 * gets a slot once fewer than MAX_PER_WINDOW calls have gone out in the
 * trailing WINDOW_MS -- so the limit is enforced across the whole app
 * rather than per function, and callers pay no artificial delay at all
 * until they are actually near the cap. That's a change from the old fixed
 * sleeps, which added latency unconditionally even when nowhere near the
 * limit.
 *
 * This does not coordinate across browser tabs -- each tab gets its own
 * queue and its own budget, same as the code it replaces. If that turns
 * out to matter in practice, the fix is a BroadcastChannel or a
 * localStorage-based lock shared by tabs on the same origin.
 */

const WINDOW_MS = 60_000;
// Studio Next's observed cap is ~30/min; stay under it with a buffer for
// anything else sharing the connection (another tab, a retry in flight).
const MAX_PER_WINDOW = 25;

const dispatchTimes: number[] = [];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSlot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (dispatchTimes.length && now - dispatchTimes[0] > WINDOW_MS) {
      dispatchTimes.shift();
    }
    if (dispatchTimes.length < MAX_PER_WINDOW) {
      dispatchTimes.push(now);
      return;
    }
    const waitMs = WINDOW_MS - (now - dispatchTimes[0]) + 50;
    await sleep(Math.max(waitMs, 50));
  }
}

type QueueItem = {
  run: () => Promise<unknown>;
  resolve: (v: any) => void;
  reject: (e: any) => void;
};

const queue: QueueItem[] = [];
let pumping = false;

async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length) {
    const item = queue.shift()!;
    await acquireSlot();
    try {
      item.resolve(await item.run());
    } catch (err) {
      item.reject(err);
    }
  }
  pumping = false;
}

/**
 * Runs `fn` once it has a slot under the app-wide rate budget. Calls queue
 * up in the order they arrive and are dispatched one at a time -- simpler
 * than tracking concurrency, and every existing caller in this codebase
 * already assumed sequential reads (the old per-loop sleeps), so nothing
 * depended on parallel dispatch to begin with.
 *
 * Only pass quick, single-round-trip calls here (a read, a fee estimate).
 * A long-running call (submitting a transaction, polling it to
 * consensus) would hold the queue's one worker for its whole duration and
 * stall every other read behind it -- lib/txkit.ts's submit/track calls
 * deliberately stay outside this queue for that reason.
 */
export function scheduleRpcCall<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ run: fn, resolve, reject });
    pump();
  });
}

/**
 * Whether an error looks like a transient RPC/network hiccup worth
 * retrying, rather than a real failure (bad args, a revert, the user
 * rejecting a signature). The pattern list is the union of what two
 * independent GenLayer projects have actually observed failing this way
 * (see gencheck/gencheck/client.py's retry()): Studio's Cloudflare front
 * occasionally serves an HTML challenge page instead of JSON under load
 * ("invalid JSON", "DOCTYPE", Cloudflare error code "1010"), sockets time
 * out, fetches fail outright -- and, the gap this file closes, a plain 429
 * / "too many requests" / "rate limit" response, which the previous retry
 * helper in lib/wasit.ts did not recognize at all, so it surfaced straight
 * to the user as a hard error instead of being retried.
 */
export function isTransientRpcError(err: unknown): boolean {
  const message = String((err as any)?.message ?? err ?? "");
  return /invalid json|doctype|\b1010\b|timeout|timed out|failed to fetch|network|fetch failed|429|too many request|rate.?limit/i.test(
    message
  );
}

/** Whether the message specifically indicates rate limiting (as opposed to
 *  a generic network hiccup), so retries can back off harder -- there's no
 *  point retrying quickly into a limit that only clears on a rolling
 *  window. */
function isRateLimitError(err: unknown): boolean {
  const message = String((err as any)?.message ?? err ?? "");
  return /429|too many request|rate.?limit|\b1010\b/i.test(message);
}

/**
 * Schedules `fn` under the shared rate budget, and retries it on a
 * transient failure with backoff -- longer backoff specifically for a
 * rate-limit response.
 */
export async function withRpcRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; label?: string } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await scheduleRpcCall(fn);
    } catch (err) {
      lastErr = err;
      if (!isTransientRpcError(err) || attempt === maxAttempts) throw err;
      const base = isRateLimitError(err) ? 3000 : 900;
      await sleep(base * attempt);
    }
  }
  // Unreachable in practice -- the loop above always returns or throws --
  // but keeps this an expression of type T for every code path.
  throw lastErr instanceof Error
    ? lastErr
    : new Error(
        `Could not reach GenLayer${options.label ? ` (${options.label})` : ""} after several attempts.`
      );
}
