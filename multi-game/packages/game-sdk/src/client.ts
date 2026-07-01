/** 클라이언트 측 게임 모듈이 구현/사용하는 계약 (브라우저 DOM 사용) */
import type { GameMeta, GameResult, Player } from '@mg/shared';

export interface GameClientContext {
  /** 내 정보 */
  readonly me: Player;
  /** 시작 시점의 참가자 목록 */
  readonly players: Player[];
  /** 게임 UI를 그릴 DOM 컨테이너 */
  readonly mount: HTMLElement;
  /** 내 의도를 서버로 전송 (game:action 봉투에 담겨 감) */
  sendAction(action: unknown): void;
}

export interface GameClient {
  /** 서버 game:state (pushState) 수신 → 렌더 갱신 */
  onState(state: unknown): void;
  /** 서버 game:event (emit) 수신 → 일회성 처리 */
  onEvent(event: string, payload: unknown): void;
  /** 게임 종료 결과 (선택) */
  onEnd?(result: GameResult): void;
  /** 화면 전환 시 정리 */
  destroy(): void;
}

export interface GameClientModule {
  meta: GameMeta;
  create(ctx: GameClientContext): GameClient;
}
