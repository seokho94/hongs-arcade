/** 눈치게임 클라이언트 (GameClient 구현) */
import type { GameClient, GameClientContext, GameClientModule } from '@mg/game-sdk/client';
import { meta } from './meta';

type Status = 'alive' | 'called' | 'clashed';
interface PlayerView {
  id: string;
  nickname: string;
  status: Status;
  order: number | null;
}
interface State {
  phase: 'COUNTDOWN' | 'PLAYING' | 'ROUND_RESULT';
  round: number;
  totalRounds: number;
  callCount: number;
  phaseEndsAt: number;
  now: number;
  players: PlayerView[];
  scores: { playerId: string; nickname: string; score: number }[];
  me: { status: Status; canPress: boolean };
  roundResult: { loserId: string | null; loserNick: string | null } | null;
}

const PHASE_LABEL: Record<State['phase'], string> = {
  COUNTDOWN: '준비',
  PLAYING: '외치는 중',
  ROUND_RESULT: '라운드 결과',
};

const STYLE = `
.nc{font-family:var(--kr,'Galmuri11',monospace);color:var(--text,#eaeaff)}
.nc-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.nc-top .pill{font-family:var(--pixel,'Press Start 2P',monospace);font-size:10px;background:rgba(0,234,255,.1);border:1px solid var(--cyan,#00eaff);color:var(--cyan,#00eaff);border-radius:6px;padding:6px 10px;text-shadow:0 0 6px rgba(0,234,255,.5)}
.nc-timer{font-family:var(--pixel,'Press Start 2P',monospace);font-size:18px;color:var(--yellow,#ffe500);text-shadow:0 0 10px var(--yellow,#ffe500)}
.nc-main{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.nc-left{flex:1 1 480px;min-width:320px}
.nc-center{min-height:230px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
  background:radial-gradient(circle at 50% 30%,rgba(0,234,255,.08),rgba(8,8,32,.9));
  border:2px solid var(--cyan,#00eaff);border-radius:14px;padding:26px;text-align:center;
  box-shadow:0 0 24px rgba(0,234,255,.25),inset 0 0 30px rgba(0,234,255,.05)}
.nc-count{font-family:var(--pixel,'Press Start 2P',monospace);font-size:76px;color:var(--cyan,#00eaff);line-height:1;text-shadow:0 0 18px var(--cyan,#00eaff),0 0 4px #fff}
.nc-shout{font-family:var(--pixel,'Press Start 2P',monospace);font-size:22px;padding:28px 56px;border-radius:14px;border:3px solid #5a0e37;background:var(--magenta,#ff2e97);color:#fff;cursor:pointer;text-shadow:0 0 6px rgba(0,0,0,.4);box-shadow:0 8px 0 #a01461,0 0 28px rgba(255,46,151,.6);transition:transform .05s,box-shadow .05s}
.nc-shout:hover{filter:brightness(1.1)}
.nc-shout:active{transform:translateY(6px);box-shadow:0 2px 0 #a01461}
.nc-shout:disabled{background:#33335a;color:#7a7aa0;border-color:#26264a;box-shadow:0 6px 0 #202040;cursor:not-allowed;filter:none}
.nc-hint{color:var(--muted,#8f8fd0);margin:0;font-size:13px}
.nc-big{font-family:var(--pixel,'Press Start 2P',monospace);font-size:22px;color:var(--yellow,#ffe500);text-shadow:0 0 14px var(--yellow,#ffe500)}
.nc-players{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.nc-p{display:flex;align-items:center;gap:6px;border:2px solid var(--line,#2a2a66);border-radius:999px;padding:6px 12px;font-size:14px;background:rgba(8,8,28,.6);color:var(--text,#eaeaff)}
.nc-p.called{background:rgba(61,255,136,.12);border-color:var(--green,#3dff88);color:var(--green,#3dff88);text-shadow:0 0 6px rgba(61,255,136,.5)}
.nc-p.clashed{background:rgba(255,46,151,.12);border-color:var(--magenta,#ff2e97);color:var(--magenta,#ff2e97);text-decoration:line-through}
.nc-p.loser{background:rgba(255,229,0,.14);border-color:var(--yellow,#ffe500);color:var(--yellow,#ffe500);text-decoration:none;font-weight:700;text-shadow:0 0 8px rgba(255,229,0,.6)}
.nc-p .ord{font-family:var(--mono,monospace);font-size:11px;background:var(--green,#3dff88);color:#04121a;border-radius:999px;padding:1px 7px}
.nc-right{flex:0 0 240px;display:flex;flex-direction:column;gap:12px}
.nc-scores{background:rgba(8,8,28,.72);border:2px solid var(--line,#2a2a66);border-radius:10px;padding:12px;box-shadow:inset 0 0 20px rgba(0,234,255,.06)}
.nc-scores h4{font-family:var(--pixel,'Press Start 2P',monospace);font-size:10px;margin:0 0 8px;color:var(--magenta,#ff2e97);text-shadow:0 0 8px rgba(255,46,151,.6);letter-spacing:1px}
.nc-scores .row{display:flex;justify-content:space-between;padding:4px 0;font-size:14px}
.nc-scores .row span:last-child{font-family:var(--mono,monospace);color:var(--yellow,#ffe500);text-shadow:0 0 6px rgba(255,229,0,.4)}
.nc-feed{height:220px;overflow-y:auto;background:#05050f;border:2px solid var(--line,#2a2a66);border-radius:10px;padding:10px;font-family:var(--mono,monospace);font-size:12px;color:var(--green,#3dff88);text-shadow:0 0 5px rgba(61,255,136,.35);display:flex;flex-direction:column;gap:3px}
.nc-feed .sys{color:var(--muted,#8f8fd0);text-shadow:none}
.nc-feed .call{color:var(--green,#3dff88);font-weight:700}
.nc-feed .clash{color:var(--magenta,#ff2e97);text-shadow:0 0 8px rgba(255,46,151,.5);font-weight:700}
`;

function injectStyle() {
  if (document.getElementById('nc-style')) return;
  const s = document.createElement('style');
  s.id = 'nc-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

class NunchiClient implements GameClient {
  private state: State | null = null;
  private prevPhase: State['phase'] | null = null;
  private prevRound = -1;
  private myPressPending = false;
  private clockOffset = 0;
  private timerInt: ReturnType<typeof setInterval> | null = null;

  private elRound!: HTMLElement;
  private elPhase!: HTMLElement;
  private elTimer!: HTMLElement;
  private elCenter!: HTMLElement;
  private elPlayers!: HTMLElement;
  private elScores!: HTMLElement;
  private elFeed!: HTMLElement;

  constructor(private readonly ctx: GameClientContext) {
    injectStyle();
    this.build();
    this.timerInt = setInterval(() => this.renderTimer(), 200);
  }

  private build() {
    const root = this.ctx.mount;
    root.innerHTML = `
      <div class="nc">
        <div class="nc-top">
          <span class="pill nc-round">라운드 -</span>
          <span class="pill nc-phase">-</span>
          <span class="nc-timer">--</span>
        </div>
        <div class="nc-main">
          <div class="nc-left">
            <div class="nc-center"></div>
            <div class="nc-players"></div>
          </div>
          <div class="nc-right">
            <div class="nc-scores"><h4>점수</h4><div class="rows"></div></div>
            <div class="nc-feed"></div>
          </div>
        </div>
      </div>`;
    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.elRound = q('.nc-round');
    this.elPhase = q('.nc-phase');
    this.elTimer = q('.nc-timer');
    this.elCenter = q('.nc-center');
    this.elPlayers = q('.nc-players');
    this.elScores = q('.nc-scores .rows');
    this.elFeed = q('.nc-feed');

    // 이벤트 위임: nc-center를 다시 그려도 핸들러 유지
    this.elCenter.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.classList.contains('nc-shout')) this.press();
    });
  }

  private press() {
    const s = this.state;
    if (!s || !s.me.canPress || this.myPressPending) return;
    this.myPressPending = true;
    this.ctx.sendAction({ type: 'press' });
    this.updateButton();
  }

  private feed(text: string, cls = '') {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text;
    this.elFeed.appendChild(d);
    this.elFeed.scrollTop = this.elFeed.scrollHeight;
  }

  onState(raw: unknown): void {
    const s = raw as State;
    this.state = s;
    this.clockOffset = Date.now() - s.now;

    if (s.round !== this.prevRound) this.myPressPending = false;
    if (s.phase !== 'PLAYING' || s.me.status !== 'alive') this.myPressPending = false;

    this.elRound.textContent = `라운드 ${s.round}/${s.totalRounds}`;
    this.elPhase.textContent = PHASE_LABEL[s.phase];

    if (s.phase !== this.prevPhase) this.renderCenter();
    this.updateButton();
    this.updateHint();
    this.renderPlayers();
    this.renderScores();
    this.renderTimer();

    this.prevPhase = s.phase;
    this.prevRound = s.round;
  }

  private renderCenter() {
    const s = this.state!;
    if (s.phase === 'COUNTDOWN') {
      this.elCenter.innerHTML = `<div class="nc-count">3</div><p class="nc-hint">순서대로 한 명씩! 동시에 외치면 둘 다 탈락!</p>`;
    } else if (s.phase === 'PLAYING') {
      this.elCenter.innerHTML = `<button class="nc-shout">외치기!</button><p class="nc-hint"></p>`;
    } else {
      const loser = s.roundResult?.loserNick;
      this.elCenter.innerHTML = `<div class="nc-big">${loser ? `😵 ${esc(loser)} 패배!` : '무승부!'}</div><p class="nc-hint">잠시 후 다음 라운드…</p>`;
    }
  }

  private updateButton() {
    const s = this.state;
    if (!s) return;
    const btn = this.elCenter.querySelector<HTMLButtonElement>('.nc-shout');
    if (!btn) return;
    const order = s.players.find((p) => p.id === this.ctx.me.id)?.order ?? null;
    if (s.me.status === 'called') {
      btn.disabled = true;
      btn.textContent = `✅ 외쳤다! ${order ?? ''}번`;
    } else if (s.me.status === 'clashed') {
      btn.disabled = true;
      btn.textContent = '💥 탈락';
    } else if (this.myPressPending) {
      btn.disabled = true;
      btn.textContent = '외치는 중…';
    } else {
      btn.disabled = !s.me.canPress;
      btn.textContent = '외치기!';
    }
  }

  private updateHint() {
    const s = this.state!;
    if (s.phase !== 'PLAYING') return;
    const hint = this.elCenter.querySelector('.nc-hint');
    if (hint) hint.textContent = `지금까지 ${s.callCount}명 외침 · 남은 사람: ${s.players.filter((p) => p.status === 'alive').length}명`;
  }

  private renderPlayers() {
    const s = this.state!;
    const loserId = s.roundResult?.loserId ?? null;
    this.elPlayers.innerHTML = s.players
      .map((p) => {
        const cls = p.id === loserId ? 'loser' : p.status;
        const ord = p.order != null ? `<span class="ord">${p.order}</span>` : '';
        return `<span class="nc-p ${cls}">${esc(p.nickname)}${ord}</span>`;
      })
      .join('');
  }

  private renderScores() {
    const s = this.state!;
    this.elScores.innerHTML = s.scores
      .map((sc) => `<div class="row"><span>${esc(sc.nickname)}</span><span>${sc.score}</span></div>`)
      .join('');
  }

  private renderTimer() {
    const s = this.state;
    if (!s) return;
    const remain = s.phaseEndsAt - (Date.now() - this.clockOffset);
    const sec = remain > 0 ? Math.ceil(remain / 1000) : 0;
    this.elTimer.textContent = `${sec}s`;
    if (s.phase === 'COUNTDOWN') {
      const c = this.elCenter.querySelector('.nc-count');
      if (c) c.textContent = String(Math.max(1, sec));
    }
  }

  onEvent(event: string, payload: unknown): void {
    const p = payload as Record<string, unknown>;
    switch (event) {
      case 'round:start':
        this.feed(`— 라운드 ${p.round} 시작 —`, 'sys');
        break;
      case 'go':
        this.feed('시작! 눈치껏 외치세요', 'sys');
        break;
      case 'call':
        this.feed(`${p.order}번 — ${p.nickname} ✋`, 'call');
        break;
      case 'clash': {
        const names = (p.players as { nickname: string }[]).map((x) => x.nickname).join(', ');
        this.feed(`💥 ${names} 동시에 외침! 탈락`, 'clash');
        break;
      }
      case 'round:end':
        this.feed(p.loserNick ? `😵 ${p.loserNick} 패배` : '무승부', 'sys');
        break;
    }
  }

  destroy(): void {
    if (this.timerInt) clearInterval(this.timerInt);
    this.timerInt = null;
    this.ctx.mount.innerHTML = '';
  }
}

const clientModule: GameClientModule = {
  meta,
  create: (ctx) => new NunchiClient(ctx),
};

export default clientModule;
