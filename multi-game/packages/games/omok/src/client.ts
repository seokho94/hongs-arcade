/** 오목 클라이언트 (GameClient 구현) — 캔버스 바둑판 */
import type { GameClient, GameClientContext, GameClientModule } from '@mg/game-sdk/client';
import { meta } from './meta';

interface Cell { x: number; y: number; }
interface Side { id: string; nickname: string; }
interface State {
  size: number;
  phase: 'PLAYING' | 'OVER';
  board: number[][];
  black: Side | null;
  white: Side | null;
  currentId: string;
  currentNick: string | null;
  myColor: number;
  isMyTurn: boolean;
  last: Cell | null;
  moveCount: number;
  winner: string | null;
  winnerNick: string | null;
  winLine: Cell[] | null;
  draw: boolean;
  phaseEndsAt: number;
  now: number;
}

const PX = 560;
const MARGIN = 30;
const STONE = ['', '#ff2e97', '#00eaff']; // 1=흑(마젠타), 2=백(시안)

const STYLE = `
.ok{font-family:var(--kr,'Galmuri11',monospace);color:var(--text,#eaeaff)}
.ok-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.ok-top .pill{font-family:var(--pixel,'Press Start 2P',monospace);font-size:10px;background:rgba(0,234,255,.1);border:1px solid var(--cyan,#00eaff);color:var(--cyan,#00eaff);border-radius:6px;padding:6px 10px;text-shadow:0 0 6px rgba(0,234,255,.5)}
.ok-timer{font-family:var(--pixel,'Press Start 2P',monospace);font-size:16px;color:var(--yellow,#ffe500);text-shadow:0 0 10px var(--yellow,#ffe500)}
.ok-main{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.ok-canvas{width:100%;max-width:${PX}px;aspect-ratio:1/1;display:block;border-radius:12px;border:6px solid #05050f;
  box-shadow:0 0 0 3px var(--cyan,#00eaff),0 0 24px rgba(0,234,255,.5);cursor:pointer;touch-action:none}
.ok-right{flex:0 0 220px;display:flex;flex-direction:column;gap:12px}
.ok-side{background:rgba(8,8,28,.72);border:2px solid var(--line,#2a2a66);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px}
.ok-p{display:flex;align-items:center;gap:8px;font-size:15px;padding:6px 8px;border-radius:8px}
.ok-p.turn{background:rgba(255,229,0,.12);box-shadow:inset 0 0 0 1px var(--yellow,#ffe500)}
.ok-dot{width:16px;height:16px;border-radius:50%;box-shadow:0 0 8px currentColor}
.ok-banner{margin-top:12px;text-align:center;font-family:var(--pixel,'Press Start 2P',monospace);font-size:16px;min-height:22px;color:var(--yellow,#ffe500);text-shadow:0 0 10px rgba(255,229,0,.6)}
`;

function injectStyle() {
  if (document.getElementById('ok-style')) return;
  const s = document.createElement('style');
  s.id = 'ok-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

class OmokClient implements GameClient {
  private state: State | null = null;
  private clockOffset = 0;
  private timerInt: ReturnType<typeof setInterval> | null = null;
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private elTop!: HTMLElement;
  private elBlack!: HTMLElement;
  private elWhite!: HTMLElement;
  private elBanner!: HTMLElement;
  private cell = 1;

  constructor(private readonly ctx: GameClientContext) {
    injectStyle();
    this.build();
    this.timerInt = setInterval(() => this.renderTimer(), 250);
  }

  private build() {
    const root = this.ctx.mount;
    root.innerHTML = `
      <div class="ok">
        <div class="ok-top">
          <span class="pill ok-turn">-</span>
          <span class="ok-timer">--</span>
        </div>
        <div class="ok-main">
          <canvas class="ok-canvas" width="${PX}" height="${PX}"></canvas>
          <div class="ok-right">
            <div class="ok-side">
              <div class="ok-p ok-black"></div>
              <div class="ok-p ok-white"></div>
            </div>
            <div class="ok-banner"></div>
          </div>
        </div>
      </div>`;
    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.canvas = q<HTMLCanvasElement>('.ok-canvas');
    this.g = this.canvas.getContext('2d')!;
    this.elTop = q('.ok-turn');
    this.elBlack = q('.ok-black');
    this.elWhite = q('.ok-white');
    this.elBanner = q('.ok-banner');
    this.cell = (PX - 2 * MARGIN) / (15 - 1);
    this.canvas.addEventListener('click', (e) => this.onClick(e));
  }

  private onClick(e: MouseEvent) {
    const s = this.state;
    if (!s || !s.isMyTurn || s.phase !== 'PLAYING') return;
    const r = this.canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * PX;
    const py = ((e.clientY - r.top) / r.height) * PX;
    const x = Math.round((px - MARGIN) / this.cell);
    const y = Math.round((py - MARGIN) / this.cell);
    if (x < 0 || y < 0 || x >= s.size || y >= s.size) return;
    if (s.board[y]?.[x] !== 0) return;
    this.ctx.sendAction({ type: 'place', x, y });
  }

  onState(raw: unknown): void {
    const s = raw as State;
    this.state = s;
    this.clockOffset = Date.now() - s.now;
    this.cell = (PX - 2 * MARGIN) / (s.size - 1);

    const curColor = s.currentId === s.black?.id ? 1 : 2;
    this.elTop.textContent =
      s.phase === 'OVER' ? '게임 종료' : `${curColor === 1 ? '●' : '○'} ${s.currentNick ?? ''} 차례`;
    this.renderSide(this.elBlack, s.black, 1, s);
    this.renderSide(this.elWhite, s.white, 2, s);

    if (s.phase === 'OVER') {
      this.elBanner.textContent = s.draw ? '무승부!' : s.winnerNick ? `🏆 ${s.winnerNick} 승리!` : '게임 종료';
    } else {
      this.elBanner.textContent = s.myColor === 0 ? '👁 관전 중' : s.isMyTurn ? '내 차례!' : '상대 차례…';
    }

    this.draw(s);
    this.renderTimer();
  }

  private renderSide(el: HTMLElement, side: Side | null, color: number, s: State) {
    if (!side) {
      el.innerHTML = '';
      return;
    }
    const isTurn = s.phase === 'PLAYING' && s.currentId === side.id;
    el.className = 'ok-p ' + (color === 1 ? 'ok-black' : 'ok-white') + (isTurn ? ' turn' : '');
    const me = side.id === this.ctx.me.id ? ' (나)' : '';
    el.innerHTML = `<span class="ok-dot" style="background:${STONE[color]};color:${STONE[color]}"></span>
      <span>${color === 1 ? '흑' : '백'} · ${esc(side.nickname)}${me}</span>`;
  }

  private pos(i: number) {
    return MARGIN + i * this.cell;
  }

  private draw(s: State) {
    const g = this.g;
    g.clearRect(0, 0, PX, PX);
    // 배경
    g.fillStyle = '#0c0c22';
    g.fillRect(0, 0, PX, PX);
    // 격자
    g.strokeStyle = 'rgba(0,234,255,0.28)';
    g.lineWidth = 1;
    for (let i = 0; i < s.size; i++) {
      g.beginPath();
      g.moveTo(this.pos(0), this.pos(i));
      g.lineTo(this.pos(s.size - 1), this.pos(i));
      g.stroke();
      g.beginPath();
      g.moveTo(this.pos(i), this.pos(0));
      g.lineTo(this.pos(i), this.pos(s.size - 1));
      g.stroke();
    }
    // 화점
    g.fillStyle = 'rgba(0,234,255,0.6)';
    for (const [hx, hy] of [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]]) {
      g.beginPath();
      g.arc(this.pos(hx!), this.pos(hy!), 3, 0, Math.PI * 2);
      g.fill();
    }
    // 돌
    const r = this.cell * 0.42;
    for (let y = 0; y < s.size; y++) {
      for (let x = 0; x < s.size; x++) {
        const c = s.board[y]?.[x] ?? 0;
        if (!c) continue;
        this.stone(this.pos(x), this.pos(y), r, STONE[c]!);
      }
    }
    // 마지막 수 표시
    if (s.last) {
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(this.pos(s.last.x), this.pos(s.last.y), r + 3, 0, Math.PI * 2);
      g.stroke();
    }
    // 승리 라인
    if (s.winLine && s.winLine.length) {
      g.strokeStyle = '#ffe500';
      g.lineWidth = 4;
      g.shadowColor = '#ffe500';
      g.shadowBlur = 16;
      const a = s.winLine[0]!;
      const b = s.winLine[s.winLine.length - 1]!;
      g.beginPath();
      g.moveTo(this.pos(a.x), this.pos(a.y));
      g.lineTo(this.pos(b.x), this.pos(b.y));
      g.stroke();
      g.shadowBlur = 0;
    }
  }

  private stone(cx: number, cy: number, r: number, color: string) {
    const g = this.g;
    g.shadowColor = color;
    g.shadowBlur = 10;
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.arc(cx - r * 0.3, cy - r * 0.3, r * 0.25, 0, Math.PI * 2);
    g.fill();
  }

  private renderTimer() {
    const s = this.state;
    if (!s) return;
    const remain = s.phaseEndsAt - (Date.now() - this.clockOffset);
    const el = this.ctx.mount.querySelector('.ok-timer');
    if (el) el.textContent = `${remain > 0 ? Math.ceil(remain / 1000) : 0}s`;
  }

  onEvent(): void {
    /* 상태(pushState)로 충분 */
  }

  destroy(): void {
    if (this.timerInt) clearInterval(this.timerInt);
    this.timerInt = null;
    this.ctx.mount.innerHTML = '';
  }
}

const clientModule: GameClientModule = {
  meta,
  create: (ctx) => new OmokClient(ctx),
};

export default clientModule;
