import type { GameMeta } from '@mg/shared';

export const meta: GameMeta = {
  id: 'hammer-smash',
  name: '망치 연타',
  description: '제한시간 동안 스페이스바를 연타! 망치질 횟수로 순위를 겨룹니다.',
  minPlayers: 1,
  maxPlayers: 12,
  mode: 'realtime',
  supportsTeams: true,
};

export default meta;
