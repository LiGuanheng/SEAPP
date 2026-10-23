import Phaser from 'phaser';
import { BUILDINGS, CARS, COLS, DECORATIONS, ROWS, TILE, groundTile } from '../config/map.ts';

export class MapView {
  constructor(scene: Phaser.Scene) {
    const map = scene.make.tilemap({ data: Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => groundTile(x, y))), tileWidth: 16, tileHeight: 16 });
    const tiles = map.addTilesetImage('city', 'city', 16, 16, 0, 0)!;
    map.createLayer(0, tiles, 0, 0)!.setScale(2).setTint(0x87938e).setDepth(-100);
    const shadows = scene.add.graphics().setDepth(-1).fillStyle(0x101719, 0.4);
    const tile = (x: number, y: number, frame: number, depth: number, tint = 0x9ca49a) => scene.add.image(x * TILE, y * TILE, 'city', frame).setOrigin(0).setScale(2).setDepth(depth).setTint(tint);
    for (const building of BUILDINGS) {
      const { x, y, width, height, theme, label } = building, roofHeight = height - 2, depth = (y + height) * TILE - 1;
      shadows.fillRect(x * TILE + 13, y * TILE + 16, width * TILE, height * TILE);
      for (let row = 0; row < roofHeight; row++) for (let col = 0; col < width; col++) {
        const frame = theme + (row === 0 ? 0 : row === roofHeight - 1 ? 74 : 37) + (col === 0 ? 0 : col === width - 1 ? 2 : 1);
        tile(x + col, y + row, frame, depth, theme === 0 ? 0x9c8b78 : 0x9eaaa5);
      }
      for (let col = 0; col < width; col++) {
        tile(x + col, y + roofHeight, col === 0 || col === width - 1 ? 190 : col % 3 === 0 ? 622 : 618, depth);
        tile(x + col, y + height - 1, col === Math.floor(width / 2) ? 641 : 190, depth, 0x858e87);
      }
      for (let i = 2; i < width - 1; i += 4) tile(x + i, y + 2, 541, depth + 1, 0x8c9b95);
      tile(x + width - 3, y + roofHeight - 2, 545, depth + 1);
      scene.add.rectangle((x + width / 2) * TILE, (y + height - 1.9) * TILE, Math.min(160, width * TILE - 24), 22, 0x172a2c, 0.95).setDepth(depth + 2);
      scene.add.text((x + width / 2) * TILE, (y + height - 1.9) * TILE, label, { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '12px', color: '#c1c6a5', letterSpacing: 3 }).setOrigin(0.5).setDepth(depth + 3);
      // 屋顶局部污迹保留细节，避免一整块无纹理平面。
      scene.add.image((x + width - 2) * TILE, (y + 3) * TILE, 'city', 494).setScale(2).setTint(0x737e74).setDepth(depth + 1);
    }
    for (const car of CARS) {
      const base = car.style === 'green' ? 623 : 771, depth = (car.y + 2) * TILE;
      shadows.fillRoundedRect(car.x * TILE + 6, car.y * TILE + 17, TILE * 3, TILE * 1.6, 8);
      for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) tile(car.x + col, car.y + row, base + row * 37 + col, depth, car.style === 'green' ? 0x8c9b79 : 0x9fa5a0);
      tile(car.x + 1, car.y + 1, 622, depth + 1, 0x747e78).setAlpha(0.25);
    }
    for (const { x, y, kind } of DECORATIONS) {
      if (kind === 'tree') {
        tile(x, y - 1, 403, y * TILE, 0x697f66); tile(x, y, 440, y * TILE, 0x697f66);
      } else if (kind === 'bin') tile(x, y, 496, y * TILE, 0x7c847a);
      else if (kind === 'litter') tile(x, y, 674, 0, 0x8e9279).setScale(1.5).setAlpha(0.7);
      else if (kind === 'grass') tile(x, y, 407, 0, 0x6e8262).setAlpha(0.7);
    }
    // 地面导向字样是世界内的街道路标，不承载后续阶段的交互。
    scene.add.text(29 * TILE, 24.5 * TILE, 'NORTH DISTRICT  /  07', { fontFamily: 'monospace', fontSize: '11px', color: '#b7ad85', letterSpacing: 3 }).setAlpha(0.35).setDepth(0);
    scene.add.text(24.5 * TILE, 17 * TILE, '隔离区', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '20px', color: '#a78e6a', letterSpacing: 5 }).setAlpha(0.5).setDepth(0);
  }
}
