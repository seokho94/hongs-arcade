/** 연타 달리기 서버 로직 — 연타로 전진, 결승 도착 순서로 순위 */
import type { GameContext, GameInstance, GameModule, TimerHandle } from '@mg/game-sdk';
import type { RankingEntry } from '@mg/shared';
import { meta } from './meta';

const COUNTDOWN_MS = 3_000;
const RACE_MS = 30_000; // 제한시간(미도착자는 거리순)
const RESULT_MS = 4_500;
const GOAL = 80; // 결승까지 필요한 연타수
const STEP = 1;
const MIN_INTERVAL = 45;
const PUSH_MS = 90;

type Phase = 'COUNTDOWN' | 'RACING' | 'RESULT';

class MashRace implements GameInstance {
  private phase: Phase = 'COUNTDOWN';
  private dist: Record<string, number> = {};
  private place: Record<string, number> = {};
  private finishOrder: string[] = [];
  private lastPress: Record<string, number> = {};
  private phaseEndsAt = 0;
  private lastPush = 0;
  private timer: TimerHandle | null = null;

  constructor(private readonly ctx: GameContext) {}

  private players() {
    return this.ctx.players;
  }
  private nick(id: string) {
    return this.players().find((p) => p.id === id)?.nickname ?? '???';
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
      this.dist[p.id] = 0;
      this.lastPress[p.id] = 0;
    }
    this.phase = 'COUNTDOWN';
    this.ctx.emit('countdown', {});
    this.setPhaseTimer(COUNTDOWN_MS, () => this.beginRace());
    this.ctx.pushState();
  }

  private beginRace() {
    this.phase = 'RACING';
    this.lastPush = Date.now();
    this.setPhaseTimer(RACE_MS, () => this.toResult());
    this.ctx.emit('go', {});
    this.ctx.pushState();
  }

  onAction(pid: string, action: unknown) {
    const a = action as { type?: string };
    if (a?.type !== 'press' || this.phase !== 'RACING' || this.place[pid] != null) return;
    const now = Date.now();
    if (now - (this.lastPress[pid] ?? 0) < MIN_INTERVAL) return;
    this.lastPress[pid] = now;
    this.dist[pid] = (this.dist[pid] ?? 0) + STEP;
    if (this.dist[pid]! >= GOAL) {
      this.dist[pid] = GOAL;
      this.finishOrder.push(pid);
      this.place[pid] = this.finishOrder.length;
      this.ctx.emit('finish', { playerId: pid, nickname: this.nick(pid), place: this.place[pid] });
      if (this.players().every((p) => this.place[p.id] != null)) {
        this.toResult();
        return;
      }
      this.ctx.pushState();
    }
  }

  onTick() {
    if (this.phase !== 'RACING') return;
    const now = Date.now();
    if (now - this.lastPush >= PUSH_MS) {
      this.lastPush = now;
      this.ctx.pushState();
    }
  }

  private toResult() {
    if (this.phase === 'RESULT') return;
    this.phase = 'RESULT';
    this.ctx.emit('raceend', {});
    this.setPhaseTimer(RESULT_MS, () => this.finish());
    this.ctx.pushState();
  }

  private finish() {
    this.clearTimer();
    const nonFinishers = this.players()
      .map((p) => p.id)
      .filter((id) => this.place[id] == null)
      .sort((a, b) => (this.dist[b] ?? 0) - (this.dist[a] ?? 0));
    const order = [...this.finishOrder, ...nonFinishers];
    const rankings: RankingEntry[] = order.map((id, i) => ({
      playerId: id,
      nickname: this.nick(id),
      score: this.place[id] != null ? 100 : Math.round(((this.dist[id] ?? 0) / GOAL) * 100),
      rank: i + 1,
    }));
    this.ctx.endGame({ rankings });
  }

  onPlayerLeave(pid: string) {
    delete this.dist[pid];
    delete this.lastPress[pid];
    delete this.place[pid];
    this.finishOrder = this.finishOrder.filter((id) => id !== pid);
    if (this.players().length < 1) {
      this.finish();
      return;
    }
    if (this.phase === 'RACING' && this.players().every((p) => this.place[p.id] != null)) {
      this.toResult();
      return;
    }
    this.ctx.pushState();
  }

  getStateView(_pid: string) {
    return {
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      now: Date.now(),
      goal: GOAL,
      racers: this.players().map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        dist: Math.min(GOAL, this.dist[p.id] ?? 0),
        place: this.place[p.id] ?? null,
      })),
    };
  }
}

const gameModule: GameModule = {
  meta,
  create: (ctx) => new MashRace(ctx),
};

export default gameModule;
