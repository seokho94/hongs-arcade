/** 스피드 퀴즈 클라이언트 (GameClient 구현) */
import type { GameClient, GameClientContext, GameClientModule } from '@mg/game-sdk/client';
import { meta } from './meta';

interface State {
  phase: 'QUESTION' | 'REVEAL';
  qIndex: number;
  totalQuestions: number;
  question: { text: string; choices: string[] };
  answerIndex: number | null;
  me: { answered: boolean; choice: number | null; delta: number | null; correct: boolean | null };
  answeredCount: number;
  totalPlayers: number;
  choiceCounts: number[] | null;
  scores: { playerId: string; nickname: string; score: number }[];
  phaseEndsAt: number;
  now: number;
}

const CH = [
  { sym: '▲', color: '#ff4d5e' },
  { sym: '◆', color: '#4da3ff' },
  { sym: '●', color: '#ffcf1e' },
  { sym: '■', color: '#3dff88' },
];

const STYLE = `
.sq{font-family:var(--kr,'Galmuri11',monospace);color:var(--text,#eaeaff)}
.sq-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.sq-top .pill{font-family:var(--pixel,'Press Start 2P',monospace);font-size:10px;background:rgba(0,234,255,.1);border:1px solid var(--cyan,#00eaff);color:var(--cyan,#00eaff);border-radius:6px;padding:6px 10px;text-shadow:0 0 6px rgba(0,234,255,.5)}
.sq-timer{font-family:var(--pixel,'Press Start 2P',monospace);font-size:18px;color:var(--yellow,#ffe500);text-shadow:0 0 10px var(--yellow,#ffe500)}
.sq-q{background:rgba(8,8,30,.75);border:2px solid var(--cyan,#00eaff);border-radius:12px;padding:24px 22px;text-align:center;font-size:22px;line-height:1.5;margin-bottom:16px;box-shadow:0 0 22px rgba(0,234,255,.25);text-shadow:0 0 8px rgba(0,234,255,.3)}
.sq-main{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.sq-left{flex:1 1 480px;min-width:320px}
.sq-choices{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.sq-choice{display:flex;align-items:center;gap:12px;font-family:var(--kr,'Galmuri11',monospace);font-size:17px;color:#08131f;
  background:var(--cc);border:none;border-radius:10px;padding:18px 16px;cursor:pointer;text-align:left;position:relative;
  box-shadow:0 5px 0 rgba(0,0,0,.4),0 0 18px var(--cc);transition:transform .05s,box-shadow .05s,opacity .1s,filter .1s}
.sq-choice:hover:not(:disabled){filter:brightness(1.08)}
.sq-choice:active:not(:disabled){transform:translateY(4px);box-shadow:0 1px 0 rgba(0,0,0,.4)}
.sq-choice .sq-sym{font-size:22px;font-weight:900}
.sq-choice .sq-txt{flex:1}
.sq-choice.mine{outline:4px solid #fff;outline-offset:2px}
.sq-choice.correct{box-shadow:0 0 0 4px var(--green,#3dff88),0 0 26px var(--green,#3dff88)}
.sq-choice.dim{opacity:.32;filter:grayscale(.55)}
.sq-choice:disabled{cursor:default}
.sq-choice .sq-cnt{position:absolute;right:10px;top:8px;font-family:var(--mono,monospace);font-size:12px;background:rgba(0,0,0,.45);color:#fff;border-radius:6px;padding:1px 8px}
.sq-banner{margin-top:16px;text-align:center;font-family:var(--pixel,'Press Start 2P',monospace);font-size:14px;min-height:22px}
.sq-banner.ok{color:var(--green,#3dff88);text-shadow:0 0 10px rgba(61,255,136,.6)}
.sq-banner.no{color:var(--magenta,#ff2e97);text-shadow:0 0 10px rgba(255,46,151,.6)}
.sq-banner.wait{color:var(--muted,#8f8fd0);font-family:var(--kr,'Galmuri11',monospace);font-size:14px;text-shadow:none}
.sq-right{flex:0 0 240px;display:flex;flex-direction:column;gap:12px}
.sq-scores{background:rgba(8,8,28,.72);border:2px solid var(--line,#2a2a66);border-radius:10px;padding:12px;box-shadow:inset 0 0 20px rgba(0,234,255,.06)}
.sq-scores h4{font-family:var(--pixel,'Press Start 2P',monospace);font-size:10px;margin:0 0 8px;color:var(--magenta,#ff2e97);text-shadow:0 0 8px rgba(255,46,151,.6);letter-spacing:1px}
.sq-scores .row{display:flex;justify-content:space-between;padding:4px 0;font-size:14px}
.sq-scores .row span:last-child{font-family:var(--mono,monospace);color:var(--yellow,#ffe500);text-shadow:0 0 6px rgba(255,229,0,.4)}
`;

function injectStyle() {
  if (document.getElementById('sq-style')) return;
  const s = document.createElement('style');
  s.id = 'sq-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

class SpeedQuizClient implements GameClient {
  private state: State | null = null;
  private prevQ = -1;
  private myPending = false;
  private clockOffset = 0;
  private timerInt: ReturnType<typeof setInterval> | null = null;

  private elTop!: HTMLElement;
  private elQ!: HTMLElement;
  private elChoices!: HTMLElement;
  private elBanner!: HTMLElement;
  private elScores!: HTMLElement;

  constructor(private readonly ctx: GameClientContext) {
    injectStyle();
    this.build();
    this.timerInt = setInterval(() => this.renderTimer(), 200);
  }

  private build() {
    const root = this.ctx.mount;
    root.innerHTML = `
      <div class="sq">
        <div class="sq-top">
          <span class="pill sq-idx">문제 -</span>
          <span class="pill sq-phase">-</span>
          <span class="sq-timer">--</span>
        </div>
        <div class="sq-q">-</div>
        <div class="sq-main">
          <div class="sq-left">
            <div class="sq-choices"></div>
            <div class="sq-banner"></div>
          </div>
          <div class="sq-right">
            <div class="sq-scores"><h4>SCORE</h4><div class="rows"></div></div>
          </div>
        </div>
      </div>`;
    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.elTop = q('.sq-top');
    this.elQ = q('.sq-q');
    this.elChoices = q('.sq-choices');
    this.elBanner = q('.sq-banner');
    this.elScores = q('.sq-scores .rows');

    this.elChoices.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.sq-choice') as HTMLElement | null;
      if (!btn || btn.hasAttribute('disabled')) return;
      this.answer(Number(btn.dataset.i));
    });
  }

  private answer(i: number) {
    const s = this.state;
    if (!s || s.phase !== 'QUESTION' || s.me.answered || this.myPending) return;
    this.myPending = true;
    this.ctx.sendAction({ type: 'answer', choice: i });
    this.renderChoices();
  }

  onState(raw: unknown): void {
    const s = raw as State;
    this.state = s;
    this.clockOffset = Date.now() - s.now;
    if (s.qIndex !== this.prevQ) this.myPending = false;
    if (s.me.answered || s.phase === 'REVEAL') this.myPending = false;

    (this.elTop.querySelector('.sq-idx') as HTMLElement).textContent = `문제 ${s.qIndex}/${s.totalQuestions}`;
    (this.elTop.querySelector('.sq-phase') as HTMLElement).textContent = s.phase === 'QUESTION' ? '문제' : '정답 공개';
    this.elQ.textContent = s.question.text;

    this.renderChoices();
    this.renderBanner();
    this.renderScores();
    this.renderTimer();
    this.prevQ = s.qIndex;
  }

  private renderChoices() {
    const s = this.state;
    if (!s) return;
    const reveal = s.phase === 'REVEAL';
    const locked = s.me.answered || this.myPending || reveal;
    this.elChoices.innerHTML = s.question.choices
      .map((c, i) => {
        const cls: string[] = [];
        if (i === s.me.choice) cls.push('mine');
        if (reveal) {
          if (i === s.answerIndex) cls.push('correct');
          else cls.push('dim');
        }
        const cnt = reveal && s.choiceCounts ? `<span class="sq-cnt">${s.choiceCounts[i] ?? 0}</span>` : '';
        const meColor = CH[i]?.color ?? '#888';
        const sym = CH[i]?.sym ?? '?';
        return `<button class="sq-choice ${cls.join(' ')}" data-i="${i}" style="--cc:${meColor}" ${locked ? 'disabled' : ''}>
          <span class="sq-sym">${sym}</span><span class="sq-txt">${esc(c)}</span>${cnt}</button>`;
      })
      .join('');
  }

  private renderBanner() {
    const s = this.state!;
    const b = this.elBanner;
    b.className = 'sq-banner';
    if (s.phase === 'QUESTION') {
      if (s.me.answered || this.myPending) {
        b.classList.add('wait');
        b.textContent = `답변 완료! 결과 대기 중… (${s.answeredCount}/${s.totalPlayers})`;
      } else {
        b.classList.add('wait');
        b.textContent = '정답을 선택하세요!';
      }
    } else {
      if (s.me.correct) {
        b.classList.add('ok');
        b.textContent = `정답! +${s.me.delta}`;
      } else {
        b.classList.add('no');
        b.textContent = s.me.answered ? '오답 😢' : '시간 초과 ⏱';
      }
    }
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
    (this.elTop.querySelector('.sq-timer') as HTMLElement).textContent = `${remain > 0 ? Math.ceil(remain / 1000) : 0}s`;
  }

  onEvent(): void {
    /* 이벤트는 상태(pushState)로 충분 — 별도 처리 없음 */
  }

  destroy(): void {
    if (this.timerInt) clearInterval(this.timerInt);
    this.timerInt = null;
    this.ctx.mount.innerHTML = '';
  }
}

const clientModule: GameClientModule = {
  meta,
  create: (ctx) => new SpeedQuizClient(ctx),
};

export default clientModule;
