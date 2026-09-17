import clsx from 'clsx';

export function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  return (
    <div className="card p-4">
      <div className="stat-label">{label}</div>
      <div
        className={clsx(
          'stat-value mt-1',
          tone === 'positive' && 'text-score-excellent',
          tone === 'negative' && 'text-score-pass'
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}
