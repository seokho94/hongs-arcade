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
.nc{font-family:system-ui,sans-serif;color:#1f2430}
.nc-top{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:12px;font-size:14px}
.nc-top .pill{background:#eef1f6;border-radius:999px;padding:4px 12px}
.nc-timer{font-weight:700;color:#e23b3b}
.nc-main{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.nc-left{flex:1 1 480px;min-width:320px}
.nc-center{min-height:200px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
  background:#fff;border:2px solid #d6dae3;border-radius:12px;padding:24px;text-align:center}
.nc-count{font-size:88px;font-weight:800;color:#2f6fe2;line-height:1}
.nc-shout{font-size:30px;font-weight:800;padding:26px 60px;border-radius:16px;border:none;background:#2f6fe2;color:#fff;cursor:pointer}
.nc-shout:disabled{background:#c7ccd6;cursor:not-allowed}
.nc-hint{color:#6b7280;margin:0}
.nc-big{font-size:40px;font-weight:800}
.nc-players{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.nc-p{display:flex;align-items:center;gap:6px;border:1px solid #e2e6ee;border-radius:999px;padding:6px 12px;font-size:14px;background:#fff}
.nc-p.called{background:#def7e5;border-color:#9fe3b4;color:#1f8a44}
.nc-p.clashed{background:#ffe1e1;border-color:#f3b0b0;color:#c23434;text-decoration:line-through}
.nc-p.loser{background:#fff3d6;border-color:#f0d089;color:#9a6b00;text-decoration:none;font-weight:700}
.nc-p .ord{font-size:11px;background:#1f8a44;color:#fff;border-radius:999px;padding:1px 7px}
.nc-right{flex:0 0 240px;display:flex;flex-direction:column;gap:10px}
.nc-scores{background:#f7f8fb;border:1px solid #e5e8ee;border-radius:10px;padding:10px}
.nc-scores h4{margin:0 0 6px;font-size:13px;color:#6b7280}
.nc-scores .row{display:flex;justify-content:space-between;padding:3px 0;font-size:14px}
.nc-feed{height:220px;overflow-y:auto;background:#fff;border:1px solid #e5e8ee;border-radius:10px;padding:8px;font-size:13px;display:flex;flex-direction:column;gap:3px}
.nc-feed .sys{color:#6b7280;font-style:italic}
.nc-feed .call{color:#1f8a44;font-weight:700}
.nc-feed .clash{color:#c23434;font-weight:700}
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
