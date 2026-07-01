import type { GameMeta } from '@mg/shared';

export const meta: GameMeta = {
  id: 'omok',
  name: '오목',
  description: '15×15 판에서 번갈아 돌을 놓아 먼저 5개를 나란히 연결하면 승리. (2인 대전)',
  minPlayers: 2,
  maxPlayers: 2,
  mode: 'turn',
};

export default meta;
