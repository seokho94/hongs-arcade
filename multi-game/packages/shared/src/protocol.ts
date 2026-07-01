/** Socket.IO 이벤트 이름과 페이로드 (단일 진실원) */
import type {
  ChatMessage,
  GameMeta,
  GameResult,
  LobbyData,
  RoomDetail,
} from './types';

/** 공통 ack 응답 */
export interface OkRes {
  ok: true;
}
export interface ErrRes {
  ok: false;
  error: string;
}
export type ActionRes = OkRes | ErrRes;
export interface RoomActionRes {
  ok: boolean;
  roomId?: string;
  error?: string;
}

export interface SessionHelloReq {
  token?: string;
  nickname: string;
}
export interface SessionHelloRes {
  playerId: string;
  token: string;
  nickname: string;
}

/** 서버 → 클라이언트 게임 상태/이벤트 봉투 */
export interface GameStateMsg {
  state: unknown;
}
export interface GameEventMsg {
  event: string;
  payload: unknown;
}
export interface GameStartMsg {
  gameId: string;
  meta: GameMeta;
}
export interface GameEndMsg {
  result: GameResult;
}

/** 클라이언트 → 서버 게임 액션 봉투 (코어는 내용을 모른다) */
export interface GameActionMsg {
  action: unknown;
}

export interface ErrorMsg {
  code: string;
  message: string;
}

/** 이벤트 이름 상수 (오타 방지용) */
export const EV = {
  SESSION_HELLO: 'session:hello',
  LOBBY_LIST: 'lobby:list',
  LOBBY_UPDATE: 'lobby:update',
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_SPECTATE: 'room:spectate',
  ROOM_LEAVE: 'room:leave',
  ROOM_READY: 'room:ready',
  ROOM_START: 'room:start',
  ROOM_KICK: 'room:kick',
  ROOM_UPDATE: 'room:update',
  ROOM_ROLE: 'room:role',
  ROOM_CLOSED: 'room:closed',
  CHAT_MESSAGE: 'chat:message',
  GAME_ACTION: 'game:action',
  GAME_START: 'game:start',
  GAME_STATE: 'game:state',
  GAME_EVENT: 'game:event',
  GAME_END: 'game:end',
  ERROR: 'error',
} as const;

export type {
  ChatMessage,
  GameMeta,
  GameResult,
  LobbyData,
  RoomDetail,
};
