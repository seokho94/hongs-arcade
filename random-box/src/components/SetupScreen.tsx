import { useEffect, useRef, useState } from 'react'
import type { Member, OrgUnit } from '../types'
import { directory } from '../services/directory'
import { EVENT_LEGEND, pickEmojis, randomEmoji } from '../game/race'

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `m_${Math.random().toString(36).slice(2)}`
}

interface Props {
  initialMembers: Member[]
  onStart: (members: Member[]) => void
}

export function SetupScreen({ initialMembers, onStart }: Props) {
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([])
  const [selectedOrg, setSelectedOrg] = useState<string>('')
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [loadingOrgs, setLoadingOrgs] = useState(true)
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [newName, setNewName] = useState('')
  const newNameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    directory.listOrgUnits().then((units) => {
      if (!alive) return
      setOrgUnits(units)
      setSelectedOrg(units[0]?.id ?? '')
      setLoadingOrgs(false)
    })
    return () => {
      alive = false
    }
  }, [])

  async function loadDepartment() {
    if (!selectedOrg) return
    setLoadingMembers(true)
    const names = await directory.listMembers(selectedOrg)
    const emojis = pickEmojis(names.length)
    setMembers(names.map((name, i) => ({ id: uid(), name, emoji: emojis[i] })))
    setLoadingMembers(false)
  }

  function addMember() {
    const name = newName.trim()
    if (!name) return
    setMembers((prev) => [...prev, { id: uid(), name, emoji: randomEmoji() }])
    setNewName('')
    newNameRef.current?.focus()
  }

  function removeMember(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id))
  }

  function renameMember(id: string, name: string) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, name } : m)))
  }

  function rerollOne(id: string) {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, emoji: randomEmoji() } : m)),
    )
  }

  function rerollAll() {
    setMembers((prev) => {
      const emojis = pickEmojis(prev.length)
      return prev.map((m, i) => ({ ...m, emoji: emojis[i] }))
    })
  }

  const canStart = members.length >= 2

  return (
    <section className="card setup">
      <div className="setup__loader">
        <label className="setup__label">부서 선택</label>
        <div className="setup__loader-row">
          <select
            className="select"
            value={selectedOrg}
            disabled={loadingOrgs}
            onChange={(e) => setSelectedOrg(e.target.value)}
          >
            {loadingOrgs && <option>불러오는 중...</option>}
            {orgUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.memberCount ? ` (${u.memberCount}명)` : ''}
              </option>
            ))}
          </select>
          <button
            className="btn btn--primary"
            onClick={loadDepartment}
            disabled={loadingMembers || loadingOrgs}
          >
            {loadingMembers ? '불러오는 중…' : '부서원 불러오기'}
          </button>
        </div>
      </div>

      <div className="setup__roster">
        <div className="setup__roster-head">
          <h2>참가자 {members.length}명</h2>
          {members.length > 0 && (
            <button className="btn btn--ghost" onClick={rerollAll}>
              🎲 아바타 전체 다시 뽑기
            </button>
          )}
        </div>

        {members.length === 0 ? (
          <p className="setup__empty">
            부서를 불러오거나 아래에서 직접 이름을 추가해 주세요 🙌
          </p>
        ) : (
          <ul className="roster">
            {members.map((m) => (
              <li key={m.id} className="roster__item">
                <button
                  className="roster__emoji"
                  title="아바타 다시 뽑기"
                  onClick={() => rerollOne(m.id)}
                >
                  {m.emoji}
                </button>
                <input
                  className="roster__name"
                  value={m.name}
                  onChange={(e) => renameMember(m.id, e.target.value)}
                />
                <button
                  className="roster__del"
                  title="제거"
                  onClick={() => removeMember(m.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="setup__add">
          <input
            ref={newNameRef}
            className="input"
            placeholder="이름 직접 추가"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addMember()}
          />
          <button className="btn" onClick={addMember}>
            + 추가
          </button>
        </div>
      </div>

      <div className="setup__legend" title="경주 중 무작위로 등장하는 변수들">
        <span className="setup__legend-label">🎲 등장 변수</span>
        <span className="setup__legend-emojis">{EVENT_LEGEND.join(' ')}</span>
      </div>

      <button
        className="btn btn--start"
        disabled={!canStart}
        onClick={() => onStart(members)}
      >
        🏁 경주 시작!
      </button>
      {!canStart && (
        <p className="setup__hint">최소 2명 이상이어야 경주를 시작할 수 있어요.</p>
      )}
    </section>
  )
}
