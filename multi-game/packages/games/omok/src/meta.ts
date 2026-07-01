import type { GameMeta } from '@mg/shared';

export const meta: GameMeta = {
  id: 'omok',
  name: '오목',
  description: '번갈아 돌을 놓아 먼저 5목을 완성하면 승리하는 2인 대전.',
  minPlayers: 2,
  maxPlayers: 2,
  mode: 'turn',
};

export default meta;
