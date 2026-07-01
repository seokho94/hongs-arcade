import type { GameMeta } from '@mg/shared';

export const meta: GameMeta = {
  id: 'speed-quiz',
  name: '스피드 퀴즈',
  description: '4지선다 퀴즈를 빠르고 정확하게! 빨리 맞힐수록 높은 점수.',
  minPlayers: 2, // 테스트 편의상 2명부터. 동시 참여형
  maxPlayers: 20,
  mode: 'realtime',
  supportsTeams: true,
};

export default meta;
