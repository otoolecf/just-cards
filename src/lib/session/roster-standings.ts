import type { ScoreWinDirection } from './score-session-commands';

/** Display order follows score entry; rank follows the game's winning direction. */
export function rosterStandings(players: string[], totals: Record<string, number>, direction: ScoreWinDirection) {
 if (!Object.keys(totals).length) return [];
 const rows = players.map(player => ({ player, total: totals[player] ?? 0 }));
 return rows.map(row => {
  const rank = 1 + rows.filter(other => direction === 'low_wins' ? other.total < row.total : other.total > row.total).length;
  const tied = rows.filter(other => other.total === row.total).length > 1;
  const suffix = rank % 100 >= 11 && rank % 100 <= 13 ? 'th' : ({1:'st',2:'nd',3:'rd'} as Record<number,string>)[rank % 10] ?? 'th';
  return { ...row, rank, rankLabel: `${tied ? 'Tied ' : ''}${rank}${suffix}` };
 });
}
