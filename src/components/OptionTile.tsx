export const SHAPES = ['▲', '◆', '●', '■', '★', '⬢'];

interface Props {
  index: number;
  text: string;
  state?: 'normal' | 'correct' | 'dim' | 'selected';
  count?: number;
  total?: number;
  onClick?: () => void;
  disabled?: boolean;
  big?: boolean;
}

export function OptionTile({ index, text, state = 'normal', count, total, onClick, disabled, big }: Props) {
  const color = index % SHAPES.length;
  const className = `opt opt-${color} ${state !== 'normal' ? `is-${state}` : ''} ${big ? 'opt-big' : ''}`;
  const pct = count !== undefined && total ? Math.round((count / total) * 100) : 0;
  const content = (
    <>
      {count !== undefined && <span className="opt-fill" style={{ width: `${pct}%` }} aria-hidden="true" />}
      <span className="opt-shape" aria-hidden="true">
        {SHAPES[color]}
      </span>
      <span className="opt-text">{text}</span>
      {count !== undefined && (
        <span className="opt-count">
          <b>{count}</b>
          <small>{pct}%</small>
        </span>
      )}
      {state === 'correct' && (
        <span className="opt-check" aria-label="الإجابة الصح">
          ✓
        </span>
      )}
      {state === 'selected' && (
        <span className="opt-check" aria-label="مختار">
          ✓
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} disabled={disabled} aria-pressed={state === 'selected'}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}
