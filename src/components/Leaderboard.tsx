import type { Player, TeamScoring } from '../types';

export function sortPlayers(players: Player[]): Player[] {
  return [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ar'));
}

export function Leaderboard({ players, limit = 5, startRank = 1 }: { players: Player[]; limit?: number; startRank?: number }) {
  const top = sortPlayers(players).slice(0, limit);
  if (top.length === 0) return <p className="muted">مفيش لاعبين.</p>;
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

export interface TeamStanding {
  index: number;
  name: string;
  score: number;
  members: number;
}

export function teamStandings(players: Player[], teams: string[], mode: TeamScoring = 'avg'): TeamStanding[] {
  return teams
    .map((name, index) => {
      const members = players.filter((p) => p.team === index);
      const sum = members.reduce((acc, p) => acc + p.score, 0);
      const score = mode === 'sum' ? sum : members.length ? Math.round(sum / members.length) : 0;
      return { index, name, score, members: members.length };
    })
    .sort((a, b) => b.score - a.score);
}

export function TeamBoard({ standings, mode }: { standings: TeamStanding[]; mode: TeamScoring }) {
  const max = Math.max(1, ...standings.map((t) => t.score));
  return (
    <ol className="team-board">
      {standings.map((t, i) => (
        <li key={t.index} className={`team-row ${i === 0 ? 'is-first' : ''}`}>
          <span className="board-rank">{i + 1}</span>
          <span className="team-info">
            <b>{t.name}</b>
            <small>
              {t.members} لاعب · {mode === 'sum' ? 'مجموع النقط' : 'متوسط النقط'}
            </small>
            <span className="team-bar">
              <span style={{ width: `${(t.score / max) * 100}%` }} />
            </span>
          </span>
          <span className="board-score">{t.score}</span>
        </li>
      ))}
    </ol>
  );
}
