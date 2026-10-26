import type { Vec } from './types.ts';

/** Rebuilt once per fixed step. Query buckets without allocating/sorting candidate arrays. */
export class SpatialIndex<T extends Vec> {
  private buckets = new Map<number, T[]>();
  private size: number;
  constructor(size = 96) { this.size = size; }
  private key(x: number, y: number) { return y * 128 + x; }
  rebuild(items: readonly T[]): void {
    this.buckets.clear();
    for (const item of items) {
      const key = this.key(Math.floor(item.x / this.size), Math.floor(item.y / this.size));
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(item); else this.buckets.set(key, [item]);
    }
  }
  *near(p: Vec, radius: number): Generator<T> {
    for (let y = Math.floor((p.y - radius) / this.size); y <= Math.floor((p.y + radius) / this.size); y++)
      for (let x = Math.floor((p.x - radius) / this.size); x <= Math.floor((p.x + radius) / this.size); x++)
        for (const item of this.buckets.get(this.key(x, y)) ?? []) yield item;
  }
}
