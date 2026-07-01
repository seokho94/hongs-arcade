import type { Member } from '../types'

/** 결승선 위치(내부 단위). 화면에는 0~100% 로 환산해서 그림. */
export const FINISH_LINE = 1000

/** 귀여운 동물 아바타 풀 */
export const ANIMALS = [
  '🐰', '🐢', '🦊', '🐱', '🐶', '🐼', '🐨', '🐯',
  '🦁', '🐸', '🐵', '🐷', '🐹', '🐭', '🐻', '🦄',
  '🐔', '🐧', '🦉', '🦜', '🐲', '🦖', '🐙', '🦀',
] as const

/** 가능한 한 겹치지 않게 무작위 아바타를 뽑아준다(인원이 더 많으면 재사용). */
export function pickEmojis(count: number): string[] {
  const pool = [...ANIMALS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return Array.from({ length: count }, (_, i) => pool[i % pool.length])
}

export function randomEmoji(): string {
  return ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
}

/* ── 이벤트(변수) 정의 ──────────────────────────────────
 * 데이터로 관리하므로 새 변수를 추가하려면 아래 배열에 한 줄만 더하면 됨.
 *  - multiply : duration 초 동안 속도 배율 적용 (className 으로 아바타 모션)
 *  - freeze   : duration 초 동안 정지
 *  - jump     : 위치를 즉시 delta 만큼 이동 (음수면 뒤로 밀림)
 *  - swap     : 바로 앞 주자와 위치를 맞바꿈 (대혼돈)
 */
export type EffectSpec =
  | { kind: 'multiply'; multiplier: number; duration: number; className: string }
  | { kind: 'freeze'; duration: number; className: string }
  | { kind: 'jump'; delta: number }
  | { kind: 'swap' }

export interface RaceEventDef {
  id: string
  emoji: string
  /** 중계 멘트 뒷부분 */
  label: string
  /** 초당 발생 확률 */
  rate: number
  /** 좋은 이벤트인지(중계 우선순위·연출용) */
  good: boolean
  spec: EffectSpec
}

export const EVENT_DEFS: RaceEventDef[] = [
  // 🟢 좋은 변수
  { id: 'sprint', emoji: '💨', label: '폭발적인 스퍼트!', rate: 0.42, good: true,
    spec: { kind: 'multiply', multiplier: 1.9, duration: 0.6, className: 'boost' } },
  { id: 'coffee', emoji: '☕', label: '커피 원샷! 완전 각성!', rate: 0.12, good: true,
    spec: { kind: 'multiply', multiplier: 2.2, duration: 0.8, className: 'boost' } },
  { id: 'rocket', emoji: '🚀', label: '로켓 점화! 슈우웅~', rate: 0.10, good: true,
    spec: { kind: 'multiply', multiplier: 2.8, duration: 0.7, className: 'rocket' } },
  { id: 'star', emoji: '⭐', label: '무적 스타 획득!', rate: 0.06, good: true,
    spec: { kind: 'multiply', multiplier: 3.3, duration: 0.6, className: 'star' } },
  { id: 'warp', emoji: '✨', label: '지름길 순간이동!', rate: 0.07, good: true,
    spec: { kind: 'jump', delta: 130 } },

  // 🔴 나쁜 변수
  { id: 'banana', emoji: '🍌', label: '미끄덩… 휘청!', rate: 0.38, good: false,
    spec: { kind: 'multiply', multiplier: 0.4, duration: 0.5, className: 'stumble' } },
  { id: 'mud', emoji: '🪵', label: '진흙탕에 풍덩! 발이 안 빠져!', rate: 0.13, good: false,
    spec: { kind: 'freeze', duration: 0.7, className: 'stuck' } },
  { id: 'sleep', emoji: '😴', label: '갑자기 솔솔 낮잠… 쿨쿨', rate: 0.07, good: false,
    spec: { kind: 'freeze', duration: 1.1, className: 'sleep' } },
  { id: 'pothole', emoji: '🕳️', label: '구덩이에 빠져 뒤로 주르륵!', rate: 0.10, good: false,
    spec: { kind: 'jump', delta: -95 } },
  { id: 'wind', emoji: '🌪️', label: '역풍에 휩쓸려 뒷걸음!', rate: 0.08, good: false,
    spec: { kind: 'jump', delta: -60 } },

  // 🟣 혼돈 변수
  { id: 'swap', emoji: '⚡', label: '앞 주자와 자리가 뒤바뀜!', rate: 0.05, good: false,
    spec: { kind: 'swap' } },
]

/** 셋업 화면에 보여줄 변수 미리보기(이모지만) */
export const EVENT_LEGEND = EVENT_DEFS.map((d) => d.emoji)

/** 진행 중인 타이머형 효과 */
interface ActiveEffect {
  multiplier: number // freeze 는 0
  remaining: number
  className: string
}

/** 머리 위에 잠깐 뜨는 말풍선 */
interface Flash {
  emoji: string
  remaining: number
}

/** 경주 중 한 명의 런타임 상태 */
export interface Runner {
  member: Member
  pos: number
  baseVel: number
  effect: ActiveEffect | null
  flash: Flash | null
  cooldown: number // 다음 이벤트까지 최소 대기(초)
  finished: boolean
  finishOrder: number // 도착 순위(1=1등), 미도착이면 -1
}

export type RaceEvent =
  | { type: 'event'; runner: Runner; def: RaceEventDef }
  | { type: 'finish'; runner: Runner; rank: number }

export function createRunners(members: Member[]): Runner[] {
  return members.map((member) => ({
    member,
    pos: 0,
    baseVel: 145 + Math.random() * 35,
    effect: null,
    flash: null,
    cooldown: 0,
    finished: false,
    finishOrder: -1,
  }))
}

/** 이번 프레임에 발생할 이벤트 하나를 확률적으로 고른다(없으면 null). */
function rollEvent(dt: number): RaceEventDef | null {
  const fired = EVENT_DEFS.filter((d) => Math.random() < d.rate * dt)
  if (fired.length === 0) return null
  return fired[Math.floor(Math.random() * fired.length)]
}

function applyEvent(runners: Runner[], r: Runner, def: RaceEventDef): void {
  r.flash = { emoji: def.emoji, remaining: 0.9 }
  const s = def.spec
  switch (s.kind) {
    case 'multiply':
      r.effect = { multiplier: s.multiplier, remaining: s.duration, className: s.className }
      break
    case 'freeze':
      r.effect = { multiplier: 0, remaining: s.duration, className: s.className }
      break
    case 'jump':
      r.pos = Math.max(0, r.pos + s.delta)
      break
    case 'swap': {
      // 바로 앞(위치가 큰) 주자 중 가장 가까운 주자와 자리 교체
      const ahead = runners
        .filter((o) => o !== r && !o.finished && o.pos > r.pos)
        .sort((a, b) => a.pos - b.pos)[0]
      if (ahead) {
        const tmp = r.pos
        r.pos = ahead.pos
        ahead.pos = tmp
        ahead.flash = { emoji: '⚡', remaining: 0.9 }
      }
      break
    }
  }
}

/**
 * 한 프레임 진행. runners 를 직접 변경하고, 이번 프레임에 일어난
 * 이벤트(변수/도착)들을 반환한다. dt 는 초 단위.
 */
export function stepRunners(runners: Runner[], dt: number): RaceEvent[] {
  const events: RaceEvent[] = []
  let finishedCount = runners.filter((r) => r.finished).length

  for (const r of runners) {
    if (r.finished) continue

    // 말풍선/효과/쿨다운 타이머 감소
    if (r.flash) {
      r.flash.remaining -= dt
      if (r.flash.remaining <= 0) r.flash = null
    }
    if (r.effect) {
      r.effect.remaining -= dt
      if (r.effect.remaining <= 0) r.effect = null
    }
    if (r.cooldown > 0) r.cooldown = Math.max(0, r.cooldown - dt)

    // 새 변수 발동 (효과 없고 쿨다운 끝났을 때만)
    if (!r.effect && r.cooldown === 0) {
      const def = rollEvent(dt)
      if (def) {
        applyEvent(runners, r, def)
        r.cooldown = 0.5
        events.push({ type: 'event', runner: r, def })
      }
    }

    // 속도 = 기본 × 효과배율 × 프레임 지터
    const mult = r.effect ? r.effect.multiplier : 1
    const jitter = 0.85 + Math.random() * 0.3
    r.pos += r.baseVel * mult * jitter * dt
    if (r.pos < 0) r.pos = 0

    if (r.pos >= FINISH_LINE) {
      r.pos = FINISH_LINE
      r.finished = true
      finishedCount += 1
      r.finishOrder = finishedCount
      events.push({ type: 'finish', runner: r, rank: finishedCount })
    }
  }

  return events
}

export function allFinished(runners: Runner[]): boolean {
  return runners.every((r) => r.finished)
}

/** 화면 표시용 0~100 진행률 */
export function progress(r: Runner): number {
  return (r.pos / FINISH_LINE) * 100
}
