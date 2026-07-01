/** GameInstance <-> 소켓 전송을 잇는 어댑터. 게임은 이 런타임이 주는 GameContext로만 통신한다.
 *  게임 코드의 모든 진입점을 try/catch로 감싸 한 게임의 예외가 서버 프로세스를 죽이지 않게 한다. */
import type { GameContext, GameInstance, GameModule } from '@mg/game-sdk';
import type { GameResult, Player } from '@mg/shared';

export interface RuntimeTransport {
  /** 특정 플레이어에게 game:state 전송 */
  pushState(playerId: string, state: unknown): void;
  /** 룸 전체에 game:event 전송 */
  emitEvent(event: string, payload: unknown): void;
  /** 특정 플레이어에게 game:event 전송 */
  emitEventTo(playerId: string, event: string, payload: unknown): void;
}

const TICK_MS = 1000 / 30;

export class GameRuntime {
  private instance: GameInstance;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private tick: ReturnType<typeof setInterval> | null = null;
  private ended = false;

  constructor(
    private readonly module: GameModule,
    private readonly getPlayers: () => Player[],
    private readonly getSpectators: () => string[],
    private readonly transport: RuntimeTransport,
    private readonly onEnd: (result: GameResult) => void,
  ) {
    const self = this;
    const pushOne = (id: string) => {
      try {
        self.transport.pushState(id, self.instance.getStateView(id));
      } catch (e) {
        // 한 뷰어의 getStateView 오류가 게임 전체를 막지 않도록 개별 격리
        console.error(`[game:${self.module.meta.id}] getStateView(${id}) 예외:`, e);
      }
    };
    const ctx: GameContext = {
      get players() {
        return self.getPlayers();
      },
      pushState() {
        for (const p of self.getPlayers()) pushOne(p.id);
        for (const specId of self.getSpectators()) pushOne(specId); // 관전자에게도 전송
      },
      emit(event, payload) {
        self.transport.emitEvent(event, payload ?? null);
      },
      emitTo(playerId, event, payload) {
        self.transport.emitEventTo(playerId, event, payload ?? null);
      },
      setTimer(ms, cb) {
        const h = setTimeout(() => {
          self.timers.delete(h);
          self.safe('timer', cb); // 페이즈 전환 콜백도 격리 (setTimeout 콜백의 예외는 프로세스 크래시)
        }, ms);
        self.timers.add(h);
        return h;
      },
      clearTimer(handle) {
        const h = handle as ReturnType<typeof setTimeout>;
        clearTimeout(h);
        self.timers.delete(h);
      },
      endGame(result) {
        self.finish(result);
      },
      log(...args) {
        console.log('[game]', ...args);
      },
    };
    this.instance = this.module.create(ctx);
  }

  /** 게임 코드 실행을 감싸 예외 발생 시 해당 룸만 안전 종료 */
  private safe(label: string, fn: () => void): void {
    if (this.ended) return;
    try {
      fn();
    } catch (e) {
      console.error(`[game:${this.module.meta.id}] ${label} 예외 → 게임 종료:`, e);
      this.fault();
    }
  }

  private fault(): void {
    if (this.ended) return;
    this.ended = true;
    this.dispose();
    try {
      this.onEnd({ rankings: [] }); // 결과 없이 룸을 대기 상태로 복구
    } catch (e) {
      console.error('[game] onEnd(fault) 예외:', e);
    }
  }

  start(): void {
    this.safe('onStart', () => this.instance.onStart());
    if (this.instance.onTick && this.module.meta.mode === 'realtime') {
      this.tick = setInterval(() => this.safe('onTick', () => this.instance.onTick!(TICK_MS)), TICK_MS);
    }
  }

  action(playerId: string, action: unknown): void {
    this.safe('onAction', () => this.instance.onAction(playerId, action));
  }

  playerLeft(playerId: string): void {
    this.safe('onPlayerLeave', () => this.instance.onPlayerLeave(playerId));
  }

  /** 재접속한 플레이어에게 현재 상태 1회 재전송 */
  resyncPlayer(playerId: string): void {
    if (this.ended) return;
    try {
      this.transport.pushState(playerId, this.instance.getStateView(playerId));
    } catch (e) {
      console.error(`[game:${this.module.meta.id}] resync(${playerId}) 예외:`, e);
    }
  }

  private finish(result: GameResult): void {
    if (this.ended) return;
    this.ended = true;
    this.dispose();
    try {
      this.onEnd(result);
    } catch (e) {
      console.error('[game] onEnd 예외:', e);
    }
  }

  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.tick) {
      clearInterval(this.tick);
      this.tick = null;
    }
  }
}
