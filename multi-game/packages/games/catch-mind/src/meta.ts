import type { GameMeta } from '@mg/shared';

export const meta: GameMeta = {
  id: 'catch-mind',
  name: '캐치마인드',
  description: '한 명이 제시어를 그림으로 그리고 나머지가 채팅으로 정답을 맞히는 게임.',
  minPlayers: 2, // 테스트 편의상 2명부터. 권장 6명 이상
  maxPlayers: 10,
  mode: 'realtime',
  supportsTeams: true,
};

export default meta;
