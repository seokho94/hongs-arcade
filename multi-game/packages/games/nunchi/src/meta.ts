import type { GameMeta } from '@mg/shared';

export const meta: GameMeta = {
  id: 'nunchi',
  name: '눈치게임',
  description: '순서대로 한 명씩 번호를 외치세요. 동시에 외치면 둘 다 탈락! 끝까지 못 외친 사람이 패배.',
  minPlayers: 2, // 테스트 편의상 2명부터. 권장 4명 이상
  maxPlayers: 12,
  mode: 'realtime',
};

export default meta;
