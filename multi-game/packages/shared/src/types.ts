/** 플랫폼 공통 도메인 타입 (서버·클라이언트 공유) */

export interface Player {
  id: string;
  nickname: string;
}

export type GameMode = 'turn' | 'realtime';

export interface GameMeta {
  id: string;
  name: string;
  description?: string;
  minPlayers: number;
  maxPlayers: number;
  mode: GameMode;
}

export type RoomPhase = 'WAITING' | 'IN_GAME' | 'FINISHED';

export interface Capacity {
  min: number;
  max: number;
}

/** 로비 목록에 보이는 룸 요약 */
export interface RoomSummary {
  id: string;
  gameId: string;
  gameName: string;
  hostId: string;
  playerCount: number;
  capacity: Capacity;
  phase: RoomPhase;
}

export interface RoomMemberView extends Player {
  isHost: boolean;
  ready: boolean;
}

/** 룸 안에 들어왔을 때 보이는 상세 */
export interface RoomDetail {
  id: string;
  gameId: string;
  gameName: string;
  hostId: string;
  capacity: Capacity;
  phase: RoomPhase;
  players: RoomMemberView[];
}

export interface LobbyData {
  games: GameMeta[];
  rooms: RoomSummary[];
}

export interface RankingEntry {
  playerId: string;
  nickname: string;
  score: number;
  rank: number;
}

export interface GameResult {
  rankings: RankingEntry[];
}

export interface ChatMessage {
  playerId: string;
  nickname: string;
  text: string;
  ts: number;
}
