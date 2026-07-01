/** 캐치마인드 클라이언트 (GameClient 구현) */
import type { GameClient, GameClientContext, GameClientModule } from '@mg/game-sdk/client';
import { meta } from './meta';

const CW = 720;
const CH = 460;
const COLORS = ['#222222', '#e23b3b', '#2f6fe2', '#36a64f', '#f1b500', '#9b51e0', '#8b5a2b', '#ffffff'];

interface Point {
  x: number;
  y: number;
}
interface Stroke {
  points: Point[];
  color: string;
  width: number;
}
interface State {
  phase: 'CHOOSING' | 'DRAWING' | 'REVEAL';
  round: number;
  totalRounds: number;
  drawerNick: string;
  isDrawer: boolean;
  word: string | null;
  wordLength: number;
  wordChoices: string[] | null;
  strokes: Stroke[];
  iAmCorrect: boolean;
  scores: { playerId: string; nickname: string; score: number }[];
  drawerId: string;
  correct: string[];
  phaseEndsAt: number;
  now: number;
}

const PHASE_LABEL: Record<State['phase'], string> = {
  CHOOSING: '제시어 선택',
  DRAWING: '그리는 중',
  REVEAL: '라운드 결과',
};

const STYLE = `
.cm{font-family:var(--kr,'Galmuri11',monospace);color:var(--text,#eaeaff)}
.cm-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.cm-top .pill{font-family:var(--pixel,'Press Start 2P',monospace);font-size:10px;background:rgba(0,234,255,.1);border:1px solid var(--cyan,#00eaff);color:var(--cyan,#00eaff);border-radius:6px;padding:6px 10px;text-shadow:0 0 6px rgba(0,234,255,.5)}
.cm-timer{font-family:var(--pixel,'Press Start 2P',monospace);font-size:18px;color:var(--yellow,#ffe500);text-shadow:0 0 10px var(--yellow,#ffe500)}
.cm-top .word{font-weight:700;letter-spacing:3px;font-size:19px;color:var(--green,#3dff88);text-shadow:0 0 10px rgba(61,255,136,.5)}
.cm-main{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.cm-left{flex:1 1 480px;min-width:320px}
.cm-canvas{width:100%;max-width:${CW}px;aspect-ratio:${CW}/${CH};background:#f4f6ff;display:block;
  border-radius:16px;border:7px solid #05050f;
  box-shadow:0 0 0 3px var(--cyan,#00eaff),0 0 26px rgba(0,234,255,.6),inset 0 0 40px rgba(0,0,50,.18);
  touch-action:none;cursor:crosshair}
.cm-tools{display:flex;gap:8px;align-items:center;margin-top:14px;flex-wrap:wrap;
  background:rgba(8,8,28,.6);border:1px solid var(--line,#2a2a66);border-radius:9px;padding:9px}
.cm-sw{width:26px;height:26px;border-radius:50%;border:2px solid #05050f;cursor:pointer;box-shadow:0 0 6px rgba(0,0,0,.6)}
.cm-sw.on{outline:3px solid var(--yellow,#ffe500);outline-offset:2px;box-shadow:0 0 12px var(--yellow,#ffe500)}
.cm-tools input[type=range]{accent-color:var(--cyan,#00eaff)}
.cm-tools button{font-family:var(--kr,'Galmuri11',monospace);font-size:12px;color:#fff;padding:8px 12px;background:var(--magenta,#ff2e97);border:2px solid #5a0e37;border-radius:6px;box-shadow:0 3px 0 #a01461;cursor:pointer}
.cm-tools button:active{transform:translateY(3px);box-shadow:0 0 0 #a01461}
.cm-choices{margin-top:14px;display:flex;gap:12px;flex-wrap:wrap}
.cm-choices button{font-family:var(--kr,'Galmuri11',monospace);font-size:20px;padding:16px 24px;color:#04121a;background:var(--cyan,#00eaff);border:2px solid #062b33;border-radius:9px;box-shadow:0 6px 0 #067b8c,0 0 16px rgba(0,234,255,.5);cursor:pointer}
.cm-choices button:active{transform:translateY(5px);box-shadow:0 1px 0 #067b8c}
.cm-wait{margin-top:14px;font-family:var(--pixel,'Press Start 2P',monospace);font-size:11px;color:var(--muted,#8f8fd0);animation:blink 1.4s steps(1) infinite}
.cm-right{flex:0 0 260px;display:flex;flex-direction:column;gap:12px}
.cm-scores{background:rgba(8,8,28,.72);border:2px solid var(--line,#2a2a66);border-radius:10px;padding:12px;box-shadow:inset 0 0 20px rgba(0,234,255,.06)}
.cm-scores h4{font-family:var(--pixel,'Press Start 2P',monospace);font-size:10px;margin:0 0 8px;color:var(--magenta,#ff2e97);text-shadow:0 0 8px rgba(255,46,151,.6);letter-spacing:1px}
.cm-scores .row{display:flex;justify-content:space-between;padding:4px 0;font-size:14px}
.cm-scores .row span:last-child{font-family:var(--mono,monospace);color:var(--yellow,#ffe500);text-shadow:0 0 6px rgba(255,229,0,.4)}
.cm-feed{height:220px;overflow-y:auto;background:#05050f;border:2px solid var(--line,#2a2a66);border-radius:10px;padding:10px;font-family:var(--mono,monospace);font-size:12px;color:var(--green,#3dff88);text-shadow:0 0 5px rgba(61,255,136,.35);display:flex;flex-direction:column;gap:3px}
.cm-feed .sys{color:var(--muted,#8f8fd0);text-shadow:none}
.cm-feed .ok{color:var(--yellow,#ffe500);text-shadow:0 0 8px rgba(255,229,0,.6);font-weight:700}
.cm-guess{font-family:var(--kr,'Galmuri11',monospace);font-size:15px;padding:11px;background:rgba(4,4,20,.8);border:2px solid var(--line,#2a2a66);border-radius:8px;color:var(--text,#eaeaff);caret-color:var(--cyan,#00eaff)}
.cm-guess:focus{outline:none;border-color:var(--green,#3dff88);box-shadow:0 0 12px rgba(61,255,136,.4)}
.cm-guess::placeholder{color:#5b5b8a}
.cm-guess:disabled{opacity:.5}
`;

function injectStyle() {
  if (document.getElementById('cm-style')) return;
  const s = document.createElement('style');
  s.id = 'cm-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

class CatchMindClient implements GameClient {
  private state: State | null = null;
  private prevPhase: State['phase'] | null = null;
  private color = COLORS[0]!;
  private width = 4;

  // drawing
  private drawing = false;
  private pending: Point[] = [];
  private lastSent = 0;

  private clockOffset = 0; // Date.now() - server.now
  private timerInt: ReturnType<typeof setInterval> | null = null;

  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private elRound!: HTMLElement;
  private elPhase!: HTMLElement;
  private elTimer!: HTMLElement;
  private elWord!: HTMLElement;
  private elTools!: HTMLElement;
  private elChoices!: HTMLElement;
  private elWait!: HTMLElement;
  private elScores!: HTMLElement;
  private elFeed!: HTMLElement;
  private elGuess!: HTMLInputElement;

  constructor(private readonly ctx: GameClientContext) {
    injectStyle();
    this.build();
    this.timerInt = setInterval(() => this.renderTimer(), 250);
  }

  private build() {
    const root = this.ctx.mount;
    root.innerHTML = `
      <div class="cm">
        <div class="cm-top">
          <span class="pill cm-round">라운드 -</span>
          <span class="pill cm-phase">-</span>
          <span class="cm-timer">--</span>
          <span class="word cm-word"></span>
        </div>
        <div class="cm-main">
          <div class="cm-left">
            <canvas class="cm-canvas" width="${CW}" height="${CH}"></canvas>
            <div class="cm-tools" style="display:none"></div>
            <div class="cm-choices" style="display:none"></div>
            <div class="cm-wait" style="display:none"></div>
          </div>
          <div class="cm-right">
            <div class="cm-scores"><h4>점수</h4><div class="rows"></div></div>
            <div class="cm-feed"></div>
            <input class="cm-guess" placeholder="정답을 입력하고 Enter" disabled />
          </div>
        </div>
      </div>`;

    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.canvas = q<HTMLCanvasElement>('.cm-canvas');
    this.g = this.canvas.getContext('2d')!;
    this.g.lineCap = 'round';
    this.g.lineJoin = 'round';
    this.elRound = q('.cm-round');
    this.elPhase = q('.cm-phase');
    this.elTimer = q('.cm-timer');
    this.elWord = q('.cm-word');
    this.elTools = q('.cm-tools');
    this.elChoices = q('.cm-choices');
    this.elWait = q('.cm-wait');
    this.elScores = q('.cm-scores .rows');
    this.elFeed = q('.cm-feed');
    this.elGuess = q<HTMLInputElement>('.cm-guess');

    this.buildTools();
    this.bindCanvas();
    this.elGuess.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const text = this.elGuess.value.trim();
      if (!text) return;
      this.ctx.sendAction({ type: 'guess', text });
      this.elGuess.value = '';
    });
  }

  private buildTools() {
    this.elTools.innerHTML = '';
    for (const c of COLORS) {
      const b = document.createElement('div');
      b.className = 'cm-sw' + (c === this.color ? ' on' : '');
      b.style.background = c;
      b.title = c;
      b.addEventListener('click', () => {
        this.color = c;
        this.elTools.querySelectorAll('.cm-sw').forEach((n) => n.classList.remove('on'));
        b.classList.add('on');
      });
      this.elTools.appendChild(b);
    }
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '2';
    range.max = '24';
    range.value = String(this.width);
    range.addEventListener('input', () => (this.width = Number(range.value)));
    this.elTools.appendChild(range);

    const clearBtn = document.createElement('button');
    clearBtn.textContent = '전체 지우기';
    clearBtn.addEventListener('click', () => this.ctx.sendAction({ type: 'clear' }));
    this.elTools.appendChild(clearBtn);
  }

  private bindCanvas() {
    const toNorm = (e: PointerEvent): Point => {
      const r = this.canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    };
    const canDraw = () => this.state?.isDrawer && this.state?.phase === 'DRAWING';

    this.canvas.addEventListener('pointerdown', (e) => {
      if (!canDraw()) return;
      this.canvas.setPointerCapture(e.pointerId);
      this.drawing = true;
      const p = toNorm(e);
      this.pending = [p];
      this.dot(p);
      this.lastSent = Date.now();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.drawing) return;
      const p = toNorm(e);
      const prev = this.pending[this.pending.length - 1]!;
      this.line(prev, p, this.color, this.width);
      this.pending.push(p);
      if (Date.now() - this.lastSent >= 50 && this.pending.length >= 2) this.flush();
    });
    const end = () => {
      if (!this.drawing) return;
      if (this.pending.length >= 2) this.flush();
      this.drawing = false;
      this.pending = [];
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointerleave', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  private flush() {
    const seg: Stroke = { points: [...this.pending], color: this.color, width: this.width };
    this.ctx.sendAction({ type: 'draw', segment: seg });
    const last = this.pending[this.pending.length - 1]!;
    this.pending = [last];
    this.lastSent = Date.now();
  }

  // ── 캔버스 렌더 ──
  private clearCanvas() {
    this.g.clearRect(0, 0, CW, CH);
  }
  private dot(p: Point) {
    this.g.fillStyle = this.color;
    this.g.beginPath();
    this.g.arc(p.x * CW, p.y * CH, this.width / 2, 0, Math.PI * 2);
    this.g.fill();
  }
  private line(a: Point, b: Point, color: string, width: number) {
    this.g.strokeStyle = color;
    this.g.lineWidth = width;
    this.g.beginPath();
    this.g.moveTo(a.x * CW, a.y * CH);
    this.g.lineTo(b.x * CW, b.y * CH);
    this.g.stroke();
  }
  private drawStroke(s: Stroke) {
    if (!s.points?.length) return;
    if (s.points.length === 1) {
      this.g.fillStyle = s.color;
      this.g.beginPath();
      this.g.arc(s.points[0]!.x * CW, s.points[0]!.y * CH, s.width / 2, 0, Math.PI * 2);
      this.g.fill();
      return;
    }
    this.g.strokeStyle = s.color;
    this.g.lineWidth = s.width;
    this.g.beginPath();
    this.g.moveTo(s.points[0]!.x * CW, s.points[0]!.y * CH);
    for (let i = 1; i < s.points.length; i++) this.g.lineTo(s.points[i]!.x * CW, s.points[i]!.y * CH);
    this.g.stroke();
  }
  private redrawAll(strokes: Stroke[]) {
    this.clearCanvas();
    for (const s of strokes) this.drawStroke(s);
  }

  // ── 피드 ──
  private feed(text: string, cls = '') {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text;
    this.elFeed.appendChild(d);
    this.elFeed.scrollTop = this.elFeed.scrollHeight;
  }

  // ── GameClient 인터페이스 ──
  onState(raw: unknown): void {
    const s = raw as State;
    this.state = s;
    this.clockOffset = Date.now() - s.now;

    this.elRound.textContent = `라운드 ${s.round}/${s.totalRounds}`;
    this.elPhase.textContent = PHASE_LABEL[s.phase];

    // 제시어 영역
    if (s.phase === 'REVEAL') {
      this.elWord.textContent = s.word ? `정답: ${s.word}` : '';
    } else if (s.phase === 'DRAWING') {
      this.elWord.textContent = s.isDrawer
        ? `제시어: ${s.word ?? ''}`
        : `${'○ '.repeat(s.wordLength)}(${s.wordLength}글자)`;
    } else {
      this.elWord.textContent = '';
    }

    // 도구 / 제시어 선택 / 대기 안내
    const showTools = s.isDrawer && s.phase === 'DRAWING';
    this.elTools.style.display = showTools ? 'flex' : 'none';

    if (s.phase === 'CHOOSING') {
      if (s.isDrawer && s.wordChoices) {
        this.elChoices.style.display = 'flex';
        this.elWait.style.display = 'none';
        this.elChoices.innerHTML = '';
        for (const w of s.wordChoices) {
          const b = document.createElement('button');
          b.textContent = w;
          b.addEventListener('click', () => this.ctx.sendAction({ type: 'chooseWord', word: w }));
          this.elChoices.appendChild(b);
        }
      } else {
        this.elChoices.style.display = 'none';
        this.elWait.style.display = 'block';
        this.elWait.textContent = `${s.drawerNick} 님이 제시어를 고르는 중...`;
      }
    } else {
      this.elChoices.style.display = 'none';
      this.elWait.style.display = 'none';
    }

    // 추측 입력
    const canGuess = s.phase === 'DRAWING' && !s.isDrawer && !s.iAmCorrect;
    this.elGuess.disabled = !canGuess;
    this.elGuess.placeholder = s.isDrawer
      ? '출제자는 추측할 수 없어요'
      : s.iAmCorrect
        ? '정답을 맞혔어요! 🎉'
        : '정답을 입력하고 Enter';

    // 점수판
    this.elScores.innerHTML = '';
    for (const sc of s.scores) {
      const row = document.createElement('div');
      row.className = 'row';
      const mark = sc.playerId === s.drawerId ? '✏️ ' : s.correct.includes(sc.playerId) ? '✅ ' : '';
      row.innerHTML = `<span>${mark}${escapeHtml(sc.nickname)}</span><span>${sc.score}</span>`;
      this.elScores.appendChild(row);
    }

    // 캔버스 (페이즈 전환 시에만 전체 갱신)
    if (s.phase !== this.prevPhase) {
      if (s.phase === 'DRAWING') this.redrawAll(s.strokes);
      else if (s.phase === 'CHOOSING') this.clearCanvas();
    }
    this.prevPhase = s.phase;
    this.renderTimer();
  }

  private renderTimer() {
    if (!this.state) return;
    const remain = this.state.phaseEndsAt - (Date.now() - this.clockOffset);
    this.elTimer.textContent = remain > 0 ? `${Math.ceil(remain / 1000)}s` : '0s';
  }

  onEvent(event: string, payload: unknown): void {
    const p = payload as Record<string, unknown>;
    switch (event) {
      case 'draw':
        if (!this.state?.isDrawer) this.drawStroke(payload as Stroke);
        break;
      case 'clear':
        this.clearCanvas();
        break;
      case 'correct':
        this.feed(`✅ ${p.nickname} 님 정답!`, 'ok');
        break;
      case 'guess':
        this.feed(`${p.nickname}: ${p.text}`);
        break;
      case 'round:start':
        this.feed(`— 라운드 ${p.round} · ${p.drawerNick} 님 차례 —`, 'sys');
        break;
      case 'round:end':
        this.feed(`정답은 "${p.word}" 였습니다.`, 'sys');
        break;
      case 'drawer:left':
        this.feed('출제자가 나가 라운드를 종료합니다.', 'sys');
        break;
    }
  }

  destroy(): void {
    if (this.timerInt) clearInterval(this.timerInt);
    this.timerInt = null;
    this.ctx.mount.innerHTML = '';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

const clientModule: GameClientModule = {
  meta,
  create: (ctx) => new CatchMindClient(ctx),
};

export default clientModule;
