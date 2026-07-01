import { useEffect } from 'react'
import type { Member, RaceResultEntry } from '../types'
import { useRace } from '../hooks/useRace'
import { progress } from '../game/race'

interface Props {
  members: Member[]
  onDone: (result: RaceResultEntry[]) => void
}

export function RaceScreen({ members, onDone }: Props) {
  const { phase, countdown, runners, commentary, result } = useRace(members)

  // 마지막 주자가 골인한 뒤 잠깐 여운을 두고 결과 화면으로
  useEffect(() => {
    if (phase !== 'finished' || !result) return
    const t = setTimeout(() => onDone(result), 1100)
    return () => clearTimeout(t)
  }, [phase, result, onDone])

  return (
    <section className="card race">
      <div className="race__commentary">{commentary}</div>

      <div className="track-board">
        {runners.map((r) => {
          const p = progress(r)
          return (
            <div className="lane" key={r.member.id}>
              <div className="lane__name">{r.member.name}</div>
              <div className="lane__track">
                <span
                  className="runner"
                  style={{ left: `${p}%`, transform: `translateX(-${p}%)` }}
                >
                  {r.flash && <span className="runner__flash">{r.flash.emoji}</span>}
                  <span
                    className={`runner__avatar${
                      r.effect ? ` runner__avatar--${r.effect.className}` : ''
                    }`}
                  >
                    {r.member.emoji}
                  </span>
                </span>
                <span className="lane__flag">🏁</span>
                {r.finished && (
                  <span className="lane__rank">{r.finishOrder}등</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {phase === 'countdown' && (
        <div className="countdown" aria-live="assertive">
          <span className="countdown__num" key={countdown}>
            {countdown > 0 ? countdown : 'GO!'}
          </span>
        </div>
      )}
    </section>
  )
}
