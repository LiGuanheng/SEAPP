import Phaser from 'phaser';

/** 模型/布局保持1280×720；画布支持720p/1440p/4K，命中由真实相机换算。 */
export const RENDER_SCALE = (() => {
  try { const quality = localStorage.getItem('last-light.display-quality'); return quality === 'standard' ? 1 : quality === 'ultra' ? 3 : 2; } catch { return 2; }
})();
const prepared = new WeakSet<Phaser.GameObjects.GameObjectFactory>();
const vectorTextures = new Set<string>();
export function loadSharpSvg(scene: Phaser.Scene, key: string, url: string): void {
  vectorTextures.add(key); scene.load.svg(key, url, { scale: RENDER_SCALE });
}
function logicalScale<T extends Phaser.GameObjects.Image | Phaser.GameObjects.Sprite>(object: T): T {
  const scale = object.setScale.bind(object);
  // SVG以高清像素载入，外部setScale仍使用原来的世界尺寸；不改碰撞或游戏数值。
  object.setScale = ((x = 1, y = x) => scale(x / (vectorTextures.has(object.texture.key) ? RENDER_SCALE : 1), y / (vectorTextures.has(object.texture.key) ? RENDER_SCALE : 1))) as T['setScale'];
  object.setScale(1); return object;
}
export function sharpText(scene: Phaser.Scene): void {
  if (prepared.has(scene.add)) return;
  prepared.add(scene.add);
  const create = scene.add.text.bind(scene.add);
  const image = scene.add.image.bind(scene.add), sprite = scene.add.sprite.bind(scene.add);
  scene.add.image = (...args) => logicalScale(image(...args));
  scene.add.sprite = (...args) => logicalScale(sprite(...args));
  scene.add.text = (x, y, value, style = {}) => {
    const text = create(x, y, value, { ...style, resolution: RENDER_SCALE });
    text.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return text;
  };
}
export function uiCamera(scene: Phaser.Scene, name: string): Phaser.Cameras.Scene2D.Camera {
  return scene.cameras.add(0, 0, 1280 * RENDER_SCALE, 720 * RENDER_SCALE).setName(name).setZoom(RENDER_SCALE).centerOn(640, 360);
}
