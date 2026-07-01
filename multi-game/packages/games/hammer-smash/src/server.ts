/** 망치 연타 서버 로직 — 연타 횟수 집계, 레이트 리밋, onTick으로 상태 스로틀 전송 */
import type { GameContext, GameInstance, GameModule, TimerHandle } from '@mg/game-sdk';
import { buildRankings } from '@mg/game-sdk';
import { meta } from './meta';

const COUNTDOWN_MS = 3_000;
const SMASH_MS = 10_000;
const RESULT_MS = 3_500;
const MIN_INTERVAL = 45; // 연타 최소 간격(ms) → 매크로/키 홀드 방지
const PUSH_MS = 180; // 리더보드 갱신 주기

type Phase = 'COUNTDOWN' | 'SMASHING' | 'RESULT';

class HammerSmash implements GameInstance {
  private phase: Phase = 'COUNTDOWN';
  private counts: Record<string, number> = {};
  private lastPress: Record<string, number> = {};
  private phaseEndsAt = 0;
  private lastPush = 0;
  private timer: TimerHandle | null = null;

  constructor(private readonly ctx: GameContext) {}

  private players() {
    return this.ctx.players;
  }
  private clearTimer() {
    if (this.timer != null) {
      this.ctx.clearTimer(this.timer);
      this.timer = null;
    }
  }
  private setPhaseTimer(ms: number, cb: () => void) {
    this.clearTimer();
    this.phaseEndsAt = Date.now() + ms;
    this.timer = this.ctx.setTimer(ms, () => {
      this.timer = null;
      cb();
    });
  }

  onStart() {
    for (const p of this.players()) {
      this.counts[p.id] = 0;
      this.lastPress[p.id] = 0;
    }
    this.phase = 'COUNTDOWN';
    this.ctx.emit('countdown', {});
    this.setPhaseTimer(COUNTDOWN_MS, () => this.beginSmash());
    this.ctx.pushState();
  }

  private beginSmash() {
    this.phase = 'SMASHING';
    this.lastPush = Date.now();
    this.setPhaseTimer(SMASH_MS, () => this.toResult());
    this.ctx.emit('go', {});
    this.ctx.pushState();
  }

  onAction(pid: string, action: unknown) {
    const a = action as { type?: string };
    if (a?.type !== 'press' || this.phase !== 'SMASHING') return;
    const now = Date.now();
    if (now - (this.lastPress[pid] ?? 0) < MIN_INTERVAL) return; // 레이트 리밋
    this.lastPress[pid] = now;
    this.counts[pid] = (this.counts[pid] ?? 0) + 1;
    // pushState는 onTick에서 스로틀 (연타마다 보내면 과부하)
  }

  onTick() {
    if (this.phase !== 'SMASHING') return;
    const now = Date.now();
    if (now - this.lastPush >= PUSH_MS) {
      this.lastPush = now;
      this.ctx.pushState();
    }
  }

  private toResult() {
    this.phase = 'RESULT';
    this.ctx.emit('timeup', {});
    this.setPhaseTimer(RESULT_MS, () => this.finish());
    this.ctx.pushState();
  }

  private finish() {
    this.clearTimer();
    this.ctx.endGame({ rankings: buildRankings(this.counts, this.players()) });
  }

  onPlayerLeave(pid: string) {
    delete this.counts[pid];
    delete this.lastPress[pid];
    if (this.players().length < 1) {
      this.finish();
      return;
    }
    this.ctx.pushState();
  }

  getStateView(pid: string) {
    return {
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      now: Date.now(),
      myCount: this.counts[pid] ?? 0,
      ranks: this.players()
        .map((p) => ({ playerId: p.id, nickname: p.nickname, count: this.counts[p.id] ?? 0 }))
        .sort((a, b) => b.count - a.count),
      totalPlayers: this.players().length,
    };
  }
}

const gameModule: GameModule = {
  meta,
  create: (ctx) => new HammerSmash(ctx),
};

export default gameModule;
