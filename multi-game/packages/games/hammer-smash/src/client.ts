/** 망치 연타 클라이언트 — 캔버스 파티클 + CSS 연출 */
import type { GameClient, GameClientContext, GameClientModule } from '@mg/game-sdk/client';
import { meta } from './meta';

const MIN_MS = 45; // 서버와 동일한 연타 간격 → 낙관적 카운트 일치
type Phase = 'COUNTDOWN' | 'SMASHING' | 'RESULT';
interface State {
  phase: Phase;
  phaseEndsAt: number;
  now: number;
  myCount: number;
  ranks: { playerId: string; nickname: string; count: number }[];
  totalPlayers: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  kind: 'spark' | 'plus';
}

const STYLE = `
.hs{font-family:var(--kr,'Galmuri11',monospace);color:var(--text,#eaeaff)}
.hs-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.hs-top .pill{font-family:var(--pixel,'Press Start 2P',monospace);font-size:10px;background:rgba(0,234,255,.1);border:1px solid var(--cyan,#00eaff);color:var(--cyan,#00eaff);border-radius:6px;padding:6px 10px;text-shadow:0 0 6px rgba(0,234,255,.5)}
.hs-timer{font-family:var(--pixel,'Press Start 2P',monospace);font-size:18px;color:var(--yellow,#ffe500);text-shadow:0 0 10px var(--yellow,#ffe500)}
.hs-main{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.hs-left{flex:1 1 460px;min-width:320px}
.hs-arena{position:relative;height:360px;border-radius:14px;border:6px solid #05050f;overflow:hidden;
  background:radial-gradient(circle at 50% 120%,#20204e,#0a0a24 70%);
  box-shadow:0 0 0 3px var(--magenta,#ff2e97),0 0 26px rgba(255,46,151,.5)}
.hs-fx{position:absolute;inset:0;pointer-events:none}
.hs-count{position:absolute;top:16px;left:0;right:0;text-align:center;font-family:var(--pixel,'Press Start 2P',monospace);
  font-size:60px;color:#fff;text-shadow:0 0 10px var(--yellow,#ffe500),0 0 26px var(--yellow,#ffe500);will-change:transform}
.hs-rig{position:absolute;bottom:120px;left:50%;transform:translateX(-6px)}
.hs-hammer{font-size:104px;display:inline-block;transform-origin:62% 84%;transform:rotate(-48deg);filter:drop-shadow(0 3px 4px rgba(0,0,0,.5))}
.hs-hammer.swing{animation:hsSwing 120ms ease-out}
@keyframes hsSwing{0%{transform:rotate(-48deg)}45%{transform:rotate(30deg)}100%{transform:rotate(-48deg)}}
.hs-mole{position:absolute;bottom:44px;left:50%;transform:translateX(-50%);font-size:80px;transform-origin:bottom center;z-index:1}
.hs-mole.bonk{animation:hsBonk 120ms ease-out}
@keyframes hsBonk{0%{transform:translateX(-50%) scale(1,1)}40%{transform:translateX(-50%) scale(1.3,.55) translateY(10px)}100%{transform:translateX(-50%) scale(1,1)}}
.hs-hole{position:absolute;bottom:38px;left:50%;transform:translateX(-50%);width:150px;height:34px;border-radius:50%;
  background:#05050f;box-shadow:inset 0 6px 10px rgba(0,0,0,.7)}
.hs-smash{display:block;width:100%;margin-top:14px;font-family:var(--pixel,'Press Start 2P',monospace);font-size:16px;
  padding:20px;color:#fff;background:var(--magenta,#ff2e97);border:3px solid #5a0e37;border-radius:12px;cursor:pointer;
  box-shadow:0 6px 0 #a01461,0 0 22px rgba(255,46,151,.5)}
.hs-smash:active{transform:translateY(5px);box-shadow:0 1px 0 #a01461}
.hs-smash:disabled{background:#33335a;color:#7a7aa0;border-color:#26264a;box-shadow:0 6px 0 #202040;cursor:not-allowed}
.hs-hint{margin-top:10px;text-align:center;color:var(--muted,#8f8fd0);font-size:13px}
.hs-right{flex:0 0 240px;display:flex;flex-direction:column;gap:12px}
.hs-board{background:rgba(8,8,28,.72);border:2px solid var(--line,#2a2a66);border-radius:10px;padding:12px}
.hs-board h4{font-family:var(--pixel,'Press Start 2P',monospace);font-size:10px;margin:0 0 10px;color:var(--magenta,#ff2e97);text-shadow:0 0 8px rgba(255,46,151,.6)}
.hs-row{margin:6px 0;font-size:13px}
.hs-row .hs-name{display:flex;justify-content:space-between;margin-bottom:3px}
.hs-row .hs-name b{font-family:var(--mono,monospace);color:var(--yellow,#ffe500)}
.hs-bar{height:8px;border-radius:4px;background:#05050f;overflow:hidden}
.hs-bar > div{height:100%;background:linear-gradient(90deg,var(--cyan,#00eaff),var(--magenta,#ff2e97));transition:width .18s linear}
`;

function injectStyle() {
  if (document.getElementById('hs-style')) return;
  const s = document.createElement('style');
  s.id = 'hs-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
function restart(el: HTMLElement, cls: string) {
  el.classList.remove(cls);
  void el.offsetWidth; // reflow → 애니메이션 재시작
  el.classList.add(cls);
}

class HammerSmashClient implements GameClient {
  private state: State | null = null;
  private localCount = 0;
  private lastPress = 0;
  private clockOffset = 0;

  private particles: Particle[] = [];
  private shakeMag = 0;
  private countPop = 0;
  private raf = 0;

  private arena!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private elCount!: HTMLElement;
  private elHammer!: HTMLElement;
  private elMole!: HTMLElement;
  private elTimer!: HTMLElement;
  private elPhase!: HTMLElement;
  private elHint!: HTMLElement;
  private elBtn!: HTMLButtonElement;
  private elBoard!: HTMLElement;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(private readonly ctx: GameClientContext) {
    injectStyle();
    this.build();
    this.keyHandler = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        this.press();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
    this.loop();
  }

  private build() {
    const root = this.ctx.mount;
    root.innerHTML = `
      <div class="hs">
        <div class="hs-top"><span class="pill hs-phase">-</span><span class="hs-timer">--</span></div>
        <div class="hs-main">
          <div class="hs-left">
            <div class="hs-arena">
              <div class="hs-count">0</div>
              <div class="hs-hole"></div>
              <div class="hs-mole">🐹</div>
              <div class="hs-rig"><span class="hs-hammer">🔨</span></div>
              <canvas class="hs-fx"></canvas>
            </div>
            <button class="hs-smash" disabled>연타! (Space)</button>
            <div class="hs-hint"></div>
          </div>
          <div class="hs-right">
            <div class="hs-board"><h4>LEADERBOARD</h4><div class="rows"></div></div>
          </div>
        </div>
      </div>`;
    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.arena = q('.hs-arena');
    this.canvas = q<HTMLCanvasElement>('.hs-fx');
    this.g = this.canvas.getContext('2d')!;
    this.elCount = q('.hs-count');
    this.elHammer = q('.hs-hammer');
    this.elMole = q('.hs-mole');
    this.elTimer = q('.hs-timer');
    this.elPhase = q('.hs-phase');
    this.elHint = q('.hs-hint');
    this.elBtn = q<HTMLButtonElement>('.hs-smash');
    this.elBoard = q('.hs-board .rows');
    this.sizeCanvas();
    this.elBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.press();
    });
  }

  private sizeCanvas() {
    this.canvas.width = this.arena.clientWidth || 460;
    this.canvas.height = this.arena.clientHeight || 360;
  }

  private impact(): { x: number; y: number } {
    return { x: this.canvas.width / 2, y: this.canvas.height - 130 };
  }

  private press() {
    const s = this.state;
    if (!s || s.phase !== 'SMASHING') return;
    const now = Date.now();
    if (now - this.lastPress < MIN_MS) return;
    this.lastPress = now;

    this.localCount++;
    this.elCount.textContent = String(this.localCount);
    this.countPop = 0.4;
    this.shakeMag = 8;
    restart(this.elHammer, 'swing');
    restart(this.elMole, 'bonk');

    const { x, y } = this.impact();
    for (let i = 0; i < 5; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
      const sp = 3 + Math.random() * 4;
      this.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 2, life: 1, max: 1, kind: 'spark' });
    }
    this.particles.push({ x, y: y - 30, vx: 0, vy: -1.4, life: 1, max: 1, kind: 'plus' });
    if (this.particles.length > 160) this.particles.splice(0, this.particles.length - 160);

    this.ctx.sendAction({ type: 'press' });
  }

  private loop = () => {
    const g = this.g;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 파티클
    for (const p of this.particles) {
      p.life -= 0.03;
      p.x += p.vx;
      p.y += p.vy;
      if (p.kind === 'spark') p.vy += 0.35; // 중력
      if (p.life <= 0) continue;
      if (p.kind === 'spark') {
        g.globalAlpha = Math.max(0, p.life);
        g.fillStyle = '#ffe500';
        g.beginPath();
        g.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        g.fill();
      } else {
        g.globalAlpha = Math.max(0, p.life);
        g.fillStyle = '#3dff88';
        g.font = "bold 22px 'Press Start 2P', monospace";
        g.textAlign = 'center';
        g.fillText('+1', p.x, p.y);
      }
    }
    g.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.life > 0);

    // 화면 흔들림
    if (this.shakeMag > 0.2) {
      const dx = (Math.random() - 0.5) * this.shakeMag;
      const dy = (Math.random() - 0.5) * this.shakeMag;
      this.arena.style.transform = `translate(${dx}px,${dy}px)`;
      this.shakeMag *= 0.86;
    } else {
      this.arena.style.transform = '';
    }
    // 카운트 팝
    if (this.countPop > 0.01) {
      this.elCount.style.transform = `scale(${1 + this.countPop})`;
      this.countPop *= 0.82;
    } else {
      this.elCount.style.transform = '';
    }
    // 타이머 + 카운트다운 숫자
    this.renderTimer();

    this.raf = requestAnimationFrame(this.loop);
  };

  private renderTimer() {
    const s = this.state;
    if (!s) return;
    const remain = s.phaseEndsAt - (Date.now() - this.clockOffset);
    const sec = remain > 0 ? Math.ceil(remain / 1000) : 0;
    this.elTimer.textContent = `${sec}s`;
    if (s.phase === 'COUNTDOWN') this.elCount.textContent = String(Math.max(1, sec));
  }

  onState(raw: unknown): void {
    const s = raw as State;
    this.state = s;
    this.clockOffset = Date.now() - s.now;

    this.elPhase.textContent = s.phase === 'COUNTDOWN' ? '준비' : s.phase === 'SMASHING' ? '연타!' : '결과';
    this.elBtn.disabled = s.phase !== 'SMASHING';

    if (s.phase === 'COUNTDOWN') {
      this.elHint.textContent = '곧 시작합니다… 스페이스바 준비!';
    } else if (s.phase === 'SMASHING') {
      this.elHint.textContent = '스페이스바(또는 버튼)를 최대한 빠르게 연타!';
      if (s.myCount > this.localCount) this.localCount = s.myCount; // 서버와 동기화
      this.elCount.textContent = String(this.localCount);
    } else {
      this.localCount = s.myCount;
      this.elCount.textContent = String(s.myCount);
      const top = s.ranks[0];
      this.elHint.textContent = top ? `TIME UP!  🏆 ${top.nickname} — ${top.count}회` : 'TIME UP!';
    }

    this.renderBoard(s);
  }

  private renderBoard(s: State) {
    const maxCount = Math.max(1, ...s.ranks.map((r) => r.count));
    const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`);
    this.elBoard.innerHTML = s.ranks
      .map(
        (r, i) => `
      <div class="hs-row">
        <div class="hs-name"><span>${medal(i)} ${esc(r.nickname)}</span><b>${r.count}</b></div>
        <div class="hs-bar"><div style="width:${Math.round((r.count / maxCount) * 100)}%"></div></div>
      </div>`,
      )
      .join('');
  }

  onEvent(event: string): void {
    if (event === 'go') this.shakeMag = 10;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.keyHandler);
    this.ctx.mount.innerHTML = '';
  }
}

const clientModule: GameClientModule = {
  meta,
  create: (ctx) => new HammerSmashClient(ctx),
};

export default clientModule;
