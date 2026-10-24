import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ENEMY_SPRITES } from '../src/config/night.ts';

test('运行素材、许可与校验清单完整，图像不是缺失占位文件', () => {
  const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8'));
  assert.ok(manifest.assets.length >= 10);
  assert.ok(manifest.assets.some((a: { file: string }) => a.file === 'weapons/lantern.svg'));
  for (const asset of manifest.assets) {
    const bytes = readFileSync('public/assets/' + asset.file);
    assert.equal(bytes.length, asset.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  }
  for (const file of ['city/tilemap.png', 'characters/survivor.png', 'characters/zombie.png']) {
    const image = readFileSync('public/assets/' + file);
    assert.equal(image.toString('hex', 0, 8), '89504e470d0a1a0a'); assert.ok(image.length > 1000);
  }
  for (const [key, size] of Object.entries(ENEMY_SPRITES)) {
    const file = `enemies/${key}.svg`; assert.ok(manifest.assets.some((a: { file: string }) => a.file === file));
    const svg = readFileSync('public/assets/' + file, 'utf8'); assert.ok(svg.includes(`width="${size * 3}" height="${size}"`));
    for (let frame = 0; frame < 3; frame++) assert.ok(svg.includes(`<g transform="translate(${frame * size},0)">`));
  }
});
