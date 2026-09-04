const STYLES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  disputed: "bg-wasit-red/10 text-wasit-red",
  released: "bg-emerald-100 text-emerald-700",
  refunded: "bg-slate-200 text-slate-500",
  OPEN: "bg-slate-100 text-slate-600",
  FUNDED: "bg-wasit-yellow/20 text-amber-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STYLES[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}
