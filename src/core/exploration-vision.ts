import { distance, firstWall } from './geometry.ts';
import type { Rect, Vec } from './types.ts';

export const LIGHT_RADII = [240, 320, 400] as const;
/** 当前灯光与已探索地形分开保存；敌人不会因为地图曾经看过而持续可见。 */
export class ExplorationVision {
  readonly cell = 32;
  readonly cols: number;
  readonly rows: number;
  readonly seen: Uint8Array;
  readonly visible: Uint8Array;
  revision = 0;
  explored = 0;
  radius = 240;
  private origin: Vec = { x: 0, y: 0 };
  private obstacles: readonly Rect[];
  private width: number;
  private height: number;
  constructor(width: number, height: number, obstacles: readonly Rect[]) {
    this.width = width; this.height = height; this.cols = Math.ceil(width / this.cell); this.rows = Math.ceil(height / this.cell);
    this.seen = new Uint8Array(this.cols * this.rows); this.visible = new Uint8Array(this.seen.length); this.obstacles = obstacles;
  }
  canSee(p: Vec): boolean { return Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x < this.width && p.y < this.height && distance(this.origin, p) <= this.radius && firstWall(this.origin, p, this.obstacles) === null; }
  wasSeen(p: Vec): boolean { const x = Math.floor(p.x / this.cell), y = Math.floor(p.y / this.cell); return x >= 0 && y >= 0 && x < this.cols && y < this.rows && this.seen[y * this.cols + x] === 1; }
  update(origin: Vec, radius: number): void {
    this.origin = { ...origin }; this.radius = radius; this.visible.fill(0);
    const left = Math.max(0, Math.floor((origin.x - radius) / this.cell)), right = Math.min(this.cols - 1, Math.ceil((origin.x + radius) / this.cell));
    const top = Math.max(0, Math.floor((origin.y - radius) / this.cell)), bottom = Math.min(this.rows - 1, Math.ceil((origin.y + radius) / this.cell));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const p = { x: (x + 0.5) * this.cell, y: (y + 0.5) * this.cell }, index = y * this.cols + x;
      if (!this.canSee(p)) continue;
      this.visible[index] = 1; if (!this.seen[index]) { this.seen[index] = 1; this.explored++; }
    }
    this.revision++;
  }
}
