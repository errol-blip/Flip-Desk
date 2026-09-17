import clsx from 'clsx';

const BAND_STYLES: Record<string, string> = {
  excellent: 'bg-score-excellent/10 text-score-excellent border-score-excellent/30',
  good: 'bg-score-good/10 text-score-good border-score-good/30',
  marginal: 'bg-score-marginal/10 text-score-marginal border-score-marginal/30',
  pass: 'bg-score-pass/10 text-score-pass border-score-pass/30',
};

const BAND_LABEL: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  marginal: 'Marginal',
  pass: 'Pass',
};

export function bandForScore(score: number): 'excellent' | 'good' | 'marginal' | 'pass' {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'marginal';
  return 'pass';
}

export function FlipScoreBadge({ score }: { score: number }) {
  const band = bandForScore(score);
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium tabular-nums',
        BAND_STYLES[band]
      )}
      title={`Flip Score: ${score}/100 — ${BAND_LABEL[band]}`}
    >
      {score}
      <span className="text-xs font-normal opacity-80">{BAND_LABEL[band]}</span>
    </span>
  );
}
