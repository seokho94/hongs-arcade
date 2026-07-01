/** 연타 달리기 클라이언트 — 레인 러너 + 전진 보간 + 연타 연출 */
import type { GameClient, GameClientContext, GameClientModule } from '@mg/game-sdk/client';
import { meta } from './meta';

const MIN_MS = 45;
const CHARS = ['🏃', '🐇', '🐢', '🐱', '🐶', '🦊', '🐸', '🐤'];
type Phase = 'COUNTDOWN' | 'RACING' | 'RESULT';
interface Racer {
  playerId: string;
  nickname: string;
  dist: number;
  place: number | null;
}
interface State {
  phase: Phase;
  phaseEndsAt: number;
  now: number;
  goal: number;
  racers: Racer[];
}

const STYLE = `
.mr{font-family:var(--kr,'Galmuri11',monospace);color:var(--text,#eaeaff)}
.mr-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.mr-top .pill{font-family:var(--pixel,'Press Start 2P',monospace);font-size:10px;background:rgba(0,234,255,.1);border:1px solid var(--cyan,#00eaff);color:var(--cyan,#00eaff);border-radius:6px;padding:6px 10px;text-shadow:0 0 6px rgba(0,234,255,.5)}
.mr-timer{font-family:var(--pixel,'Press Start 2P',monospace);font-size:18px;color:var(--yellow,#ffe500);text-shadow:0 0 10px var(--yellow,#ffe500)}
.mr-big{font-family:var(--pixel,'Press Start 2P',monospace);font-size:26px;color:var(--cyan,#00eaff);text-shadow:0 0 14px var(--cyan,#00eaff)}
.mr-track{background:repeating-linear-gradient(90deg,rgba(255,255,255,.02) 0 38px,transparent 38px 40px),radial-gradient(circle at 50% 0%,#141436,#0a0a22);
  border:2px solid var(--line,#2a2a66);border-radius:12px;padding:8px 10px;box-shadow:inset 0 0 26px rgba(0,234,255,.05)}
.mr-lane{position:relative;height:46px;border-bottom:1px dashed rgba(255,255,255,.08)}
.mr-lane:last-child{border-bottom:none}
.mr-finish{position:absolute;right:6px;top:0;bottom:0;display:flex;align-items:center;font-size:22px;opacity:.8}
.mr-label{position:absolute;left:8px;top:4px;font-size:11px;color:var(--muted,#8f8fd0)}
.mr-runner{position:absolute;bottom:2px;font-size:30px;transition:left .09s linear;will-change:left;transform-origin:bottom center}
.mr-runner.me{filter:drop-shadow(0 0 8px var(--cyan,#00eaff))}
.mr-runner.hop{animation:mrHop .22s ease-out}
@keyframes mrHop{0%{transform:translateY(0) scaleX(1)}40%{transform:translateY(-10px) scaleX(1.12)}100%{transform:translateY(0) scaleX(1)}}
.mr-place{position:absolute;top:3px;font-family:var(--pixel,'Press Start 2P',monospace);font-size:11px;color:var(--yellow,#ffe500);text-shadow:0 0 8px rgba(255,229,0,.6)}
.mr-dust{position:absolute;bottom:2px;font-size:16px;pointer-events:none;animation:mrDust .4s ease-out forwards}
@keyframes mrDust{0%{opacity:.7;transform:translateX(0) scale(.8)}100%{opacity:0;transform:translateX(-16px) scale(1.3)}}
.mr-smash{display:block;width:100%;margin-top:14px;font-family:var(--pixel,'Press Start 2P',monospace);font-size:16px;
  padding:18px;color:#04121a;background:var(--cyan,#00eaff);border:3px solid #062b33;border-radius:12px;cursor:pointer;
  box-shadow:0 6px 0 #067b8c,0 0 22px rgba(0,234,255,.5)}
.mr-smash:active{transform:translateY(5px);box-shadow:0 1px 0 #067b8c}
.mr-smash:disabled{background:#33335a;color:#7a7aa0;border-color:#26264a;box-shadow:0 6px 0 #202040;cursor:not-allowed}
.mr-hint{margin-top:10px;text-align:center;color:var(--muted,#8f8fd0);font-size:13px}
`;

function injectStyle() {
  if (document.getElementById('mr-style')) return;
  const s = document.createElement('style');
  s.id = 'mr-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

class MashRaceClient implements GameClient {
  private state: State | null = null;
  private lastPress = 0;
  private clockOffset = 0;
  private timerInt: ReturnType<typeof setInterval> | null = null;
  private runners = new Map<string, HTMLElement>();
  private lanes = new Map<string, HTMLElement>();
  private built = false;

  private elTrack!: HTMLElement;
  private elTimer!: HTMLElement;
  private elPhase!: HTMLElement;
  private elBtn!: HTMLButtonElement;
  private elHint!: HTMLElement;
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
    this.timerInt = setInterval(() => this.renderTimer(), 200);
  }

  private build() {
    const root = this.ctx.mount;
    root.innerHTML = `
      <div class="mr">
        <div class="mr-top"><span class="pill mr-phase">-</span><span class="mr-timer">--</span><span class="mr-big"></span></div>
        <div class="mr-track"></div>
        <button class="mr-smash" disabled>달려라! (Space)</button>
        <div class="mr-hint"></div>
      </div>`;
    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.elTrack = q('.mr-track');
    this.elTimer = q('.mr-timer');
    this.elPhase = q('.mr-phase');
    this.elBtn = q<HTMLButtonElement>('.mr-smash');
    this.elHint = q('.mr-hint');
    this.elBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.press();
    });
  }

  private buildLanes(racers: Racer[]) {
    this.elTrack.innerHTML = racers
      .map((r, i) => {
        const me = r.playerId === this.ctx.me.id;
        return `<div class="mr-lane" data-pid="${r.playerId}">
          <span class="mr-label">${esc(r.nickname)}${me ? ' (나)' : ''}</span>
          <span class="mr-finish">🏁</span>
          <span class="mr-place"></span>
          <span class="mr-runner ${me ? 'me' : ''}" style="left:2%">${CHARS[i % CHARS.length]}</span>
        </div>`;
      })
      .join('');
    this.runners.clear();
    this.lanes.clear();
    for (const lane of Array.from(this.elTrack.querySelectorAll<HTMLElement>('.mr-lane'))) {
      const pid = lane.dataset.pid!;
      this.lanes.set(pid, lane);
      this.runners.set(pid, lane.querySelector<HTMLElement>('.mr-runner')!);
    }
    this.built = true;
  }

  private posPct(dist: number, goal: number) {
    return 2 + (Math.min(dist, goal) / goal) * 86; // 2%~88%
  }

  private press() {
    const s = this.state;
    if (!s || s.phase !== 'RACING') return;
    const me = s.racers.find((r) => r.playerId === this.ctx.me.id);
    if (me?.place != null) return; // 이미 완주
    const now = Date.now();
    if (now - this.lastPress < MIN_MS) return;
    this.lastPress = now;

    const runner = this.runners.get(this.ctx.me.id);
    if (runner) {
      runner.classList.remove('hop');
      void runner.offsetWidth;
      runner.classList.add('hop');
      this.spawnDust(this.ctx.me.id);
    }
    this.ctx.sendAction({ type: 'press' });
  }

  private spawnDust(pid: string) {
    const lane = this.lanes.get(pid);
    const runner = this.runners.get(pid);
    if (!lane || !runner) return;
    const dust = document.createElement('span');
    dust.className = 'mr-dust';
    dust.textContent = '💨';
    dust.style.left = runner.style.left;
    lane.appendChild(dust);
    setTimeout(() => dust.remove(), 420);
  }

  onState(raw: unknown): void {
    const s = raw as State;
    this.state = s;
    this.clockOffset = Date.now() - s.now;
    if (!this.built) this.buildLanes(s.racers);

    this.elPhase.textContent = s.phase === 'COUNTDOWN' ? '준비' : s.phase === 'RACING' ? '달리는 중' : '결과';
    this.elBtn.disabled = s.phase !== 'RACING';

    for (const r of s.racers) {
      const runner = this.runners.get(r.playerId);
      if (runner) runner.style.left = this.posPct(r.dist, s.goal) + '%';
      const lane = this.lanes.get(r.playerId);
      const placeEl = lane?.querySelector<HTMLElement>('.mr-place');
      if (placeEl) placeEl.textContent = r.place != null ? `${r.place}등` : '';
    }

    if (s.phase === 'COUNTDOWN') {
      const remain = s.phaseEndsAt - (Date.now() - this.clockOffset);
      this.elHint.textContent = '곧 출발! 스페이스바 준비!';
      this.setBig(String(Math.max(1, Math.ceil(remain / 1000))));
    } else if (s.phase === 'RACING') {
      this.setBig('');
      this.elHint.textContent = '스페이스바(또는 버튼)를 연타해 달리세요!';
    } else {
      const winner = [...s.racers].sort((a, b) => rankKey(a) - rankKey(b))[0];
      this.setBig('FINISH!');
      this.elHint.textContent = winner ? `🏁 1등 — ${winner.nickname}` : '레이스 종료';
    }
    this.renderTimer();
  }

  private setBig(t: string) {
    const el = this.ctx.mount.querySelector('.mr-big');
    if (el) el.textContent = t;
  }

  private renderTimer() {
    const s = this.state;
    if (!s) return;
    const remain = s.phaseEndsAt - (Date.now() - this.clockOffset);
    this.elTimer.textContent = `${remain > 0 ? Math.ceil(remain / 1000) : 0}s`;
    if (s.phase === 'COUNTDOWN') this.setBig(String(Math.max(1, Math.ceil(remain / 1000))));
  }

  onEvent(): void {
    /* 상태로 충분 */
  }

  destroy(): void {
    if (this.timerInt) clearInterval(this.timerInt);
    this.timerInt = null;
    window.removeEventListener('keydown', this.keyHandler);
    this.ctx.mount.innerHTML = '';
  }
}

function rankKey(r: Racer): number {
  return r.place != null ? r.place : 1000 - r.dist; // 완주자 우선, 그다음 거리순
}

const clientModule: GameClientModule = {
  meta,
  create: (ctx) => new MashRaceClient(ctx),
};

export default clientModule;
