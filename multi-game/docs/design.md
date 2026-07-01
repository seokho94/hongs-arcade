# Multi-Game 플랫폼 설계 문서

소켓 기반으로 다수 사용자가 함께 즐기는 미니게임 플랫폼. 코어(접속·로비·룸·채팅)는 고정,
미니게임은 독립적으로 추가·교체 가능한 모듈로 분리한다.

## 1. 확정 사항

| 항목 | 결정 |
|------|------|
| 런타임/언어 | Node.js + TypeScript |
| 실시간 통신 | Socket.IO |
| 모노레포 | pnpm workspaces (게임별 패키지 분리) |
| 클라이언트 | Vite + TS, Canvas |
| 규모 | 소규모(웹 브라우저), 게임당 6명+ 지원 |
| 게임 권위 | Authoritative Server (클라는 의도만 전송) |
| 첫 게임 | 캐치마인드 |

## 2. 핵심 원칙

- **게임 모듈은 Socket.IO를 직접 만지지 않는다.** 오직 `GameContext` 콜백으로만 플랫폼과 대화.
- **단일 진실원**: 이벤트/페이로드 타입은 `@mg/shared`에 정의, 서버·클라가 공유.
- **게임 추가 = 패키지 추가 + 레지스트리 1줄 등록.** 코어 무수정.

## 3. 모노레포 구조

```
multi-game/
├── packages/
│   ├── shared/        # 프로토콜·공통 타입 (서버·클라 공유)
│   ├── game-sdk/      # 게임 모듈 인터페이스 (서버: index, 클라: /client)
│   ├── server/        # Socket.IO 서버: 접속·세션·로비·룸·채팅·런타임 (코어)
│   ├── client/        # 웹 클라이언트: 로비/룸/게임 화면 (코어)
│   └── games/
│       └── catch-mind/  # 게임 1개 = 패키지 1개 = 독립 업데이트 단위
│           ├── meta.ts    # 서버·클라 공통 메타
│           ├── words.ts   # 단어 풀
│           ├── server.ts  # GameInstance 구현
│           └── client.ts  # GameClient 구현
```

## 4. 게임 플러그인 계약 (SDK)

### 서버 측 (`@mg/game-sdk`)
```ts
interface GameContext {
  readonly players: Player[];
  pushState(): void;                       // getStateView(p) → 각 플레이어에게 game:state
  emit(event, payload): void;              // 룸 전체 ephemeral 이벤트 (game:event)
  emitTo(playerId, event, payload): void;  // 특정 플레이어 ephemeral
  setTimer(ms, cb): TimerHandle;           // 페이즈 전환 타이머
  clearTimer(h): void;
  endGame(result): void;                   // 종료 → 코어가 룸 정리
  log(...args): void;
}
interface GameInstance {
  onStart(): void;
  onAction(playerId, action): void;
  onPlayerLeave(playerId): void;
  onTick?(dtMs): void;                     // realtime 게임만
  getStateView(playerId): unknown;         // 플레이어별 보이는 상태(비공개 정보 분기)
}
interface GameModule { meta: GameMeta; create(ctx): GameInstance; }
```

### 클라이언트 측 (`@mg/game-sdk/client`)
```ts
interface GameClientContext { me; players; mount: HTMLElement; sendAction(action); }
interface GameClient { onState(state); onEvent(event, payload); onEnd?(result); destroy(); }
interface GameClientModule { meta: GameMeta; create(ctx): GameClient; }
```

## 5. 통신 프로토콜 (요약)

Client→Server: `session:hello`, `lobby:list`, `room:create`, `room:join`, `room:leave`,
`room:ready`, `room:start`(host), `room:kick`(host), `chat:message`, `game:action`

Server→Client: `lobby:update`, `room:update`, `room:closed`, `game:start`, `game:state`,
`game:event`, `game:end`, `chat:message`, `error`

## 6. 룸 생명주기

```
WAITING ──(host start: 인원>=min & 전원 ready)──> IN_GAME ──(endGame)──> WAITING
```
- 방장(host)이 시작/강퇴/통제. 방장 이탈 시 다음 멤버로 자동 위임.
- IN_GAME 중 입장은 차단(추후 관전 지원). 재접속은 grace(30s) 내 동일 슬롯 복귀 + 상태 재동기화.

## 7. 캐치마인드 설계

페이즈: `CHOOSING`(제시어 후보 3개 중 선택, 15s) → `DRAWING`(그림+추측, 60s) → `REVEAL`(정답·점수, 6s) → 다음 출제자.

- **실시간 그림**: 좌표 0~1 정규화, ~50ms 배칭, 증분 segment를 `emit('draw')`로 전송. 누적 strokes는 재접속 복원용으로 state에 포함.
- **비공개 정보**: 제시어/후보는 출제자에게만(`getStateView` 분기). REVEAL에서 전원 공개.
- **추측**: `game:action {type:'guess'}` → 서버 판정. 정답은 스포 방지 위해 본문 숨기고 `correct` 이벤트, 오답은 `guess` 이벤트로 노출.
- **점수**: 정답 순서 차등(빠를수록↑) + 출제자는 맞힌 인원 비례 보너스. 누적 점수로 최종 순위.
- **엣지**: 출제자 이탈→라운드 종료, 인원<2→조기 종료, 재접속→strokes·역할 복원.

## 8. 로드맵

| Phase | 내용 | 상태 |
|-------|------|------|
| 0 | pnpm 모노레포 + shared 프로토콜 | ✅ |
| 1 | 코어: 접속·세션·로비·방장 룸·채팅 | ✅ |
| 2 | game-sdk 확정 + 캐치마인드(플로우+그림+추측+점수) | ✅ |
| 3 | 눈치게임 추가 (순발력·동시입력, onTick 첫 사용) | ✅ |
| 4 | 스피드 퀴즈 추가 (동시참여·라운드) | 예정 |
| 5 | 관전·결과화면·로비 폴리시 | 예정 |

## 7-B. 눈치게임 설계 (Phase 3)

페이즈: `COUNTDOWN`(3s) → `PLAYING`(외치기, 최대 25s) → `ROUND_RESULT`(4.5s) → 다음 라운드(총 3라운드).

- **동시입력 충돌 판정**: 첫 외침이 들어오면 `WINDOW_MS`(220ms) 윈도우가 열리고, 서버 `onTick`(30Hz)이 매 틱 경과를 검사해 윈도우를 정산. 1명이면 성공(+10점, 순서 부여), 2명 이상이면 전원 탈락(clash).
- **onTick 최초 사용**: 실시간 루프로 타이밍 민감 이벤트(충돌 윈도우/제한시간)를 폴링. 페이즈 전환은 `setTimer`.
- **패자 규칙**: 라운드 종료 시 마지막까지 못 외친 1인이 패배(0점). 충돌 탈락자도 0점.
- **비공개 정보 없음**: 모두 같은 상태를 보되, 윈도우 진행 중엔 누가 눌렀는지 숨겨(pushState 보류) 긴장 유지.

## 9. 실행

```bash
pnpm install
pnpm dev          # 서버(3000) + 클라이언트(5173) 동시 실행
# 서버만: pnpm dev:server / 클라만: pnpm dev:client
```
