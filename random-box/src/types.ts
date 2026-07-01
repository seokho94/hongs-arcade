/** 한 명의 참가자 (조직도에서 불러온 사람 + 게임용 아바타) */
export interface Member {
  id: string
  name: string
  emoji: string
}

/** 조직도의 부서(조직 단위) */
export interface OrgUnit {
  id: string
  name: string
  /** 부서원 수(미리보기용, 선택) */
  memberCount?: number
}

/** 경주 결과 한 줄 — rank 1 이 1등(가장 먼저 도착) */
export interface RaceResultEntry {
  member: Member
  rank: number
}
