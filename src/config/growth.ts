import type { StageId } from './progression.ts';
export const capacityFor = (stage: StageId): number => [48, 72, 104, 140, 184][stage - 1];
export const lootMultiplier = (stage: StageId): number => [1, 1.5, 2.2, 3.2, 4.5][stage - 1];
export const armyLimit = (stage: StageId): number => [6, 8, 10, 12, 12][stage - 1];
export const heroPower = (stage: StageId): number => 1 + (stage - 1) * 0.25;
