/** GameInstance <-> 소켓 전송을 잇는 어댑터. 게임은 이 런타임이 주는 GameContext로만 통신한다. */
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
    private readonly transport: RuntimeTransport,
    private readonly onEnd: (result: GameResult) => void,
  ) {
    const self = this;
    const ctx: GameContext = {
      get players() {
        return self.getPlayers();
      },
      pushState() {
        for (const p of self.getPlayers()) {
          self.transport.pushState(p.id, self.instance.getStateView(p.id));
        }
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
          if (!self.ended) cb();
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

  start(): void {
    this.instance.onStart();
    if (this.instance.onTick && this.module.meta.mode === 'realtime') {
      this.tick = setInterval(() => {
        if (!this.ended) this.instance.onTick!(TICK_MS);
      }, TICK_MS);
    }
  }

  action(playerId: string, action: unknown): void {
    if (!this.ended) this.instance.onAction(playerId, action);
  }

  playerLeft(playerId: string): void {
    if (!this.ended) this.instance.onPlayerLeave(playerId);
  }

  /** 재접속한 플레이어에게 현재 상태 1회 재전송 */
  resyncPlayer(playerId: string): void {
    if (!this.ended) this.transport.pushState(playerId, this.instance.getStateView(playerId));
  }

  private finish(result: GameResult): void {
    if (this.ended) return;
    this.ended = true;
    this.dispose();
    this.onEnd(result);
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
