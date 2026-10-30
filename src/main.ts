import Phaser from 'phaser';
import './style.css';
import { BootScene } from './scenes/BootScene.ts';
import { CombatScene } from './scenes/CombatScene.ts';
import { BaseScene } from './scenes/BaseScene.ts';
import { PrologueScene } from './scenes/PrologueScene.ts';
import { MainMenuScene } from './scenes/MainMenuScene.ts';
import { RENDER_SCALE } from './view/DisplayQuality.ts';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280 * RENDER_SCALE, height: 720 * RENDER_SCALE,
  backgroundColor: '#142329',
  pixelArt: true, roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: false, pixelArt: true, roundPixels: true },
  scene: [BootScene, MainMenuScene, PrologueScene, CombatScene, BaseScene],
});
