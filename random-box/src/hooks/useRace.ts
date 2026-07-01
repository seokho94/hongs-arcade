import { useCallback, useEffect, useRef, useState } from 'react'
import type { Member, RaceResultEntry } from '../types'
import {
  allFinished,
  createRunners,
  stepRunners,
  type RaceEvent,
  type Runner,
} from '../game/race'

export type RacePhase = 'countdown' | 'running' | 'finished'

const COUNTDOWN_FROM = 3

/** 이벤트 → 중계 멘트 */
function commentaryFor(ev: RaceEvent, totalRunners: number): string | null {
  switch (ev.type) {
    case 'event':
      return `${ev.def.emoji} ${ev.runner.member.name} ${ev.def.label}`
    case 'finish':
      if (ev.rank === 1) return `🥇 ${ev.runner.member.name} 1등으로 골인!`
      if (ev.rank === totalRunners) return null // 꼴찌는 결과 화면에서 극적으로
      return `${ev.rank}등 ${ev.runner.member.name} 통과!`
  }
}

/**
 * 경주를 카운트다운 → 진행 → 종료까지 자동으로 굴린다.
 * RaceScreen 이 매번 새로 마운트되며 현재 멤버로 초기화됨.
 */
export function useRace(members: Member[]) {
  const [phase, setPhase] = useState<RacePhase>('countdown')
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM)
  const [runners, setRunners] = useState<Runner[]>(() => createRunners(members))
  const [commentary, setCommentary] = useState('제자리에... 준비!')
  const [result, setResult] = useState<RaceResultEntry[] | null>(null)

  const runnersRef = useRef<Runner[]>(runners)
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)
  const lastCommentRef = useRef<number>(0)

  const finish = useCallback(() => {
    const sorted = [...runnersRef.current]
      .sort((a, b) => a.finishOrder - b.finishOrder)
      .map<RaceResultEntry>((r) => ({ member: r.member, rank: r.finishOrder }))
    setResult(sorted)
    setPhase('finished')
  }, [])

  const loop = useCallback(
    (now: number) => {
      const last = lastTimeRef.current ?? now
      const dt = Math.min((now - last) / 1000, 0.05) // 백그라운드 점프 방지
      lastTimeRef.current = now

      const events = stepRunners(runnersRef.current, dt)
      setRunners([...runnersRef.current])

      // 중계 멘트: 너무 자주 바뀌지 않게 throttle, 도착 이벤트 우선
      const total = runnersRef.current.length
      const remaining = runnersRef.current.filter((r) => !r.finished).length
      const finishEv = events.find((e) => e.type === 'finish')
      const pick = finishEv ?? events[Math.floor(Math.random() * events.length)]
      if (pick && now - lastCommentRef.current > 550) {
        const msg = commentaryFor(pick, total)
        if (msg) {
          setCommentary(msg)
          lastCommentRef.current = now
        }
      }
      if (remaining === 1 && total > 1) {
        setCommentary('😱 이제 한 명 남았다... 꼴찌는 누구?!')
      }

      if (allFinished(runnersRef.current)) {
        finish()
        return
      }
      rafRef.current = requestAnimationFrame(loop)
    },
    [finish],
  )

  // 카운트다운
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      setCommentary('🏁 출발!')
      setPhase('running')
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 750)
    return () => clearTimeout(t)
  }, [phase, countdown])

  // 진행
  useEffect(() => {
    if (phase !== 'running') return
    lastTimeRef.current = null
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [phase, loop])

  return { phase, countdown, runners, commentary, result }
}
