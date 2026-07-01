/** 서버 측 게임 레지스트리. 새 게임은 여기에 1줄 등록한다. */
import type { GameModule } from '@mg/game-sdk';
import type { GameMeta } from '@mg/shared';
import catchMind from '@mg/catch-mind/server';
import nunchi from '@mg/nunchi/server';
import speedQuiz from '@mg/speed-quiz/server';
import omok from '@mg/omok/server';
import hammerSmash from '@mg/hammer-smash/server';
import mashRace from '@mg/mash-race/server';

export const registry: GameModule[] = [catchMind, nunchi, speedQuiz, omok, hammerSmash, mashRace];

export function getGame(id: string): GameModule | undefined {
  return registry.find((g) => g.meta.id === id);
}

export function gameMetas(): GameMeta[] {
  return registry.map((g) => g.meta);
}
