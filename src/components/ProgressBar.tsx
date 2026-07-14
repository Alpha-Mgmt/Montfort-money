export function ProgressBar({
  spent,
  limit,
}: {
  spent: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
  const ratio = limit > 0 ? spent / limit : 0;
  const cls = ratio > 1 ? "over" : ratio > 0.85 ? "warn" : "";
  return (
    <div className="progress-track">
      <div className={`progress-fill ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
