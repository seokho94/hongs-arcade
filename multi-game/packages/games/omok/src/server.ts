/** 오목 서버 로직 (GameInstance 구현) — 2인 턴제, 5목 승리 판정 */
import type { GameContext, GameInstance, GameModule, TimerHandle } from '@mg/game-sdk';
import { buildRankings, shuffle } from '@mg/game-sdk';
import { meta } from './meta';

const SIZE = 15;
const MOVE_MS = 45_000; // 한 수 제한시간 (초과 시 패배)
const OVER_MS = 6_000; // 승패 표시 후 결과까지

type Phase = 'PLAYING' | 'OVER';
interface Cell {
  x: number;
  y: number;
}

class Omok implements GameInstance {
  private board: number[][]; // 0 빈칸, 1 흑(선), 2 백
  private phase: Phase = 'PLAYING';
  private order: string[] = []; // [흑, 백]
  private turnIdx = 0;
  private moveCount = 0;
  private last: Cell | null = null;
  private winner: string | null = null;
  private winLine: Cell[] | null = null;
  private draw = false;
  private phaseEndsAt = 0;
  private timer: TimerHandle | null = null;

  constructor(private readonly ctx: GameContext) {
    this.board = Array.from({ length: SIZE }, () => new Array<number>(SIZE).fill(0));
  }

  private players() {
    return this.ctx.players;
  }
  private nick(id: string) {
    return this.players().find((p) => p.id === id)?.nickname ?? '???';
  }
  private colorOf(id: string) {
    const i = this.order.indexOf(id);
    return i < 0 ? 0 : i + 1;
  }
  private curId() {
    return this.order[this.turnIdx] ?? '';
  }
  private clearTimer() {
    if (this.timer != null) {
      this.ctx.clearTimer(this.timer);
      this.timer = null;
    }
  }
  private setTimer(ms: number, cb: () => void) {
    this.clearTimer();
    this.phaseEndsAt = Date.now() + ms;
    this.timer = this.ctx.setTimer(ms, () => {
      this.timer = null;
      cb();
    });
  }

  onStart() {
    this.order = shuffle(this.players().map((p) => p.id)).slice(0, 2);
    this.turnIdx = 0;
    this.phase = 'PLAYING';
    this.ctx.emit('start', { black: this.order[0], white: this.order[1] });
    this.setTimer(MOVE_MS, () => this.timeout());
    this.ctx.pushState();
  }

  onAction(pid: string, action: unknown) {
    const a = action as { type?: string; x?: number; y?: number };
    if (a?.type !== 'place' || this.phase !== 'PLAYING' || pid !== this.curId()) return;
    const x = Number(a.x);
    const y = Number(a.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    if (this.board[y]![x] !== 0) return;

    const color = this.colorOf(pid);
    this.board[y]![x] = color;
    this.moveCount++;
    this.last = { x, y };

    const line = this.checkWin(x, y, color);
    if (line) {
      this.winner = pid;
      this.winLine = line;
      this.over();
      return;
    }
    if (this.moveCount >= SIZE * SIZE) {
      this.draw = true;
      this.over();
      return;
    }
    this.turnIdx = 1 - this.turnIdx;
    this.ctx.emit('move', { x, y, color, nickname: this.nick(pid) });
    this.setTimer(MOVE_MS, () => this.timeout());
    this.ctx.pushState();
  }

  private timeout() {
    if (this.phase !== 'PLAYING') return;
    const loser = this.curId();
    this.winner = this.order.find((id) => id !== loser) ?? null;
    this.ctx.emit('timeout', { loser: this.nick(loser) });
    this.over();
  }

  private over() {
    this.phase = 'OVER';
    this.clearTimer();
    this.ctx.emit('over', {
      winner: this.winner,
      winnerNick: this.winner ? this.nick(this.winner) : null,
      draw: this.draw,
      winLine: this.winLine,
    });
    this.setTimer(OVER_MS, () => this.finish());
    this.ctx.pushState();
  }

  private finish() {
    this.clearTimer();
    const scores: Record<string, number> = {};
    for (const p of this.players()) scores[p.id] = this.winner === p.id ? 1 : 0;
    this.ctx.endGame({ rankings: buildRankings(scores, this.players()) });
  }

  onPlayerLeave(pid: string) {
    if (this.phase === 'OVER') return;
    if (this.order.includes(pid)) {
      this.winner = this.order.find((id) => id !== pid && this.players().some((p) => p.id === id)) ?? null;
      this.ctx.emit('left', { nickname: this.nick(pid) });
      this.over();
    } else {
      this.ctx.pushState();
    }
  }

  private checkWin(x: number, y: number, color: number): Cell[] | null {
    const dirs = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ];
    for (const [dx, dy] of dirs) {
      const line: Cell[] = [{ x, y }];
      let cx = x + dx!;
      let cy = y + dy!;
      while (cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE && this.board[cy]![cx] === color) {
        line.push({ x: cx, y: cy });
        cx += dx!;
        cy += dy!;
      }
      cx = x - dx!;
      cy = y - dy!;
      while (cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE && this.board[cy]![cx] === color) {
        line.unshift({ x: cx, y: cy });
        cx -= dx!;
        cy -= dy!;
      }
      if (line.length >= 5) return line;
    }
    return null;
  }

  getStateView(pid: string) {
    const cur = this.curId();
    return {
      size: SIZE,
      phase: this.phase,
      board: this.board,
      black: this.order[0] ? { id: this.order[0], nickname: this.nick(this.order[0]) } : null,
      white: this.order[1] ? { id: this.order[1], nickname: this.nick(this.order[1]) } : null,
      currentId: cur,
      currentNick: cur ? this.nick(cur) : null,
      myColor: this.colorOf(pid), // 0 = 관전자
      isMyTurn: pid === cur && this.phase === 'PLAYING',
      last: this.last,
      moveCount: this.moveCount,
      winner: this.winner,
      winnerNick: this.winner ? this.nick(this.winner) : null,
      winLine: this.winLine,
      draw: this.draw,
      phaseEndsAt: this.phaseEndsAt,
      now: Date.now(),
    };
  }
}

const gameModule: GameModule = {
  meta,
  create: (ctx) => new Omok(ctx),
};

export default gameModule;
