/** 클라이언트 측 게임 레지스트리. 새 게임은 여기에 1줄 등록한다. */
import type { GameClientModule } from '@mg/game-sdk/client';
import catchMind from '@mg/catch-mind/client';
import nunchi from '@mg/nunchi/client';
import speedQuiz from '@mg/speed-quiz/client';

export const clientRegistry: Record<string, GameClientModule> = {
  [catchMind.meta.id]: catchMind,
  [nunchi.meta.id]: nunchi,
  [speedQuiz.meta.id]: speedQuiz,
};

export function getClientGame(id: string): GameClientModule | undefined {
  return clientRegistry[id];
}
