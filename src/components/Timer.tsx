interface Props {
  remainingMs: number;
  totalMs: number;
}

export function Timer({ remainingMs, totalMs }: Props) {
  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
  const frac = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className={`timer ${secs <= 5 ? 'is-low' : ''}`} role="timer" aria-label={`فاضل ${secs} ثانية`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="timer-track" />
        <circle
          cx="50"
          cy="50"
          r={r}
          className="timer-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
        />
      </svg>
      <span>{secs}</span>
    </div>
  );
}
