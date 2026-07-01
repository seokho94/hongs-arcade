/** 서버 측 게임 레지스트리. 새 게임은 여기에 1줄 등록한다. */
import type { GameModule } from '@mg/game-sdk';
import type { GameMeta } from '@mg/shared';
import catchMind from '@mg/catch-mind/server';
import nunchi from '@mg/nunchi/server';

export const registry: GameModule[] = [catchMind, nunchi];

export function getGame(id: string): GameModule | undefined {
  return registry.find((g) => g.meta.id === id);
}

export function gameMetas(): GameMeta[] {
  return registry.map((g) => g.meta);
}
