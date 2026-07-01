/** 게임 구현에 흔히 쓰는 유틸 */
import type { GameResult, Player, RankingEntry } from '@mg/shared';

/** Fisher-Yates 셔플 (원본 불변) */
export function shuffle<T>(arr: readonly T[], rnd: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

/** 정답 비교용 정규화 (공백 제거, 소문자, 유니코드 정규화) */
export function normalize(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, '').trim();
}

/** 점수 맵을 순위 배열로 (동점은 같은 rank) */
export function buildRankings(
  scores: Record<string, number>,
  players: Player[],
): RankingEntry[] {
  const nameOf = new Map(players.map((p) => [p.id, p.nickname]));
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const rankings: RankingEntry[] = [];
  let rank = 0;
  let prev = Number.POSITIVE_INFINITY;
  entries.forEach(([playerId, score], i) => {
    if (score < prev) {
      rank = i + 1;
      prev = score;
    }
    rankings.push({ playerId, nickname: nameOf.get(playerId) ?? playerId, score, rank });
  });
  return rankings;
}

export function makeResult(scores: Record<string, number>, players: Player[]): GameResult {
  return { rankings: buildRankings(scores, players) };
}
