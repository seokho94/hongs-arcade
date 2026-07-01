/** 눈치게임 서버 로직 (GameInstance 구현) — onTick으로 동시입력 충돌 윈도우를 판정 */
import type { GameContext, GameInstance, GameModule, TimerHandle } from '@mg/game-sdk';
import { buildRankings } from '@mg/game-sdk';
import { meta } from './meta';

const COUNTDOWN_MS = 3_000;
const WINDOW_MS = 220; // 이 시간 안에 2명 이상 누르면 동시 외침 → 탈락
const ROUND_TIME_MS = 25_000; // 라운드 안전 제한시간
const RESULT_MS = 4_500;
const TOTAL_ROUNDS = 3;
const CALL_POINTS = 10;

type Phase = 'COUNTDOWN' | 'PLAYING' | 'ROUND_RESULT';
type Status = 'alive' | 'called' | 'clashed';

class Nunchi implements GameInstance {
  private phase: Phase = 'COUNTDOWN';
  private round = 0;
  private totalRounds = TOTAL_ROUNDS;
  private status: Record<string, Status> = {};
  private calledOrder: { id: string; order: number }[] = [];
  private callCount = 0;
  private scores: Record<string, number> = {};
  private phaseEndsAt = 0;
  private roundLoserId: string | null = null;
  private roundClashers: string[] = [];
  private timer: TimerHandle | null = null;

  // 동시입력 판정 윈도우
  private windowOpen = false;
  private windowStart = 0;
  private pressers = new Set<string>();

  constructor(private readonly ctx: GameContext) {}

  private players() {
    return this.ctx.players;
  }
  private nick(id: string) {
    return this.players().find((p) => p.id === id)?.nickname ?? '???';
  }
  private aliveIds() {
    return this.players()
      .map((p) => p.id)
      .filter((id) => (this.status[id] ?? 'alive') === 'alive');
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
    for (const p of this.players()) this.scores[p.id] = 0;
    this.totalRounds = TOTAL_ROUNDS;
    this.round = 0;
    this.startRound();
  }

  private startRound() {
    this.round++;
    if (this.round > this.totalRounds || this.players().length < 2) {
      this.finish();
      return;
    }
    this.phase = 'COUNTDOWN';
    this.status = {};
    for (const p of this.players()) this.status[p.id] = 'alive';
    this.calledOrder = [];
    this.callCount = 0;
    this.roundLoserId = null;
    this.roundClashers = [];
    this.windowOpen = false;
    this.pressers.clear();
    this.ctx.emit('round:start', { round: this.round, totalRounds: this.totalRounds });
    this.setPhaseTimer(COUNTDOWN_MS, () => this.beginPlaying());
    this.ctx.pushState();
  }

  private beginPlaying() {
    this.phase = 'PLAYING';
    this.windowOpen = false;
    this.pressers.clear();
    this.setPhaseTimer(ROUND_TIME_MS, () => this.endRoundByTimeout());
    this.ctx.emit('go', {});
    this.ctx.pushState();
  }

  onAction(pid: string, action: unknown) {
    const a = action as { type?: string };
    if (a?.type === 'press') this.handlePress(pid);
  }

  private handlePress(pid: string) {
    if (this.phase !== 'PLAYING') return;
    if ((this.status[pid] ?? 'alive') !== 'alive') return;
    if (this.pressers.has(pid)) return;
    this.pressers.add(pid);
    if (!this.windowOpen) {
      this.windowOpen = true;
      this.windowStart = Date.now();
    }
    // 윈도우 진행 중엔 pushState 하지 않는다(누가 눌렀는지 숨겨 긴장 유지)
  }

  onTick() {
    if (this.phase !== 'PLAYING') return;
    const now = Date.now();
    if (this.windowOpen && now - this.windowStart >= WINDOW_MS) {
      this.resolveWindow();
      return;
    }
    if (now >= this.phaseEndsAt) this.endRoundByTimeout();
  }

  private resolveWindow() {
    const pressers = [...this.pressers].filter((id) => (this.status[id] ?? 'alive') === 'alive');
    this.windowOpen = false;
    this.pressers.clear();
    if (pressers.length === 0) return;

    if (pressers.length === 1) {
      const id = pressers[0]!;
      this.status[id] = 'called';
      this.callCount++;
      this.calledOrder.push({ id, order: this.callCount });
      this.scores[id] = (this.scores[id] ?? 0) + CALL_POINTS;
      this.ctx.emit('call', { playerId: id, nickname: this.nick(id), order: this.callCount });
    } else {
      for (const id of pressers) {
        this.status[id] = 'clashed';
        this.roundClashers.push(id);
      }
      this.ctx.emit('clash', { players: pressers.map((id) => ({ playerId: id, nickname: this.nick(id) })) });
    }

    if (this.aliveIds().length <= 1) this.endRoundNatural();
    else this.ctx.pushState();
  }

  private endRoundNatural() {
    if (this.phase !== 'PLAYING') return;
    const alive = this.aliveIds();
    this.roundLoserId = alive.length === 1 ? alive[0]! : null;
    this.toResult();
  }

  private endRoundByTimeout() {
    if (this.phase !== 'PLAYING') return;
    const alive = this.aliveIds();
    this.roundLoserId = alive.length >= 1 ? alive[0]! : null;
    this.toResult();
  }

  private toResult() {
    this.phase = 'ROUND_RESULT';
    this.windowOpen = false;
    this.pressers.clear();
    this.ctx.emit('round:end', {
      loserId: this.roundLoserId,
      loserNick: this.roundLoserId ? this.nick(this.roundLoserId) : null,
      calls: this.calledOrder.map((c) => ({ ...c, nickname: this.nick(c.id) })),
      clashers: this.roundClashers.map((id) => ({ playerId: id, nickname: this.nick(id) })),
    });
    this.setPhaseTimer(RESULT_MS, () => this.startRound());
    this.ctx.pushState();
  }

  onPlayerLeave(pid: string) {
    delete this.scores[pid];
    if (this.status[pid]) this.status[pid] = 'clashed';
    this.pressers.delete(pid);
    if (this.players().length < 2) {
      this.finish();
      return;
    }
    if (this.phase === 'PLAYING' && this.aliveIds().length <= 1) {
      this.endRoundNatural();
      return;
    }
    this.ctx.pushState();
  }

  private finish() {
    this.clearTimer();
    this.ctx.endGame({ rankings: buildRankings(this.scores, this.players()) });
  }

  getStateView(pid: string) {
    const myStatus = this.status[pid] ?? 'alive';
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      callCount: this.callCount,
      phaseEndsAt: this.phaseEndsAt,
      now: Date.now(),
      players: this.players().map((p) => ({
        id: p.id,
        nickname: p.nickname,
        status: this.status[p.id] ?? 'alive',
        order: this.calledOrder.find((c) => c.id === p.id)?.order ?? null,
      })),
      scores: this.players()
        .map((p) => ({ playerId: p.id, nickname: p.nickname, score: this.scores[p.id] ?? 0 }))
        .sort((a, b) => b.score - a.score),
      me: { status: myStatus, canPress: this.phase === 'PLAYING' && myStatus === 'alive' },
      roundResult:
        this.phase === 'ROUND_RESULT'
          ? { loserId: this.roundLoserId, loserNick: this.roundLoserId ? this.nick(this.roundLoserId) : null }
          : null,
    };
  }
}

const gameModule: GameModule = {
  meta,
  create: (ctx) => new Nunchi(ctx),
};

export default gameModule;
