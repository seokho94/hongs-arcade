import type { RaceResultEntry } from '../types'

interface Props {
  result: RaceResultEntry[]
  onRematch: () => void
  onEditRoster: () => void
}

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export function ResultScreen({ result, onRematch, onEditRoster }: Props) {
  const loser = result[result.length - 1]

  return (
    <section className="card result">
      <div className="result__spotlight">
        <p className="result__label">오늘의 커피는…</p>
        <div className="result__loser">
          <span className="result__loser-emoji">{loser.member.emoji}</span>
          <span className="result__loser-name">{loser.member.name}</span>
        </div>
        <p className="result__verdict">님이 쏩니다! ☕️🎉</p>
      </div>

      <ol className="ranking">
        {result.map((entry) => (
          <li
            key={entry.member.id}
            className={`ranking__item${
              entry.rank === result.length ? ' ranking__item--loser' : ''
            }`}
          >
            <span className="ranking__rank">
              {MEDALS[entry.rank] ?? `${entry.rank}등`}
            </span>
            <span className="ranking__emoji">{entry.member.emoji}</span>
            <span className="ranking__name">{entry.member.name}</span>
            {entry.rank === result.length && (
              <span className="ranking__tag">꼴찌 · 독박 ☕</span>
            )}
          </li>
        ))}
      </ol>

      <div className="result__actions">
        <button className="btn btn--primary" onClick={onRematch}>
          🔁 같은 멤버로 한 번 더
        </button>
        <button className="btn btn--ghost" onClick={onEditRoster}>
          ✏️ 참가자 수정
        </button>
      </div>
    </section>
  )
}
