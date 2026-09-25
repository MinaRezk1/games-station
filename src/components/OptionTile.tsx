export const SHAPES = ['▲', '◆', '●', '■'];

interface Props {
  index: number;
  text: string;
  state?: 'normal' | 'correct' | 'dim';
  count?: number;
  max?: number;
  onClick?: () => void;
  disabled?: boolean;
  big?: boolean;
}

export function OptionTile({ index, text, state = 'normal', count, max, onClick, disabled, big }: Props) {
  const className = `opt opt-${index} ${state !== 'normal' ? `is-${state}` : ''} ${big ? 'opt-big' : ''}`;
  const content = (
    <>
      <span className="opt-shape" aria-hidden="true">
        {SHAPES[index]}
      </span>
      <span className="opt-text">{text}</span>
      {count !== undefined && (
        <span className="opt-count">
          <span className="opt-bar" style={{ width: `${max ? (count / max) * 100 : 0}%` }} />
          <b>{count}</b>
        </span>
      )}
      {state === 'correct' && (
        <span className="opt-check" aria-label="الإجابة الصح">
          ✓
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} disabled={disabled}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}
