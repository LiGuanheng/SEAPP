import Phaser from 'phaser';
import { ENEMY_SPRITES } from '../config/night.ts';
import { hasSeenStory } from '../config/story.ts';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload(): void {
    const title = this.add.text(640, 310, '最后一盏灯', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '30px', color: '#e2c38a' }).setOrigin(0.5);
    const status = this.add.text(640, 360, '载入北境旧城区…', { fontSize: '13px', color: '#9eafa2' }).setOrigin(0.5);
    const bar = this.add.graphics();
    this.load.on('progress', (value: number) => { bar.clear().fillStyle(0x263c3e).fillRect(490, 395, 300, 3).fillStyle(0xd9bb7a).fillRect(490, 395, 300 * value, 3); });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      const error = document.getElementById('load-error');
      if (error) { error.hidden = false; error.textContent = `游戏素材载入失败：${file.key}。请刷新或检查本地服务。`; }
    });
    const base = import.meta.env.BASE_URL + 'assets/';
    this.load.spritesheet('city', base + 'city/tilemap.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('player', base + 'characters/survivor.png', { frameWidth: 40, frameHeight: 40 });
    this.load.image('zombie', base + 'characters/zombie.png');
    this.load.image('zombie-alt', base + 'characters/zombie-alt.png');
    this.load.svg('pistol', base + 'weapons/pistol.svg');
    this.load.svg('bullet', base + 'weapons/bullet.svg');
    this.load.svg('muzzle', base + 'weapons/muzzle.svg');
    this.load.svg('lantern', base + 'weapons/lantern.svg');
    for (const key of ['rifle', 'supply', 'beacon', 'barricade', 'turret', 'lighthouse', 'helmet', 'axe', 'bow', 'arrow', 'cannon', 'cannon-barrel', 'arrowtower', 'wall', 'desk', 'bed', 'grid', 'repair', 'flame', 'sniper']) this.load.svg(key, base + `weapons/${key}.svg`);
    for (const key of Object.keys(ENEMY_SPRITES)) this.load.svg(key, base + `enemies/${key}.svg`);
    this.events.once('shutdown', () => { title.destroy(); status.destroy(); bar.destroy(); });
  }
  create(): void {
    if (['city', 'player', 'zombie', 'zombie-alt', 'pistol', 'bullet', 'muzzle', 'rifle', 'supply', 'beacon', 'barricade', 'turret', 'lighthouse', 'helmet', 'axe', 'bow', 'arrow', 'cannon', 'cannon-barrel', 'arrowtower', 'wall', 'desk', 'bed'].some(key => !this.textures.exists(key))) return;
    if (['lantern', 'grid', 'repair', 'flame', 'sniper'].some(key => !this.textures.exists(key)) || Object.keys(ENEMY_SPRITES).some(key => !this.textures.exists(key))) return;
    for (const [name, size] of Object.entries(ENEMY_SPRITES)) {
      for (let frame = 0; frame < 3; frame++) this.textures.get(name).add(frame, 0, frame * size, 0, size, size);
      for (let d = 0; d < 4; d++) this.anims.create({ key: `${name}-walk-${d}`, frames: [0, 1, 2, 1].map(frame => ({ key: name, frame })), frameRate: name === 'bird' || name === 'crow' ? 8 : 6, repeat: -1 });
    }
    for (const name of ['zombie', 'zombie-alt']) {
      const texture = this.textures.get(name);
      for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) texture.add(row * 3 + col, 0, col * 42, row * 36, 40, 36);
    }
    for (const name of ['player', 'zombie', 'zombie-alt']) for (let direction = 0; direction < 4; direction++) {
      this.anims.create({ key: `${name}-walk-${direction}`, frames: [0, 1, 2, 1].map(frame => ({ key: name, frame: direction * 3 + frame })), frameRate: name === 'player' ? 10 : 7, repeat: -1 });
    }
    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xffffff).fillRect(0, 0, 3, 3).generateTexture('pixel', 3, 3); graphics.destroy();
    const mode = new URLSearchParams(location.search).get('mode');
    const params = new URLSearchParams(location.search);
    const playing = params.get('play') === '1' || params.get('ranked') === '1' || mode !== null || params.get('intro') === '1';
    const intro = mode === null && params.get('intro') !== '0' && (!hasSeenStory() || params.get('intro') === '1');
    this.scene.start(!playing ? 'MainMenu' : intro ? 'Prologue' : mode === 'base' || mode === 'night' ? 'Base' : 'Combat', { battle: mode === 'night' });
  }
}
