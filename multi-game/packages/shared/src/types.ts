/** 플랫폼 공통 도메인 타입 (서버·클라이언트 공유) */

export interface Player {
  id: string;
  nickname: string;
  /** 팀전일 때만: 1=레드, 2=블루 (0/undefined=개인전) */
  team?: number;
}

export type GameMode = 'turn' | 'realtime';

export interface GameMeta {
  id: string;
  name: string;
  description?: string;
  minPlayers: number;
  maxPlayers: number;
  mode: GameMode;
  /** 개인전/팀전 토글 지원 여부 (단체 게임만 true) */
  supportsTeams?: boolean;
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
  spectatorCount: number;
  capacity: Capacity;
  phase: RoomPhase;
}

export interface RoomMemberView extends Player {
  isHost: boolean;
  ready: boolean;
  team: number; // 0=미배정/개인전, 1=레드, 2=블루
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
  spectatorCount: number;
  teamMode: boolean;
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

export interface TeamResult {
  team: number; // 1=레드, 2=블루
  name: string;
  score: number;
  rank: number;
  members: string[]; // 닉네임
}

export interface GameResult {
  rankings: RankingEntry[];
  /** 팀전일 때 코어가 개인 점수를 팀별로 합산해 채운다 */
  teams?: TeamResult[];
}

export interface ChatMessage {
  playerId: string;
  nickname: string;
  text: string;
  ts: number;
}
