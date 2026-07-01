/** 서버 측 게임 모듈이 구현/사용하는 계약 */
import type { GameMeta, GameResult, Player } from '@mg/shared';

/** setTimer가 돌려주는 핸들 (런타임 내부 구현에 의존하지 않도록 불투명 타입) */
export type TimerHandle = unknown;

/**
 * 플랫폼이 게임 인스턴스에 주입하는 "대화 창구".
 * 게임은 Socket.IO를 직접 만지지 않고 오직 이 콜백으로만 외부와 통신한다.
 */
export interface GameContext {
  /** 현재 게임에 참여 중인 플레이어 목록 (실시간 반영) */
  readonly players: Player[];

  /** 각 플레이어에게 getStateView(playerId) 결과를 game:state 로 전송 */
  pushState(): void;

  /** 룸 전체에 일회성(ephemeral) 이벤트 전송 (그림 조각, 정답 알림 등) */
  emit(event: string, payload?: unknown): void;

  /** 특정 플레이어에게만 일회성 이벤트 전송 */
  emitTo(playerId: string, event: string, payload?: unknown): void;

  /** 페이즈 전환용 타이머 (게임 종료 시 자동 정리됨) */
  setTimer(ms: number, cb: () => void): TimerHandle;
  clearTimer(handle: TimerHandle): void;

  /** 게임 종료 선언 → 코어가 룸을 정리하고 결과를 브로드캐스트 */
  endGame(result: GameResult): void;

  log(...args: unknown[]): void;
}

/** 한 룸에서 진행되는 게임 한 판 */
export interface GameInstance {
  /** 게임 시작 시 1회 호출 */
  onStart(): void;
  /** 클라이언트 game:action 수신 (검증은 게임 책임) */
  onAction(playerId: string, action: unknown): void;
  /** 진행 중 플레이어 이탈 */
  onPlayerLeave(playerId: string): void;
  /** realtime 게임의 서버 루프 (없으면 이벤트/타이머 구동) */
  onTick?(dtMs: number): void;
  /** 플레이어별로 보이는 상태 (비공개 정보 분기) */
  getStateView(playerId: string): unknown;
}

/** 게임 패키지가 export 하는 최종 형태 */
export interface GameModule {
  meta: GameMeta;
  create(ctx: GameContext): GameInstance;
}
