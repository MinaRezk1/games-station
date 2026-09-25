import { BarChart } from './BarChart';
import { QuestionImage } from './QuestionImage';
import { themeStyle } from '../lib/quiz';
import type { Question, QuizSettings } from '../types';

interface Props {
  slide: Question;
  settings: QuizSettings;
  number: number;
  total: number;
}

// نسخة مصغّرة من شاشة العرض، بتتحدّث وإنت بتكتب
export function SlidePreview({ slide, settings, number, total }: Props) {
  return (
    <div className={`slide-frame theme-${settings.theme}`} style={themeStyle(settings)}>
      {slide.type === 'leaderboard' ? (
        <div className="slide-board">
          <span className="slide-trophy" aria-hidden="true">
            🏆
          </span>
          <p className="slide-board-title">الترتيب</p>
          <ol>
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <span>{n}</span>
                <i />
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="slide-q">
          <p className="slide-q-num">
            سؤال {number} من {total}
          </p>
          {slide.double && <span className="double-badge">نقط دابل ×2</span>}
          <div className="slide-q-head">
            <h3 className={`slide-q-text ${slide.text.trim() ? '' : 'is-empty'}`}>{slide.text.trim() || 'اكتب السؤال…'}</h3>
          </div>
          <QuestionImage src={slide.imageUrl.startsWith('https://') ? slide.imageUrl : ''} className="slide-img" />
          {slide.type === 'short' ? (
            <div className="slide-hint">✎ اكتب الإجابة على موبايلك</div>
          ) : slide.type === 'order' ? (
            <ul className="slide-order">
              {slide.options.map((o, i) => (
                <li key={i}>{o || '…'}</li>
              ))}
            </ul>
          ) : (
            <div className="slide-chart">
              <BarChart
                options={slide.options.map((o) => o || '…')}
                images={slide.options.map((_, i) => (slide.type === 'choice' && slide.optionImages[i]?.startsWith('https://') ? slide.optionImages[i] : ''))}
                highlight={slide.correct}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
