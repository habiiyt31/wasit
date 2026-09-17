import { parseEther, formatEther } from "viem";

// GEN is an 18-decimal native token, same as ETH -- this is the same
// convention genlayer-js and genlayer-cli themselves use for "Ngen"
// amounts (parseEther under the hood). Every amount that actually
// goes on-chain is still wei (a u256), these two functions are purely
// for the human-facing edges: parse what a person typed in GEN into
// wei right before a contract call, and format a wei value read back
// from a contract into GEN right before displaying it. Nothing in
// between -- state, contract calls, math -- ever touches GEN units.

/**
 * Parses a GEN amount a person typed (e.g. "1.5", "0.3") into wei.
 * Throws with a human-readable message on empty or malformed input,
 * rather than silently producing 0n or a wrong bigint.
 */
export function genToWei(gen: string): bigint {
  // Normalize: trim whitespace, replace comma decimal separator with dot
  // (common on keyboards with locale set to non-English), strip any
  // stray whitespace between digits that a copy-paste might introduce.
  const trimmed = gen.trim().replace(/,/g, ".").replace(/\s/g, "");
  if (!trimmed) throw new Error("Enter an amount in GEN.");
  // Reject values with more than one decimal point after normalization.
  if ((trimmed.match(/\./g) ?? []).length > 1) {
    throw new Error(`"${gen}" isn't a valid GEN amount (try something like "1.5").`);
  }
  try {
    return parseEther(trimmed);
  } catch {
    throw new Error(`"${gen}" isn't a valid GEN amount (try something like "1.5").`);
  }
}

/**
 * Formats a wei amount (as read from a contract) as a GEN string for
 * display, trimming trailing zeros so "1.000000000000000000" reads
 * as "1" and "0.500000000000000000" reads as "0.5".
 */
export function weiToGen(wei: bigint): string {
  const formatted = formatEther(wei);
  if (!formatted.includes(".")) return formatted;
  return formatted.replace(/0+$/, "").replace(/\.$/, "");
}
