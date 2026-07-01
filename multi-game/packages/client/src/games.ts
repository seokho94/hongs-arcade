/** 클라이언트 측 게임 레지스트리. 새 게임은 여기에 1줄 등록한다. */
import type { GameClientModule } from '@mg/game-sdk/client';
import catchMind from '@mg/catch-mind/client';
import nunchi from '@mg/nunchi/client';
import speedQuiz from '@mg/speed-quiz/client';
import omok from '@mg/omok/client';
import hammerSmash from '@mg/hammer-smash/client';
import mashRace from '@mg/mash-race/client';

export const clientRegistry: Record<string, GameClientModule> = {
  [catchMind.meta.id]: catchMind,
  [nunchi.meta.id]: nunchi,
  [speedQuiz.meta.id]: speedQuiz,
  [omok.meta.id]: omok,
  [hammerSmash.meta.id]: hammerSmash,
  [mashRace.meta.id]: mashRace,
};

export function getClientGame(id: string): GameClientModule | undefined {
  return clientRegistry[id];
}
