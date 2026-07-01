import type { OrgUnit } from '../types'

/**
 * Naver Works 조직도를 흉내 낸 목 데이터.
 * 실연동 전까지 부서 선택 → 부서원 불러오기 흐름을 그대로 체험할 수 있게 함.
 */
export const MOCK_ORG_UNITS: OrgUnit[] = [
  { id: 'dev-1', name: '개발 1팀', memberCount: 6 },
  { id: 'dev-2', name: '개발 2팀', memberCount: 5 },
  { id: 'plan', name: '기획팀', memberCount: 4 },
  { id: 'design', name: '디자인팀', memberCount: 4 },
  { id: 'sales', name: '영업팀', memberCount: 7 },
  { id: 'hr', name: '경영지원팀', memberCount: 3 },
]

export const MOCK_MEMBERS_BY_ORG: Record<string, string[]> = {
  'dev-1': ['김서연', '이준호', '박민지', '최우진', '정다은', '강현우'],
  'dev-2': ['윤지후', '임수아', '한도윤', '오예린', '서지안'],
  plan: ['배지원', '신유나', '문태경', '조하람'],
  design: ['홍보검', '권나윤', '황시우', '안채원'],
  sales: ['남기훈', '구본영', '류세아', '천재민', '엄지호', '봉미래', '석진솔'],
  hr: ['하은별', '주성민', '표가람'],
}
