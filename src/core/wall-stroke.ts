import { BASE_HEIGHT, BASE_WIDTH, GRID } from '../config/base.ts';
import type { Vec } from './types.ts';

/** 四方向连通的网格笔划；快速斜拖也补齐拐角，不生成对角漏口。 */
export function wallLine(from: Vec, to: Vec): Vec[] {
  if ([from, to].some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x % GRID || p.y % GRID || p.x < 0 || p.y < 0 || p.x >= BASE_WIDTH || p.y >= BASE_HEIGHT)) return [];
  // 使用同一规范方向取舍拐角，反向划回时精确走原来的格子。
  if (from.x > to.x || from.x === to.x && from.y > to.y) return wallLine(to, from).reverse();
  let x = from.x / GRID, y = from.y / GRID;
  const nx = Math.abs(to.x - from.x) / GRID, ny = Math.abs(to.y - from.y) / GRID;
  const sx = Math.sign(to.x - from.x), sy = Math.sign(to.y - from.y), points = [{ ...from }];
  for (let ix = 0, iy = 0; ix < nx || iy < ny;) {
    if (ix < nx && (iy === ny || (1 + 2 * ix) * ny < (1 + 2 * iy) * nx)) { x += sx; ix++; }
    else { y += sy; iy++; }
    points.push({ x: x * GRID, y: y * GRID });
  }
  return points;
}
