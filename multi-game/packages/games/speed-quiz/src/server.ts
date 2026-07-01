/** 스피드 퀴즈 서버 로직 (GameInstance 구현) — 동시 참여, 속도 보너스 점수 */
import type { GameContext, GameInstance, GameModule, TimerHandle } from '@mg/game-sdk';
import { buildRankings, shuffle } from '@mg/game-sdk';
import { meta } from './meta';
import { QUESTIONS, type Question } from './questions';

const QUESTION_MS = 15_000;
const REVEAL_MS = 4_500;
const NUM_Q = 5;
const BASE_POINTS = 500;
const SPEED_POINTS = 500; // 남은 시간 비례 보너스

type Phase = 'QUESTION' | 'REVEAL';

class SpeedQuiz implements GameInstance {
  private phase: Phase = 'QUESTION';
  private qIndex = 0;
  private total = NUM_Q;
  private quiz: Question[] = [];
  private answers: Record<string, { choice: number; at: number }> = {};
  private lastDelta: Record<string, number> = {};
  private scores: Record<string, number> = {};
  private qStart = 0;
  private phaseEndsAt = 0;
  private timer: TimerHandle | null = null;

  constructor(private readonly ctx: GameContext) {}

  private players() {
    return this.ctx.players;
  }
  private nick(id: string) {
    return this.players().find((p) => p.id === id)?.nickname ?? '???';
  }
  private cur(): Question | undefined {
    return this.quiz[this.qIndex - 1];
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
    this.quiz = shuffle(QUESTIONS).slice(0, Math.min(NUM_Q, QUESTIONS.length));
    this.total = this.quiz.length;
    for (const p of this.players()) this.scores[p.id] = 0;
    this.qIndex = 0;
    this.nextQuestion();
  }

  private nextQuestion() {
    this.qIndex++;
    if (this.qIndex > this.total || this.players().length < 1) {
      this.finish();
      return;
    }
    this.phase = 'QUESTION';
    this.answers = {};
    this.lastDelta = {};
    this.qStart = Date.now();
    this.ctx.emit('question', { index: this.qIndex, total: this.total });
    this.setPhaseTimer(QUESTION_MS, () => this.reveal());
    this.ctx.pushState();
  }

  onAction(pid: string, action: unknown) {
    const a = action as { type?: string; choice?: number };
    if (a?.type !== 'answer' || this.phase !== 'QUESTION' || this.answers[pid]) return;
    const q = this.cur();
    if (!q) return;
    const c = Number(a.choice);
    if (!Number.isInteger(c) || c < 0 || c >= q.choices.length) return;
    this.answers[pid] = { choice: c, at: Date.now() };
    this.ctx.emit('answered', { playerId: pid, nickname: this.nick(pid) });
    if (Object.keys(this.answers).length >= this.players().length) this.reveal();
    else this.ctx.pushState();
  }

  private reveal() {
    if (this.phase !== 'QUESTION') return;
    this.phase = 'REVEAL';
    const q = this.cur()!;
    for (const [pid, ans] of Object.entries(this.answers)) {
      if (ans.choice === q.answer) {
        const ratio = Math.max(0, Math.min(1, 1 - (ans.at - this.qStart) / QUESTION_MS));
        const pts = BASE_POINTS + Math.round(SPEED_POINTS * ratio);
        this.scores[pid] = (this.scores[pid] ?? 0) + pts;
        this.lastDelta[pid] = pts;
      }
    }
    this.ctx.emit('reveal', { answerIndex: q.answer });
    this.setPhaseTimer(REVEAL_MS, () => this.nextQuestion());
    this.ctx.pushState();
  }

  onPlayerLeave(pid: string) {
    delete this.scores[pid];
    delete this.answers[pid];
    delete this.lastDelta[pid];
    if (this.players().length < 1) {
      this.finish();
      return;
    }
    if (this.phase === 'QUESTION' && Object.keys(this.answers).length >= this.players().length) {
      this.reveal();
      return;
    }
    this.ctx.pushState();
  }

  private finish() {
    this.clearTimer();
    this.ctx.endGame({ rankings: buildRankings(this.scores, this.players()) });
  }

  getStateView(pid: string) {
    const q = this.cur();
    const ans = this.answers[pid];
    const reveal = this.phase === 'REVEAL';
    return {
      phase: this.phase,
      qIndex: this.qIndex,
      totalQuestions: this.total,
      question: q ? { text: q.q, choices: q.choices } : { text: '', choices: [] },
      answerIndex: reveal && q ? q.answer : null,
      me: {
        answered: !!ans,
        choice: ans?.choice ?? null,
        delta: reveal ? this.lastDelta[pid] ?? 0 : null,
        correct: reveal && q ? ans?.choice === q.answer : null,
      },
      answeredCount: Object.keys(this.answers).length,
      totalPlayers: this.players().length,
      choiceCounts:
        reveal && q ? q.choices.map((_, i) => Object.values(this.answers).filter((x) => x.choice === i).length) : null,
      scores: this.players()
        .map((p) => ({ playerId: p.id, nickname: p.nickname, score: this.scores[p.id] ?? 0 }))
        .sort((a, b) => b.score - a.score),
      phaseEndsAt: this.phaseEndsAt,
      now: Date.now(),
    };
  }
}

const gameModule: GameModule = {
  meta,
  create: (ctx) => new SpeedQuiz(ctx),
};

export default gameModule;
