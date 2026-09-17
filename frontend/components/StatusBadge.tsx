// Colour is the referee's card system, and it carries the meaning:
// green released, yellow still contested, red returned to the buyer.
const STYLES: Record<string, string> = {
  pending: "bg-stone text-muted",
  disputed: "bg-booking/25 text-[#8a6a00]",
  pending_finalization: "bg-booking/25 text-[#8a6a00]",
  appealed: "bg-sending/10 text-sending",
  released: "bg-turf/12 text-turf",
  refunded: "bg-sending/10 text-sending",
  OPEN: "bg-stone text-muted",
  FUNDED: "bg-booking/25 text-[#8a6a00]",
  RESOLVED: "bg-turf/12 text-turf",
};

const LABELS: Record<string, string> = {
  pending: "Awaiting work",
  disputed: "Contested",
  pending_finalization: "Ruled, appeal open",
  appealed: "Under appeal",
  released: "Paid out",
  refunded: "Returned to buyer",
  OPEN: "Not funded",
  FUNDED: "Funded",
  RESOLVED: "Settled",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STYLES[status] ?? "bg-stone text-muted";
  return (
    <span className={`inline-block rounded-full px-f2 py-[4px] text-xs font-bold ${cls}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
