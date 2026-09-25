import type { Player } from '../types';

export function sortPlayers(players: Player[]): Player[] {
  return [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ar'));
}

export function Leaderboard({ players, limit = 5, startRank = 1 }: { players: Player[]; limit?: number; startRank?: number }) {
  const top = sortPlayers(players).slice(0, limit);
  if (top.length === 0) return <p className="muted-light">مفيش لاعبين.</p>;
  return (
    <ol className="board">
      {top.map((p, i) => (
        <li key={p.id} className={`board-row rank-${i + startRank}`}>
          <span className="board-rank">{i + startRank}</span>
          <span className="board-name">{p.name}</span>
          {!!p.lastPoints && <span className="board-gain">+{p.lastPoints}</span>}
          <span className="board-score">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}
