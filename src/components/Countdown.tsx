export function Countdown({ leftMs, text }: { leftMs: number; text: string }) {
  const n = Math.max(1, Math.ceil(leftMs / 1000));
  return (
    <div className="countdown">
      <p className="countdown-label">استعد</p>
      <span key={n} className="countdown-num">
        {n}
      </span>
      <p className="countdown-text">{text}</p>
    </div>
  );
}
