# Multi-Game

소켓(Socket.IO) 기반으로 다수 사용자가 함께 즐기는 미니게임 플랫폼.
코어(접속·로비·룸·채팅)는 고정, 미니게임은 독립 모듈로 추가/교체한다.

설계 문서: [`docs/design.md`](docs/design.md)

## 구조

```
packages/
├── shared/      # 프로토콜·공통 타입
├── game-sdk/    # 게임 모듈 인터페이스 (server: index / client: /client)
├── server/      # Socket.IO 서버 (코어)
├── client/      # 웹 클라이언트 (코어)
└── games/
    └── catch-mind/   # 캐치마인드 (첫 게임)
```

## 실행

```bash
pnpm install
pnpm dev            # 서버(http://localhost:3000) + 클라(http://localhost:5173) 동시
```

- 서버만: `pnpm dev:server`
- 클라만: `pnpm dev:client`

브라우저로 http://localhost:5173 접속 → 닉네임 입력 → 방 생성/입장 → 준비 → 시작.
캐치마인드는 최소 2명(테스트용)부터 시작 가능, 최대 10명까지 지원.

## 새 게임 추가

1. `packages/games/<game-id>/` 에 `meta.ts` / `server.ts` / `client.ts` 작성
2. `packages/server/src/games.ts` 와 `packages/client/src/games.ts` 레지스트리에 1줄 등록
3. 끝. 코어 코드는 건드리지 않는다.
