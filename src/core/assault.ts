import { MOB_KINDS, wavesForStage, type InfectedKind } from '../config/night.ts';
import type { StageId } from '../config/progression.ts';

export type Difficulty = 'normal' | 'hard';
export const ASSAULT_TUNING = {
  1: { density: 0.86, threatBudget: 152, directions: 2, specialRatio: 0.08, batch: 4, interval: 0.38 },
  2: { density: 0.88, threatBudget: 302, directions: 3, specialRatio: 0.16, batch: 9, interval: 0.48 },
  3: { density: 1, threatBudget: 470, directions: 4, specialRatio: 0.23, batch: 12, interval: 0.46 },
} as const;
export const ASSAULT_NAMES = ['前锋试探', '集群冲锋', '侧翼突袭', '重型突破', '全面围城'] as const;
export interface AssaultOrder { kind: InfectedKind; gate: number; lane: number; level: number; at: number }
const cost = (kind: InfectedKind) => kind === 'brute' ? 3 : kind === 'crow' || kind === 'undead' ? 1.5 : 1;
/** Seed changes formations and flanks; retries preserve the same plan. No runtime random calls. */
export function assaultPlan(stage: StageId, seed: number, difficulty: Difficulty = 'normal'): AssaultOrder[] {
  const tuning = ASSAULT_TUNING[stage], orders: AssaultOrder[] = [];
  const rotation = (seed >>> 0) % 4, harder = difficulty === 'hard' ? 1.18 : 1;
  let budget = tuning.threatBudget * harder;
  wavesForStage(stage).forEach((w, wave) => {
    const countDirections = Math.min(tuning.directions, wave === 0 ? 1 : wave === 1 ? 2 : wave === 2 ? 3 : 4);
    const gates = Array.from({ length: countDirections }, (_, i) => (rotation + wave + (i === 1 ? 2 : i === 2 ? 1 : i)) % 4);
    let unit = 0;
    // Each packet keeps a front together instead of rotating direction for every individual.
    for (const kind of MOB_KINDS) for (let i = 0; i < Math.round(w[kind] * tuning.density * harder); i++) {
      if (budget < cost(kind)) continue;
      const special = kind === 'brute' || kind === 'undead';
      if (special && i >= Math.ceil((w.walker + w.runner) * tuning.specialRatio)) continue;
      const packet = Math.floor(unit / tuning.batch), gate = gates[packet % gates.length];
      orders.push({ kind, gate, lane: ((packet + Math.floor(seed / 4)) % 2 ? 1 : -1), level: wave + 1, at: w.at + Math.floor(packet / gates.length) * 0.8 + (kind === 'runner' && wave === 2 ? 2.4 : 0) });
      unit++; budget -= cost(kind);
    }
    w.bosses.forEach((kind, i) => orders.push({ kind, gate: gates[(i + 1) % gates.length], lane: i ? 1 : -1, level: wave + 1, at: w.at + 1.4 }));
  });
  return orders.sort((a, b) => a.at - b.at);
}
