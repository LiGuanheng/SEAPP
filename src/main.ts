import Phaser from 'phaser';
import './style.css';
import { BootScene } from './scenes/BootScene.ts';
import { CombatScene } from './scenes/CombatScene.ts';
import { BaseScene } from './scenes/BaseScene.ts';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280, height: 720,
  backgroundColor: '#142329',
  pixelArt: true, roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: false, pixelArt: true, roundPixels: true },
  scene: [BootScene, CombatScene, BaseScene],
});
