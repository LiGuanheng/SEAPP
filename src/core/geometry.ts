import type { Rect, Vec } from './types.ts';

export const distance = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export function normalized(x: number, y: number): Vec {
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}
export function circleOverlapsRect(p: Vec, radius: number, rect: Rect): boolean {
  const x = Math.max(rect.x, Math.min(p.x, rect.x + rect.width));
  const y = Math.max(rect.y, Math.min(p.y, rect.y + rect.height));
  return (p.x - x) ** 2 + (p.y - y) ** 2 < radius ** 2;
}
export function canOccupy(p: Vec, radius: number, obstacles: readonly Rect[], width: number, height: number): boolean {
  return p.x >= radius && p.y >= radius && p.x <= width - radius && p.y <= height - radius && !obstacles.some(r => circleOverlapsRect(p, radius, r));
}
export function moveWithCollision(p: Vec, dx: number, dy: number, radius: number, obstacles: readonly Rect[], width: number, height: number): void {
  // 小步分轴移动，避免低帧率/击退穿过薄障碍，同时允许贴墙滑动。
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (radius * 0.65)));
  for (let i = 0; i < steps; i++) {
    const nextX = Math.max(radius, Math.min(width - radius, p.x + dx / steps));
    if (canOccupy({ x: nextX, y: p.y }, radius, obstacles, width, height)) p.x = nextX;
    const nextY = Math.max(radius, Math.min(height - radius, p.y + dy / steps));
    if (canOccupy({ x: p.x, y: nextY }, radius, obstacles, width, height)) p.y = nextY;
  }
}
/** 返回线段上首次相交参数 t∈[0,1]，而非仅检查终点。 */
export function segmentRect(a: Vec, b: Vec, r: Rect): number | null {
  let near = 0, far = 1;
  for (const [origin, delta, min, max] of [[a.x, b.x - a.x, r.x, r.x + r.width], [a.y, b.y - a.y, r.y, r.y + r.height]]) {
    if (Math.abs(delta) < 1e-10) { if (origin < min || origin > max) return null; }
    else {
      let t1 = (min - origin) / delta, t2 = (max - origin) / delta;
      if (t1 > t2) [t1, t2] = [t2, t1];
      near = Math.max(near, t1); far = Math.min(far, t2);
      if (near > far) return null;
    }
  }
  return near;
}
export function segmentCircle(a: Vec, b: Vec, center: Vec, radius: number): number | null {
  const dx = b.x - a.x, dy = b.y - a.y, ox = a.x - center.x, oy = a.y - center.y;
  const c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const aa = dx * dx + dy * dy;
  if (aa < 1e-12) return null;
  const bb = 2 * (ox * dx + oy * dy), determinant = bb * bb - 4 * aa * c;
  if (determinant < 0) return null;
  const t = (-bb - Math.sqrt(determinant)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : null;
}
export function firstWall(a: Vec, b: Vec, obstacles: readonly Rect[]): number | null {
  let nearest: number | null = null;
  for (const r of obstacles) { const t = segmentRect(a, b, r); if (t !== null && (nearest === null || t < nearest)) nearest = t; }
  return nearest;
}
