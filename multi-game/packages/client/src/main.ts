import './style.css';
import { io, type Socket } from 'socket.io-client';
import type { GameClient, GameClientContext } from '@mg/game-sdk/client';
import type { ChatMessage, GameResult, LobbyData, Player, RoomDetail } from '@mg/shared';
import { EV } from '@mg/shared';
import { getClientGame } from './games';

const SERVER_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SERVER_URL ??
  `http://${location.hostname || 'localhost'}:3000`;

type Screen = 'login' | 'lobby' | 'room';

const app = document.getElementById('app')!;
const socket: Socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

let me: Player = { id: '', nickname: '' };
let token: string | null = localStorage.getItem('mg-token');
let nickname = localStorage.getItem('mg-nick') ?? '';
let haveLoggedIn = false;

let screen: Screen = 'login';
let inGame = false;
let lobby: LobbyData | null = null;
let room: RoomDetail | null = null;
let chatLog: { nickname: string; text: string; sys?: boolean }[] = [];
let lastResult: GameResult | null = null;

let game: { client: GameClient; mount: HTMLElement } | null = null;

// ── 유틸 ──────────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
function toast(msg: string): void {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
function emit<T = unknown>(event: string, data?: unknown): Promise<T> {
  return new Promise((resolve) => {
    const cb = (res: T) => resolve(res);
    // 데이터가 없는 이벤트는 ack 콜백만 보내야 함 (undefined를 보내면 서버가 ack를 데이터로 오인)
    if (data === undefined) socket.emit(event, cb);
    else socket.emit(event, data, cb);
  });
}

const ERR_MSG: Record<string, string> = {
  full: '방이 가득 찼습니다.',
  'in-progress': '이미 게임이 진행 중입니다.',
  'no-room': '방을 찾을 수 없습니다.',
  'not-host': '방장만 할 수 있습니다.',
  'not-enough': '인원이 부족합니다.',
  'not-ready': '모든 인원이 준비되어야 합니다.',
  'unknown-game': '알 수 없는 게임입니다.',
};

// ── 로그인 ────────────────────────────────────────────────────────
function doHello(nick: string): void {
  socket.emit(EV.SESSION_HELLO, { token, nickname: nick }, (res: { playerId: string; token: string; nickname: string }) => {
    me = { id: res.playerId, nickname: res.nickname };
    token = res.token;
    nickname = res.nickname;
    localStorage.setItem('mg-token', token);
    localStorage.setItem('mg-nick', nickname);
    const first = !haveLoggedIn;
    haveLoggedIn = true;
    if (first && screen === 'login') {
      screen = 'lobby';
      void emit<LobbyData>(EV.LOBBY_LIST).then((d) => {
        lobby = d;
        render();
      });
    }
  });
}

// ── 렌더 ──────────────────────────────────────────────────────────
function render(): void {
  if (inGame) return; // 게임 화면은 게임 클라이언트가 DOM을 소유
  if (screen === 'login') return renderLogin();
  if (screen === 'lobby') return renderLobby();
  if (screen === 'room') return renderRoom();
}

function renderLogin(): void {
  app.innerHTML = `
    <h1>🎮 Multi-Game</h1>
    <div class="card">
      <h2>입장</h2>
      <div class="row">
        <input type="text" id="nick" maxlength="20" placeholder="닉네임" value="${esc(nickname)}" />
        <button id="enter">입장</button>
      </div>
      <p class="muted">닉네임을 입력하고 입장하면 로비로 이동합니다.</p>
    </div>`;
  const input = app.querySelector<HTMLInputElement>('#nick')!;
  const go = () => {
    const v = input.value.trim();
    if (!v) return toast('닉네임을 입력하세요.');
    doHello(v);
  };
  app.querySelector('#enter')!.addEventListener('click', go);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  input.focus();
}

function renderLobby(): void {
  const games = lobby?.games ?? [];
  const rooms = lobby?.rooms ?? [];
  app.innerHTML = `
    <h1>🎮 로비 <span class="muted" style="font-size:14px">— ${esc(me.nickname)}</span></h1>
    <div class="card">
      <h2>게임 만들기</h2>
      <div class="game-grid">
        ${games
          .map(
            (g) => `
          <div class="game-card">
            <strong>${esc(g.name)}</strong>
            <span class="muted">${esc(g.description ?? '')}</span>
            <span class="muted">${g.minPlayers}~${g.maxPlayers}명</span>
            <button data-create="${g.id}">방 만들기</button>
          </div>`,
          )
          .join('')}
      </div>
    </div>
    <div class="card">
      <div class="row"><h2 style="margin:0">열린 방 (${rooms.length})</h2><div class="spacer"></div>
        <button class="ghost" id="refresh">새로고침</button></div>
      <div class="list" style="margin-top:12px">
        ${
          rooms.length === 0
            ? '<p class="muted">아직 열린 방이 없습니다. 새 방을 만들어 보세요.</p>'
            : rooms
                .map(
                  (r) => `
          <div class="list-item">
            <span class="tag">${esc(r.gameName)}</span>
            <strong>방 ${esc(r.id)}</strong>
            <span class="muted">${r.playerCount}/${r.capacity.max}명</span>
            <span class="badge">${r.phase === 'WAITING' ? '대기중' : '게임중'}</span>
            <div class="spacer"></div>
            <button data-join="${r.id}" ${r.phase !== 'WAITING' || r.playerCount >= r.capacity.max ? 'disabled' : ''}>입장</button>
          </div>`,
                )
                .join('')
        }
      </div>
    </div>`;

  app.querySelectorAll<HTMLElement>('[data-create]').forEach((b) =>
    b.addEventListener('click', async () => {
      const res = await emit<{ ok: boolean; error?: string }>(EV.ROOM_CREATE, { gameId: b.dataset.create });
      if (!res.ok) toast(ERR_MSG[res.error ?? ''] ?? '방 생성 실패');
    }),
  );
  app.querySelectorAll<HTMLElement>('[data-join]').forEach((b) =>
    b.addEventListener('click', async () => {
      const res = await emit<{ ok: boolean; error?: string }>(EV.ROOM_JOIN, { roomId: b.dataset.join });
      if (!res.ok) toast(ERR_MSG[res.error ?? ''] ?? '입장 실패');
    }),
  );
  app.querySelector('#refresh')!.addEventListener('click', () => {
    void emit<LobbyData>(EV.LOBBY_LIST).then((d) => {
      lobby = d;
      render();
    });
  });
}

function renderRoom(): void {
  if (!room) return renderLobby();
  const amHost = room.hostId === me.id;
  const myReady = room.players.find((p) => p.id === me.id)?.ready ?? false;
  const allReady = room.players.length > 0 && room.players.every((p) => p.ready);
  const canStart = amHost && room.players.length >= room.capacity.min && allReady;

  app.innerHTML = `
    <h1>방 ${esc(room.id)} <span class="tag">${esc(room.gameName)}</span></h1>
    ${lastResult ? renderResult(lastResult) : ''}
    <div class="card">
      <div class="row"><h2 style="margin:0">참가자 (${room.players.length}/${room.capacity.max})</h2>
        <div class="spacer"></div>
        <span class="muted">최소 ${room.capacity.min}명</span></div>
      <div class="list" style="margin-top:12px">
        ${room.players
          .map(
            (p) => `
          <div class="list-item">
            <strong>${esc(p.nickname)}</strong>
            ${p.isHost ? '<span class="badge host">방장</span>' : ''}
            ${p.ready ? '<span class="badge ready">준비완료</span>' : '<span class="badge">대기</span>'}
            <div class="spacer"></div>
            ${amHost && p.id !== me.id ? `<button class="danger ghost" data-kick="${p.id}">강퇴</button>` : ''}
          </div>`,
          )
          .join('')}
      </div>
      <div class="row wrap" style="margin-top:16px">
        <button id="ready" class="${myReady ? 'ghost' : ''}">${myReady ? '준비 취소' : '준비'}</button>
        ${amHost ? `<button id="start" ${canStart ? '' : 'disabled'}>게임 시작</button>` : ''}
        <div class="spacer"></div>
        <button id="leave" class="danger ghost">방 나가기</button>
      </div>
      ${amHost && !canStart ? `<p class="muted" style="margin-top:8px">시작 조건: ${room.capacity.min}명 이상 + 전원 준비완료</p>` : ''}
    </div>
    <div class="card">
      <h2>채팅</h2>
      <div class="chat-log" id="chatlog">${chatLog.map(chatLine).join('')}</div>
      <div class="row" style="margin-top:10px">
        <input type="text" id="chatin" maxlength="300" placeholder="메시지 입력" />
        <button id="chatsend">전송</button>
      </div>
    </div>`;

  app.querySelector('#ready')!.addEventListener('click', () => socket.emit(EV.ROOM_READY, { ready: !myReady }));
  app.querySelector('#leave')!.addEventListener('click', () => {
    socket.emit(EV.ROOM_LEAVE);
    room = null;
    lastResult = null;
    screen = 'lobby';
    void emit<LobbyData>(EV.LOBBY_LIST).then((d) => {
      lobby = d;
      render();
    });
  });
  app.querySelector('#start')?.addEventListener('click', async () => {
    const res = await emit<{ ok: boolean; error?: string }>(EV.ROOM_START);
    if (!res.ok) toast(ERR_MSG[res.error ?? ''] ?? '시작할 수 없습니다.');
  });
  app.querySelectorAll<HTMLElement>('[data-kick]').forEach((b) =>
    b.addEventListener('click', () => socket.emit(EV.ROOM_KICK, { playerId: b.dataset.kick })),
  );
  const chatin = app.querySelector<HTMLInputElement>('#chatin')!;
  const send = () => {
    const v = chatin.value.trim();
    if (!v) return;
    socket.emit(EV.CHAT_MESSAGE, { text: v });
    chatin.value = '';
  };
  app.querySelector('#chatsend')!.addEventListener('click', send);
  chatin.addEventListener('keydown', (e) => e.key === 'Enter' && send());
  scrollChat();
}

function chatLine(m: { nickname: string; text: string; sys?: boolean }): string {
  if (m.sys) return `<div class="sys">${esc(m.text)}</div>`;
  return `<div><strong>${esc(m.nickname)}</strong>: ${esc(m.text)}</div>`;
}
function scrollChat(): void {
  const el = document.getElementById('chatlog');
  if (el) el.scrollTop = el.scrollHeight;
}
function renderResult(result: GameResult): string {
  return `
    <div class="result-overlay">
      <h2>🏆 게임 결과</h2>
      ${result.rankings
        .map(
          (r) =>
            `<div class="rank"><span>${r.rank}위 — ${esc(r.nickname)}</span><strong>${r.score}점</strong></div>`,
        )
        .join('')}
    </div>`;
}

// ── 게임 화면 ─────────────────────────────────────────────────────
function enterGame(gameId: string, gameName: string): void {
  const mod = getClientGame(gameId);
  if (!mod) {
    toast('지원하지 않는 게임입니다.');
    return;
  }
  lastResult = null;
  inGame = true;
  app.innerHTML = `
    <div class="row"><h1 style="margin:0">${esc(gameName)}</h1><div class="spacer"></div>
      <button class="danger ghost" id="gleave">나가기</button></div>
    <div class="card"><div id="game-mount"></div></div>`;
  app.querySelector('#gleave')!.addEventListener('click', () => {
    socket.emit(EV.ROOM_LEAVE);
    teardownGame();
    room = null;
    screen = 'lobby';
    void emit<LobbyData>(EV.LOBBY_LIST).then((d) => {
      lobby = d;
      render();
    });
  });

  const mount = app.querySelector<HTMLElement>('#game-mount')!;
  const players: Player[] = (room?.players ?? []).map((p) => ({ id: p.id, nickname: p.nickname }));
  const ctx: GameClientContext = {
    me,
    players,
    mount,
    sendAction: (action) => socket.emit(EV.GAME_ACTION, { action }),
  };
  game = { client: mod.create(ctx), mount };
}

function teardownGame(): void {
  if (game) {
    try {
      game.client.destroy();
    } catch {
      /* ignore */
    }
    game = null;
  }
  inGame = false;
}

function exitGame(result: GameResult): void {
  if (game) {
    try {
      game.client.onEnd?.(result);
    } catch {
      /* ignore */
    }
  }
  teardownGame();
  lastResult = result;
  screen = 'room';
  render();
}

// ── 소켓 이벤트 ───────────────────────────────────────────────────
socket.on('connect', () => {
  if (haveLoggedIn) doHello(nickname); // 재접속 시 재동기화
});

socket.on(EV.LOBBY_UPDATE, (data: LobbyData) => {
  lobby = data;
  if (screen === 'lobby' && !inGame) render();
});

socket.on(EV.ROOM_UPDATE, (data: RoomDetail) => {
  room = data;
  if (!inGame && (screen === 'lobby' || screen === 'room')) {
    screen = 'room';
    render();
  }
});

socket.on(EV.ROOM_CLOSED, (data: { reason: string }) => {
  toast(data.reason === 'kicked' ? '방에서 강퇴되었습니다.' : '방이 닫혔습니다.');
  teardownGame();
  room = null;
  screen = 'lobby';
  void emit<LobbyData>(EV.LOBBY_LIST).then((d) => {
    lobby = d;
    render();
  });
});

socket.on(EV.CHAT_MESSAGE, (m: ChatMessage) => {
  chatLog.push({ nickname: m.nickname, text: m.text });
  if (chatLog.length > 100) chatLog = chatLog.slice(-100);
  if (screen === 'room' && !inGame) {
    const el = document.getElementById('chatlog');
    if (el) {
      el.insertAdjacentHTML('beforeend', chatLine({ nickname: m.nickname, text: m.text }));
      scrollChat();
    }
  }
});

socket.on(EV.GAME_START, (data: { gameId: string; meta: { name: string } }) => {
  enterGame(data.gameId, data.meta?.name ?? '게임');
});
socket.on(EV.GAME_STATE, (data: { state: unknown }) => game?.client.onState(data.state));
socket.on(EV.GAME_EVENT, (data: { event: string; payload: unknown }) =>
  game?.client.onEvent(data.event, data.payload),
);
socket.on(EV.GAME_END, (data: { result: GameResult }) => exitGame(data.result));
socket.on(EV.ERROR, (data: { code: string; message: string }) => toast(data.message));

// ── 부트스트랩 ────────────────────────────────────────────────────
render();
