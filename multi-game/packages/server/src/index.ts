/** Multi-Game 서버 (코어): 접속·세션·로비·방장 룸·채팅·게임 라우팅 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import type { GameMeta, GameResult, LobbyData, RoomDetail } from '@mg/shared';
import { EV } from '@mg/shared';
import { getGame, gameMetas } from './games';
import { GameRuntime } from './gameRuntime';

const PORT = Number(process.env.PORT ?? 3000);
const GRACE_MS = 30_000; // 재접속 유예

interface Session {
  id: string;
  nickname: string;
  socketId: string | null;
  roomId: string | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

interface Member {
  playerId: string;
  nickname: string;
  ready: boolean;
}

interface Room {
  id: string;
  gameId: string;
  meta: GameMeta;
  hostId: string;
  members: Member[];
  phase: 'WAITING' | 'IN_GAME' | 'FINISHED';
  runtime: GameRuntime | null;
}

const sessions = new Map<string, Session>();
const rooms = new Map<string, Room>();

// ── HTTP + Socket.IO ──────────────────────────────────────────────
const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, sessions: sessions.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, { cors: { origin: '*' } });

// ── 헬퍼 ──────────────────────────────────────────────────────────
function shortId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
}

function sessionOf(socket: { data: { sessionId?: string } }): Session | undefined {
  const id = socket.data.sessionId;
  return id ? sessions.get(id) : undefined;
}

function socketIdOf(playerId: string): string | null {
  return sessions.get(playerId)?.socketId ?? null;
}

function lobbyData(): LobbyData {
  return {
    games: gameMetas(),
    rooms: [...rooms.values()].map((r) => ({
      id: r.id,
      gameId: r.gameId,
      gameName: r.meta.name,
      hostId: r.hostId,
      playerCount: r.members.length,
      capacity: { min: r.meta.minPlayers, max: r.meta.maxPlayers },
      phase: r.phase,
    })),
  };
}

function broadcastLobby(): void {
  io.emit(EV.LOBBY_UPDATE, lobbyData());
}

function roomDetail(r: Room): RoomDetail {
  return {
    id: r.id,
    gameId: r.gameId,
    gameName: r.meta.name,
    hostId: r.hostId,
    capacity: { min: r.meta.minPlayers, max: r.meta.maxPlayers },
    phase: r.phase,
    players: r.members.map((m) => ({
      id: m.playerId,
      nickname: m.nickname,
      isHost: m.playerId === r.hostId,
      ready: m.ready,
    })),
  };
}

function emitRoom(r: Room): void {
  io.to(r.id).emit(EV.ROOM_UPDATE, roomDetail(r));
}

function makeTransport(roomId: string) {
  return {
    pushState(playerId: string, state: unknown) {
      const sid = socketIdOf(playerId);
      if (sid) io.to(sid).emit(EV.GAME_STATE, { state });
    },
    emitEvent(event: string, payload: unknown) {
      io.to(roomId).emit(EV.GAME_EVENT, { event, payload });
    },
    emitEventTo(playerId: string, event: string, payload: unknown) {
      const sid = socketIdOf(playerId);
      if (sid) io.to(sid).emit(EV.GAME_EVENT, { event, payload });
    },
  };
}

function startGame(r: Room): void {
  const mod = getGame(r.gameId);
  if (!mod) return;
  r.phase = 'IN_GAME';
  const runtime = new GameRuntime(
    mod,
    () => r.members.map((m) => ({ id: m.playerId, nickname: m.nickname })),
    makeTransport(r.id),
    (result) => onGameEnd(r, result),
  );
  r.runtime = runtime;
  io.to(r.id).emit(EV.GAME_START, { gameId: r.gameId, meta: r.meta });
  runtime.start();
  emitRoom(r);
  broadcastLobby();
}

function onGameEnd(r: Room, result: GameResult): void {
  io.to(r.id).emit(EV.GAME_END, { result });
  r.runtime?.dispose();
  r.runtime = null;
  r.phase = 'WAITING';
  for (const m of r.members) m.ready = false;
  emitRoom(r);
  broadcastLobby();
}

/** 세션을 현재 룸에서 제거 (이탈/강퇴/연결종료 공통) */
function leaveRoom(session: Session): void {
  const r = session.roomId ? rooms.get(session.roomId) : null;
  session.roomId = null;
  if (!r) return;

  const sid = session.socketId;
  if (sid) io.sockets.sockets.get(sid)?.leave(r.id);

  r.members = r.members.filter((m) => m.playerId !== session.id);

  // 게임 진행 중이면 게임에 알림 (멤버 제거 후 호출 → players()가 최신)
  if (r.phase === 'IN_GAME' && r.runtime) r.runtime.playerLeft(session.id);

  if (r.members.length === 0) {
    r.runtime?.dispose();
    rooms.delete(r.id);
  } else {
    if (r.hostId === session.id) r.hostId = r.members[0]!.playerId; // 방장 위임
    emitRoom(r);
  }
  broadcastLobby();
}

// ── 연결 핸들러 ────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.on(EV.SESSION_HELLO, (data: { token?: string; nickname?: string }, cb?: (res: unknown) => void) => {
    const nickname = String(data?.nickname ?? '').trim().slice(0, 20) || 'Guest';
    let session = data?.token ? sessions.get(data.token) : undefined;

    if (session) {
      if (session.graceTimer) {
        clearTimeout(session.graceTimer);
        session.graceTimer = null;
      }
      session.socketId = socket.id;
      session.nickname = nickname;
    } else {
      const id = randomUUID();
      session = { id, nickname, socketId: socket.id, roomId: null, graceTimer: null };
      sessions.set(id, session);
    }
    socket.data.sessionId = session.id;
    cb?.({ playerId: session.id, token: session.id, nickname: session.nickname });

    // 재접속: 룸/게임 상태 재동기화
    const r = session.roomId ? rooms.get(session.roomId) : null;
    if (r) {
      const m = r.members.find((x) => x.playerId === session!.id);
      if (m) {
        m.nickname = session.nickname;
        socket.join(r.id);
        socket.emit(EV.ROOM_UPDATE, roomDetail(r));
        if (r.phase === 'IN_GAME' && r.runtime) {
          socket.emit(EV.GAME_START, { gameId: r.gameId, meta: r.meta });
          r.runtime.resyncPlayer(session.id);
        }
        emitRoom(r);
      } else {
        session.roomId = null;
        socket.emit(EV.LOBBY_UPDATE, lobbyData());
      }
    } else {
      socket.emit(EV.LOBBY_UPDATE, lobbyData());
    }
  });

  socket.on(EV.LOBBY_LIST, (cb?: (res: LobbyData) => void) => {
    cb?.(lobbyData());
  });

  socket.on(EV.ROOM_CREATE, (data: { gameId?: string }, cb?: (res: unknown) => void) => {
    const session = sessionOf(socket);
    if (!session) return cb?.({ ok: false, error: 'no-session' });
    const mod = getGame(String(data?.gameId));
    if (!mod) return cb?.({ ok: false, error: 'unknown-game' });
    if (session.roomId) leaveRoom(session);

    const id = shortId();
    const room: Room = {
      id,
      gameId: mod.meta.id,
      meta: mod.meta,
      hostId: session.id,
      members: [{ playerId: session.id, nickname: session.nickname, ready: false }],
      phase: 'WAITING',
      runtime: null,
    };
    rooms.set(id, room);
    session.roomId = id;
    socket.join(id);
    cb?.({ ok: true, roomId: id });
    emitRoom(room);
    broadcastLobby();
  });

  socket.on(EV.ROOM_JOIN, (data: { roomId?: string }, cb?: (res: unknown) => void) => {
    const session = sessionOf(socket);
    if (!session) return cb?.({ ok: false, error: 'no-session' });
    const room = rooms.get(String(data?.roomId));
    if (!room) return cb?.({ ok: false, error: 'no-room' });
    if (room.phase !== 'WAITING') return cb?.({ ok: false, error: 'in-progress' });
    if (room.members.length >= room.meta.maxPlayers) return cb?.({ ok: false, error: 'full' });

    if (session.roomId && session.roomId !== room.id) leaveRoom(session);
    if (!room.members.some((m) => m.playerId === session.id)) {
      room.members.push({ playerId: session.id, nickname: session.nickname, ready: false });
    }
    session.roomId = room.id;
    socket.join(room.id);
    cb?.({ ok: true, roomId: room.id });
    emitRoom(room);
    broadcastLobby();
  });

  socket.on(EV.ROOM_LEAVE, (cb?: (res: unknown) => void) => {
    const session = sessionOf(socket);
    if (session) leaveRoom(session);
    cb?.({ ok: true });
    socket.emit(EV.LOBBY_UPDATE, lobbyData());
  });

  socket.on(EV.ROOM_READY, (data: { ready?: boolean }) => {
    const session = sessionOf(socket);
    if (!session?.roomId) return;
    const r = rooms.get(session.roomId);
    if (!r || r.phase !== 'WAITING') return;
    const m = r.members.find((x) => x.playerId === session.id);
    if (m) {
      m.ready = !!data?.ready;
      emitRoom(r);
    }
  });

  socket.on(EV.ROOM_START, (cb?: (res: unknown) => void) => {
    const session = sessionOf(socket);
    if (!session?.roomId) return cb?.({ ok: false, error: 'no-room' });
    const r = rooms.get(session.roomId);
    if (!r) return cb?.({ ok: false, error: 'no-room' });
    if (r.hostId !== session.id) return cb?.({ ok: false, error: 'not-host' });
    if (r.phase !== 'WAITING') return cb?.({ ok: false, error: 'bad-phase' });
    if (r.members.length < r.meta.minPlayers) return cb?.({ ok: false, error: 'not-enough' });
    if (!r.members.every((m) => m.ready)) return cb?.({ ok: false, error: 'not-ready' });
    cb?.({ ok: true });
    startGame(r);
  });

  socket.on(EV.ROOM_KICK, (data: { playerId?: string }) => {
    const session = sessionOf(socket);
    if (!session?.roomId) return;
    const r = rooms.get(session.roomId);
    if (!r || r.hostId !== session.id) return;
    if (data?.playerId === session.id) return; // 자기 자신 강퇴 방지
    const target = sessions.get(String(data?.playerId));
    if (!target || target.roomId !== r.id) return;
    const tsid = target.socketId;
    if (tsid) io.to(tsid).emit(EV.ROOM_CLOSED, { reason: 'kicked' });
    leaveRoom(target);
  });

  socket.on(EV.CHAT_MESSAGE, (data: { text?: string }) => {
    const session = sessionOf(socket);
    if (!session?.roomId) return;
    const r = rooms.get(session.roomId);
    if (!r) return;
    const text = String(data?.text ?? '').slice(0, 300).trim();
    if (!text) return;
    io.to(r.id).emit(EV.CHAT_MESSAGE, {
      playerId: session.id,
      nickname: session.nickname,
      text,
      ts: Date.now(),
    });
  });

  socket.on(EV.GAME_ACTION, (data: { action?: unknown }) => {
    const session = sessionOf(socket);
    if (!session?.roomId) return;
    const r = rooms.get(session.roomId);
    if (!r || r.phase !== 'IN_GAME' || !r.runtime) return;
    r.runtime.action(session.id, data?.action);
  });

  socket.on('disconnect', () => {
    const session = sessionOf(socket);
    if (!session || session.socketId !== socket.id) return;
    session.socketId = null;
    session.graceTimer = setTimeout(() => {
      session.graceTimer = null;
      if (session.socketId === null) {
        if (session.roomId) leaveRoom(session);
        sessions.delete(session.id);
      }
    }, GRACE_MS);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] games: ${gameMetas().map((g) => g.id).join(', ')}`);
});
