import Phaser from 'phaser';
import { CAMP, ExpeditionWorld, SURVIVOR_PROFILES } from '../core/expedition.ts';
import { facing } from './ActorView.ts';
import { WEAPONS } from '../config/weapons.ts';

export class ExpeditionView {
  private crates = new Map<string, { image: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }>();
  private people = new Map<string, { sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; shadow: Phaser.GameObjects.Ellipse; weapon: Phaser.GameObjects.Image }>();
  private graphics: Phaser.GameObjects.Graphics;
  private prompt: Phaser.GameObjects.Text;
  constructor(scene: Phaser.Scene, world: ExpeditionWorld) {
    this.graphics = scene.add.graphics().setDepth(3);
    scene.add.image(CAMP.x, CAMP.y, 'beacon').setOrigin(0.5, 0.93).setScale(1.3).setDepth(CAMP.y);
    scene.add.text(CAMP.x, CAMP.y + 28, '回营信标', { fontFamily: 'Microsoft YaHei', fontSize: '12px', color: '#e1ca93', backgroundColor: '#152b2b', padding: { x: 5, y: 3 } }).setOrigin(0.5).setDepth(CAMP.y + 30);
    for (const c of world.caches) {
      const image = scene.add.image(c.x, c.y, 'supply').setOrigin(0.5, 0.85).setScale(1.25).setDepth(c.y);
      if (c.rifle) image.setTint(0xddba84);
      const label = scene.add.text(c.x, c.y + 20, c.rifle ? '武器箱' : c.id === 'medical' ? '医疗箱' : '补给箱', { fontFamily: 'Microsoft YaHei', fontSize: '10px', color: '#b4cbb3', backgroundColor: '#172a29', padding: { x: 4, y: 2 } }).setOrigin(0.5).setDepth(c.y + 22);
      this.crates.set(c.id, { image, label });
    }
    for (const s of world.survivors) {
      const p = SURVIVOR_PROFILES[s.id];
      this.people.set(s.id, {
        sprite: scene.add.sprite(s.x, s.y, 'player', 1).setOrigin(0.5, 0.95).setScale(1.2).setTint(p.tint),
        shadow: scene.add.ellipse(s.x, s.y + 2, 29, 12, 0x0a1115, 0.4),
        label: scene.add.text(s.x, s.y - 57, `${p.name} · ${p.role}`, { fontFamily: 'Microsoft YaHei', fontSize: '11px', color: '#d7d5ae', backgroundColor: '#172a29', padding: { x: 5, y: 3 } }).setOrigin(0.5),
        weapon: scene.add.image(s.x, s.y - 16, s.id === 'ranger' ? 'bow' : s.id === 'brawler' ? 'axe' : 'pistol').setOrigin(0.15, 0.5).setScale(0.8),
      });
    }
    this.prompt = scene.add.text(0, 0, '', { fontFamily: 'Microsoft YaHei', fontSize: '13px', color: '#f5e0aa', backgroundColor: '#112a2d', padding: { x: 10, y: 6 } }).setOrigin(0.5).setDepth(90000);
  }
  update(world: ExpeditionWorld, paused: boolean): void {
    const g = this.graphics.clear(), pulse = 0.55 + Math.sin(world.elapsed * 4) * 0.2;
    g.lineStyle(2, 0xe1c78e, pulse).strokeCircle(CAMP.x, CAMP.y, CAMP.radius);
    g.fillStyle(0xd9be79, 0.04).fillCircle(CAMP.x, CAMP.y, CAMP.radius);
    const target = world.objective().point;
    g.lineStyle(2, 0xe3ca82, pulse).strokeCircle(target.x, target.y, 29);
    for (const c of world.caches) {
      const view = this.crates.get(c.id)!;
      view.image.setAlpha(c.opened ? 0.38 : 1);
      view.label.setText(c.opened ? '已搜刮' : c.weapon ? `${WEAPONS[c.weapon].name} / 补给` : c.rifle ? '武器箱 [2]' : c.id === 'medical' ? '医疗箱' : '补给箱').setAlpha(c.opened ? 0.5 : 1);
      if (!c.opened) g.fillStyle(c.rifle ? 0xe1bc80 : 0xa7d2ad, pulse).fillRect(c.x - 2, c.y - 43, 4, 4);
    }
    for (const s of world.survivors) {
      const view = this.people.get(s.id)!;
      view.sprite.setPosition(s.x, s.y).setDepth(s.y);
      view.shadow.setPosition(s.x, s.y + 2).setDepth(s.y - 2);
      view.label.setPosition(s.x, s.y - 57).setDepth(s.y + 3);
      view.weapon.setPosition(s.x, s.y - 16).setRotation(s.aim).setFlipY(Math.cos(s.aim) < 0).setDepth(s.y + 2).setVisible(s.id === 'ranger' || s.id === 'brawler');
      if (paused || world.status !== 'playing') view.sprite.anims.pause();
      else {
        view.sprite.anims.resume();
        if (s.moving) view.sprite.play(`player-walk-${facing(s.aim)}`, true);
        else { view.sprite.anims.stop(); view.sprite.setFrame(facing(s.aim) * 3 + 1); }
      }
      view.label.setText(`${s.state === 'waiting' ? '◇' : '✓'} ${SURVIVOR_PROFILES[s.id].name} · ${SURVIVOR_PROFILES[s.id].role}`);
    }
    this.prompt.setPosition(world.player.x, world.player.y + 65).setText(world.prompt()).setVisible(!paused && world.status === 'playing' && !!world.prompt());
  }
}
