# ☕ 커피런 (Coffee Run)

조직도에서 부서를 불러와 부서원들을 귀여운 동물 캐릭터로 만들고,
**캐릭터 경주**로 커피 내기를 하는 서비스. **꼴찌가 쏜다!** 🏁

## 화면 흐름

1. **셋업** — 부서 선택 → `부서원 불러오기`, 또는 이름 직접 추가/편집. 각자 동물 아바타 배정(다시 뽑기 가능).
2. **경주** — 3·2·1 카운트다운 후 출발. 가속(💨)·미끄러짐(🍌)으로 엎치락뒤치락, 실시간 중계 멘트.
3. **결과** — 꼴찌(독박) 극적 공개 + 전체 순위. `같은 멤버로 한 번 더` / `참가자 수정`.

## 기술 스택

- React 19 + Vite + TypeScript
- 경주 애니메이션: `requestAnimationFrame` 기반 순수 시뮬레이션 (`src/game/race.ts`)
- 스타일: 순수 CSS (의존성 최소화)

## 실행

```bash
npm install
npm run dev      # http://localhost:5174
npm run build    # 타입체크 + 프로덕션 번들
```

## Naver Works 실연동 (다음 단계)

현재 조직도 데이터는 목(mock)입니다. 실연동 시 게임/화면 코드는 그대로 두고
`src/services/directory.ts` 의 `DirectoryProvider` 를 HTTP 구현으로 교체하면 됩니다.

- 인증: Service Account + OAuth 2.0 (JWT) → access token *(반드시 서버에서)*
- 부서 목록: `GET /directory/v1/orgunits`
- 부서원: `GET /directory/v1/users?orgUnitId={id}`

client secret / 서비스 계정 키가 필요하므로, 브라우저가 아닌 **백엔드 프록시**를 통해 호출해야 합니다.

## 프로젝트 구조

```
src/
├── App.tsx                  # 화면 상태머신 (setup → race → result)
├── types.ts                 # Member / OrgUnit / RaceResultEntry
├── data/mockDirectory.ts    # 목 부서·부서원 데이터
├── services/directory.ts    # DirectoryProvider 인터페이스 + 목 구현 (교체 지점)
├── game/race.ts             # 경주 시뮬레이션 (순수 로직)
├── hooks/useRace.ts         # 카운트다운·진행·중계를 구동하는 훅
└── components/
    ├── SetupScreen.tsx
    ├── RaceScreen.tsx
    └── ResultScreen.tsx
```
