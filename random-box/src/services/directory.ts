import type { OrgUnit } from '../types'
import { MOCK_ORG_UNITS, MOCK_MEMBERS_BY_ORG } from '../data/mockDirectory'

/**
 * 조직도 데이터 제공자 인터페이스.
 *
 * 지금은 목(mock) 구현만 있지만, 나중에 Naver Works Directory API 를
 * 호출하는 백엔드가 생기면 같은 인터페이스로 `HttpDirectoryProvider` 를
 * 만들어 끼워넣기만 하면 됩니다. (게임/화면 코드는 손대지 않음)
 *
 * Naver Works 연동 시 참고:
 *  - 인증: Service Account + OAuth 2.0 (JWT) → access token
 *  - 부서 목록: GET /directory/v1/orgunits
 *  - 부서원:   GET /directory/v1/users?orgUnitId={id}
 *  위 호출은 client secret / 서비스 계정 키가 필요하므로 반드시 서버에서.
 */
export interface DirectoryProvider {
  /** 선택 가능한 부서 목록 */
  listOrgUnits(): Promise<OrgUnit[]>
  /** 특정 부서의 구성원 이름 목록 */
  listMembers(orgUnitId: string): Promise<string[]>
}

/** 네트워크 지연을 흉내내는 헬퍼 (로딩 UI 확인용) */
function delay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/** 목 데이터 기반 구현 — API 없이도 바로 플레이 가능 */
export class MockDirectoryProvider implements DirectoryProvider {
  listOrgUnits(): Promise<OrgUnit[]> {
    return delay(MOCK_ORG_UNITS)
  }

  listMembers(orgUnitId: string): Promise<string[]> {
    return delay(MOCK_MEMBERS_BY_ORG[orgUnitId] ?? [])
  }
}

/** 앱 전역에서 쓰는 기본 제공자. 추후 여기만 교체하면 실연동 전환 끝. */
export const directory: DirectoryProvider = new MockDirectoryProvider()
