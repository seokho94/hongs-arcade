import { useState } from 'react'
import type { Member, RaceResultEntry } from './types'
import { SetupScreen } from './components/SetupScreen'
import { RaceScreen } from './components/RaceScreen'
import { ResultScreen } from './components/ResultScreen'

type Screen = 'setup' | 'race' | 'result'

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup')
  const [members, setMembers] = useState<Member[]>([])
  const [result, setResult] = useState<RaceResultEntry[] | null>(null)
  // 같은 멤버로 "한 번 더" 달릴 때 RaceScreen 을 새로 마운트시키는 키
  const [raceKey, setRaceKey] = useState(0)

  function startRace(roster: Member[]) {
    setMembers(roster)
    setRaceKey((k) => k + 1)
    setScreen('race')
  }

  function handleRaceDone(finalResult: RaceResultEntry[]) {
    setResult(finalResult)
    setScreen('result')
  }

  function rematch() {
    setRaceKey((k) => k + 1)
    setScreen('race')
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>☕ 커피런</h1>
        <p className="app__tagline">조직도 부서원들의 귀여운 캐릭터 경주 — 꼴찌가 쏜다!</p>
      </header>

      <main className="app__main">
        {screen === 'setup' && (
          <SetupScreen initialMembers={members} onStart={startRace} />
        )}
        {screen === 'race' && (
          <RaceScreen key={raceKey} members={members} onDone={handleRaceDone} />
        )}
        {screen === 'result' && result && (
          <ResultScreen
            result={result}
            onRematch={rematch}
            onEditRoster={() => setScreen('setup')}
          />
        )}
      </main>

      <footer className="app__footer">
        목 데이터로 동작 중 · Naver Works 실연동은 다음 단계 🔌
      </footer>
    </div>
  )
}
