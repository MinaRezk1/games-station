import { SHAPES } from './OptionTile';

interface Props {
  options: string[];
  images?: string[];
  counts?: number[]; // لو مش موجودة: الأعمدة فاضية (وقت السؤال)
  correct?: number[]; // لو موجودة: الإجابة اتكشفت
  highlight?: number[]; // علامة صح من غير ما نطفي الباقي (للمعاينة)
}

// عرض الاختيارات كرسم بياني بأعمدة
export function BarChart({ options, images, counts, correct, highlight }: Props) {
  const revealed = !!correct;
  const max = Math.max(1, ...(counts ?? [0]));
  return (
    <div className={`bars count-${options.length} ${revealed ? 'is-revealed' : ''}`}>
      <div className="bars-plot">
        {options.map((_, i) => {
          const value = counts?.[i] ?? 0;
          const isCorrect = correct?.includes(i);
          return (
            <div key={i} className={`bar-col ${revealed && !isCorrect ? 'is-dim' : ''}`}>
              {counts && <span className="bar-value">{value}</span>}
              <span
                className={`bar bar-${i % SHAPES.length}`}
                style={{ height: counts ? `${Math.max(2, (value / max) * 100)}%` : '2%' }}
              />
            </div>
          );
        })}
      </div>
      <div className="bars-labels">
        {options.map((opt, i) => {
          const isCorrect = correct?.includes(i) || highlight?.includes(i);
          return (
            <div key={i} className={`bar-label ${revealed && !isCorrect ? 'is-dim' : ''} ${isCorrect ? 'is-correct' : ''}`}>
              {images?.[i] && <img src={images[i]} alt="" referrerPolicy="no-referrer" />}
              <span className="bar-label-text">
                <span className={`bar-shape bar-shape-${i % SHAPES.length}`} aria-hidden="true">
                  {SHAPES[i % SHAPES.length]}
                </span>
                {opt}
                {isCorrect && (
                  <span className="bar-check" aria-label="الإجابة الصح">
                    ✓
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
