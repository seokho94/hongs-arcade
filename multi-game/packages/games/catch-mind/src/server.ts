/** 캐치마인드 서버 로직 (GameInstance 구현) */
import type { GameContext, GameInstance, GameModule, TimerHandle } from '@mg/game-sdk';
import { buildRankings, normalize, shuffle } from '@mg/game-sdk';
import { meta } from './meta';
import { WORDS } from './words';

const CHOOSE_MS = 15_000;
const DRAW_MS = 60_000;
const REVEAL_MS = 6_000;
const ROUNDS_PER_PLAYER = 1;

type Phase = 'CHOOSING' | 'DRAWING' | 'REVEAL';

interface Point {
  x: number;
  y: number;
}
interface Stroke {
  points: Point[];
  color: string;
  width: number;
}

class CatchMind implements GameInstance {
  private phase: Phase = 'CHOOSING';
  private round = 0;
  private totalRounds = 0;
  private drawerOrder: string[] = [];
  private drawerId = '';
  private word = '';
  private wordChoices: string[] = [];
  private strokes: Stroke[] = [];
  private correct = new Set<string>();
  private scores: Record<string, number> = {};
  private phaseEndsAt = 0;
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

  onStart(): void {
    const ids = this.players().map((p) => p.id);
    this.drawerOrder = shuffle(ids);
    this.totalRounds = ids.length * ROUNDS_PER_PLAYER;
    for (const id of ids) this.scores[id] = 0;
    this.startRound();
  }

  private startRound(): void {
    this.round++;
    if (this.round > this.totalRounds || this.players().length < 2) {
      this.finish();
      return;
    }
    this.drawerId = this.drawerOrder[(this.round - 1) % this.drawerOrder.length]!;
    if (!this.players().some((p) => p.id === this.drawerId)) {
      // 출제 예정자가 이미 나감 → 다음 라운드로
      this.startRound();
      return;
    }
    this.phase = 'CHOOSING';
    this.word = '';
    this.wordChoices = shuffle(WORDS).slice(0, 3);
    this.strokes = [];
    this.correct.clear();
    this.ctx.emit('round:start', {
      round: this.round,
      totalRounds: this.totalRounds,
      drawerId: this.drawerId,
      drawerNick: this.nick(this.drawerId),
    });
    this.setPhaseTimer(CHOOSE_MS, () => this.autoPick());
    this.ctx.pushState();
  }

  private autoPick(): void {
    if (this.phase !== 'CHOOSING') return;
    const idx = Math.floor(Math.random() * this.wordChoices.length);
    this.beginDrawing(this.wordChoices[idx]!);
  }

  private beginDrawing(word: string): void {
    this.word = word;
    this.phase = 'DRAWING';
    this.ctx.emit('draw:start', {});
    this.setPhaseTimer(DRAW_MS, () => this.endRound());
    this.ctx.pushState();
  }

  onAction(playerId: string, action: unknown): void {
    const a = action as { type?: string; word?: string; segment?: unknown; text?: string };
    if (!a || typeof a.type !== 'string') return;
    switch (a.type) {
      case 'chooseWord':
        if (
          playerId === this.drawerId &&
          this.phase === 'CHOOSING' &&
          typeof a.word === 'string' &&
          this.wordChoices.includes(a.word)
        ) {
          this.beginDrawing(a.word);
        }
        break;
      case 'draw':
        if (playerId === this.drawerId && this.phase === 'DRAWING') {
          const seg = sanitizeStroke(a.segment);
          if (seg) {
            this.strokes.push(seg);
            this.ctx.emit('draw', seg);
          }
        }
        break;
      case 'clear':
        if (playerId === this.drawerId && this.phase === 'DRAWING') {
          this.strokes = [];
          this.ctx.emit('clear', {});
        }
        break;
      case 'guess':
        this.handleGuess(playerId, String(a.text ?? ''));
        break;
    }
  }

  private handleGuess(playerId: string, text: string): void {
    if (this.phase !== 'DRAWING' || playerId === this.drawerId || this.correct.has(playerId)) return;
    const t = text.trim();
    if (!t) return;
    if (normalize(t) === normalize(this.word)) {
      this.correct.add(playerId);
      const order = this.correct.size; // 1번째, 2번째...
      const pts = Math.max(40, 110 - order * 10);
      this.scores[playerId] = (this.scores[playerId] ?? 0) + pts;
      this.ctx.emit('correct', { playerId, nickname: this.nick(playerId), order });
      const guessers = this.players().filter((p) => p.id !== this.drawerId);
      if (guessers.length > 0 && guessers.every((p) => this.correct.has(p.id))) {
        this.endRound();
      } else {
        this.ctx.pushState();
      }
    } else {
      this.ctx.emit('guess', { playerId, nickname: this.nick(playerId), text: t });
    }
  }

  private endRound(): void {
    if (this.phase === 'REVEAL') return;
    this.phase = 'REVEAL';
    const bonus = this.correct.size * 30;
    if (bonus > 0) this.scores[this.drawerId] = (this.scores[this.drawerId] ?? 0) + bonus;
    this.ctx.emit('round:end', {
      word: this.word,
      correct: [...this.correct],
      drawerBonus: bonus,
    });
    this.setPhaseTimer(REVEAL_MS, () => this.startRound());
    this.ctx.pushState();
  }

  onPlayerLeave(playerId: string): void {
    delete this.scores[playerId];
    if (this.players().length < 2) {
      this.finish();
      return;
    }
    if (playerId === this.drawerId && this.phase !== 'REVEAL') {
      this.ctx.emit('drawer:left', {});
      this.endRound();
    } else {
      this.ctx.pushState();
    }
  }

  private finish(): void {
    this.clearTimer();
    this.ctx.endGame({ rankings: buildRankings(this.scores, this.players()) });
  }

  getStateView(playerId: string): unknown {
    const isDrawer = playerId === this.drawerId;
    const reveal = this.phase === 'REVEAL';
    const wordLen = this.word ? this.word.replace(/\s/g, '').length : 0;
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      drawerId: this.drawerId,
      drawerNick: this.nick(this.drawerId),
      isDrawer,
      word: isDrawer || reveal ? this.word : null,
      wordLength: wordLen,
      wordChoices: isDrawer && this.phase === 'CHOOSING' ? this.wordChoices : null,
      strokes: this.strokes,
      correct: [...this.correct],
      iAmCorrect: this.correct.has(playerId),
      scores: this.players()
        .map((p) => ({ playerId: p.id, nickname: p.nickname, score: this.scores[p.id] ?? 0 }))
        .sort((x, y) => y.score - x.score),
      phaseEndsAt: this.phaseEndsAt,
      now: Date.now(),
    };
  }
}

function clamp01(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function clampNum(v: unknown, min: number, max: number, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return n < min ? min : n > max ? max : n;
}
function sanitizeStroke(seg: unknown): Stroke | null {
  const s = seg as { points?: unknown; color?: unknown; width?: unknown };
  if (!s || !Array.isArray(s.points)) return null;
  const points: Point[] = s.points
    .slice(0, 500)
    .map((pt: unknown) => {
      const p = pt as { x?: unknown; y?: unknown };
      return { x: clamp01(p?.x), y: clamp01(p?.y) };
    });
  if (points.length === 0) return null;
  return {
    points,
    color: typeof s.color === 'string' ? s.color.slice(0, 16) : '#222222',
    width: clampNum(s.width, 1, 40, 4),
  };
}

const gameModule: GameModule = {
  meta,
  create: (ctx) => new CatchMind(ctx),
};

export default gameModule;
