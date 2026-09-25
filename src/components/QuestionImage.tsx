import { useState } from 'react';

export function QuestionImage({ src, className = '' }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <div className={`q-image ${className}`}>
      <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </div>
  );
}
