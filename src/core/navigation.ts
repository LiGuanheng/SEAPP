import { canOccupy, firstWall, normalized } from './geometry.ts';
import type { Rect, Vec } from './types.ts';

export class Navigation {
  readonly cols: number;
  readonly rows: number;
  readonly walkable: Uint8Array;
  readonly field: Int32Array;
  private targetCell = -1;
  private clearanceObstacles: Rect[];
  readonly width: number;
  readonly height: number;
  readonly cell: number;
  readonly obstacles: readonly Rect[];
  constructor(width: number, height: number, cell: number, obstacles: readonly Rect[], radius: number) {
    this.width = width; this.height = height; this.cell = cell; this.obstacles = obstacles;
    this.cols = Math.ceil(width / cell); this.rows = Math.ceil(height / cell);
    this.clearanceObstacles = obstacles.map(r => ({ x: r.x - radius - 1, y: r.y - radius - 1, width: r.width + 2 * radius + 2, height: r.height + 2 * radius + 2 }));
    this.walkable = new Uint8Array(this.cols * this.rows); this.field = new Int32Array(this.walkable.length).fill(-1);
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      this.walkable[y * this.cols + x] = Number(canOccupy({ x: (x + 0.5) * cell, y: (y + 0.5) * cell }, radius + 2, obstacles, width, height));
    }
  }
  private neighbors(index: number): number[] {
    const x = index % this.cols, y = Math.floor(index / this.cols), result: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || x + dx < 0 || y + dy < 0 || x + dx >= this.cols || y + dy >= this.rows) continue;
      const next = (y + dy) * this.cols + x + dx;
      if (!this.walkable[next]) continue;
      if (dx && dy && (!this.walkable[y * this.cols + x + dx] || !this.walkable[(y + dy) * this.cols + x])) continue;
      result.push(next);
    }
    return result;
  }
  rebuild(target: Vec): void {
    let index = Math.floor(target.y / this.cell) * this.cols + Math.floor(target.x / this.cell);
    if (!this.walkable[index]) {
      let best = Infinity;
      for (let i = 0; i < this.walkable.length; i++) {
        if (!this.walkable[i]) continue;
        const d = Math.hypot((i % this.cols + 0.5) * this.cell - target.x, (Math.floor(i / this.cols) + 0.5) * this.cell - target.y);
        if (d < best) { best = d; index = i; }
      }
    }
    if (index === this.targetCell) return;
    this.targetCell = index; this.field.fill(-1);
    const queue = new Int32Array(this.walkable.length); let read = 0, end = 1;
    queue[0] = index; this.field[index] = 0;
    while (read < end) {
      const at = queue[read++];
      for (const next of this.neighbors(at)) if (this.field[next] === -1) { this.field[next] = this.field[at] + 1; queue[end++] = next; }
    }
  }
  direction(from: Vec, target: Vec): Vec {
    if (firstWall(from, target, this.clearanceObstacles) === null) return normalized(target.x - from.x, target.y - from.y);
    const index = Math.floor(from.y / this.cell) * this.cols + Math.floor(from.x / this.cell);
    let next = -1, best = Infinity;
    for (const neighbor of this.neighbors(index)) if (this.field[neighbor] >= 0 && this.field[neighbor] < best) { best = this.field[neighbor]; next = neighbor; }
    if (next < 0) return { x: 0, y: 0 };
    return normalized((next % this.cols + 0.5) * this.cell - from.x, (Math.floor(next / this.cols) + 0.5) * this.cell - from.y);
  }
}
