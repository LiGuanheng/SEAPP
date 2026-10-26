import Phaser from 'phaser';
import { BUILDINGS, CARS, COLS, DECORATIONS, ROWS, TILE, groundTile, roomAt, roomDoor, roomFurniture, roomWalls, type Building } from '../config/map.ts';
import type { Vec } from '../core/types.ts';
import type { ExplorationLayout } from '../core/exploration-layout.ts';

export class MapView {
  private roofs: Phaser.GameObjects.Container[] = [];
  private buildings: Building[];
  constructor(scene: Phaser.Scene, layout?: ExplorationLayout) {
    this.buildings = layout?.buildings ?? BUILDINGS;
    const map = scene.make.tilemap({ data: Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => groundTile(x, y))), tileWidth: 16, tileHeight: 16 });
    const tiles = map.addTilesetImage('city', 'city', 16, 16, 0, 0)!;
    map.createLayer(0, tiles, 0, 0)!.setScale(2).setTint(layout?.tint ?? 0x87938e).setDepth(-100);
    for (const d of layout?.debris ?? []) scene.add.image(d.x, d.y, 'city', d.frame).setOrigin(0).setScale(2).setTint(0x8c947e).setDepth(d.y + 32);
    for (const r of layout?.barricades ?? []) {
      const g = scene.add.graphics().setDepth(r.y + r.height);
      g.fillStyle(0x0b181c, 0.55).fillRect(r.x + 6, r.y + 8, r.width, r.height);
      for (let y = r.y; y < r.y + r.height; y += 32) for (let x = r.x; x < r.x + r.width; x += 32) {
        g.fillStyle(0x4b5550).fillRect(x, y - 8, 30, 32).fillStyle(0x7c7960).fillRect(x + 2, y - 8, 26, 4).lineStyle(3, 0x242d2b).lineBetween(x + 6, y - 2, x + 23, y + 18);
      }
    }
    const shadows = scene.add.graphics().setDepth(-1).fillStyle(0x101719, 0.4);
    let roof: Phaser.GameObjects.Container | null = null;
    const tile = (x: number, y: number, frame: number, depth: number, tint = 0x9ca49a) => { const image = scene.add.image(x * TILE, y * TILE, 'city', frame).setOrigin(0).setScale(2).setDepth(depth).setTint(tint); roof?.add(image); return image; };
    for (const building of this.buildings) {
      const { x, y, width, height, theme, label } = building, roofHeight = height - 2, depth = (y + height) * TILE - 1;
      const door = roomDoor(building);
      for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) tile(x + col, y + row, (row + col) % 5 ? 704 : 777, -2, 0x96968c);
      for (const wall of roomWalls(building)) scene.add.image(wall.x, wall.y, 'city', 190).setOrigin(0).setDisplaySize(wall.width, wall.height).setTint(0x586764).setDepth(3);
      roomFurniture(building).forEach((f, i) => scene.add.image(f.x, f.y, i ? 'bed' : 'desk').setOrigin(0).setDisplaySize(f.width, f.height).setDepth(f.y + f.height));
      scene.add.text(door.x, door.y + 24, `${label} · 可进入 ↑`, { fontFamily: 'Microsoft YaHei', fontSize: '11px', color: '#d8c593', backgroundColor: '#172a29', padding: { x: 5, y: 3 } }).setOrigin(0.5).setDepth(door.y + 25);
      roof = scene.add.container(0, 0).setDepth(10000); this.roofs.push(roof);
      shadows.fillRect(x * TILE + 13, y * TILE + 16, width * TILE, height * TILE);
      for (let row = 0; row < roofHeight; row++) for (let col = 0; col < width; col++) {
        const frame = theme + (row === 0 ? 0 : row === roofHeight - 1 ? 74 : 37) + (col === 0 ? 0 : col === width - 1 ? 2 : 1);
        tile(x + col, y + row, frame, depth, theme === 0 ? 0x9c8b78 : 0x9eaaa5);
      }
      for (let col = 0; col < width; col++) {
        tile(x + col, y + roofHeight, col === 0 || col === width - 1 ? 190 : col % 3 === 0 ? 622 : 618, depth);
        tile(x + col, y + height - 1, col === (building.doorColumn ?? Math.floor(width / 2)) ? 641 : 190, depth, 0x858e87);
      }
      for (let i = 2; i < width - 1; i += 4) tile(x + i, y + 2, 541, depth + 1, 0x8c9b95);
      tile(x + width - 3, y + roofHeight - 2, 545, depth + 1);
      roof.add(scene.add.rectangle((x + width / 2) * TILE, (y + height - 1.9) * TILE, Math.min(160, width * TILE - 24), 22, 0x172a2c, 0.95));
      roof.add(scene.add.text((x + width / 2) * TILE, (y + height - 1.9) * TILE, label, { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '12px', color: '#c1c6a5', letterSpacing: 3 }).setOrigin(0.5));
      // 屋顶局部污迹保留细节，避免一整块无纹理平面。
      roof.add(scene.add.image((x + width - 2) * TILE, (y + 3) * TILE, 'city', 494).setScale(2).setTint(0x737e74));
      roof = null;
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
  update(player: Vec): void { const inside = roomAt(player, this.buildings); this.roofs.forEach((roof, i) => { const door = roomDoor(this.buildings[i]); roof.setVisible(i !== inside && Math.hypot(player.x - door.x, player.y - door.y) > 75); }); }
}
