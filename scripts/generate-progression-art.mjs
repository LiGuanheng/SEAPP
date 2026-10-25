// 原创网格矢量素材，复用项目青灰/锈色调；无远程素材依赖。
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>\n`;
const rect = (x, y, w, h, color) => `<path fill="${color}" d="M${x} ${y}h${w}v${h}h-${w}z"/>`;
const base = rect(6, 60, 68, 22, '#14272c') + rect(10, 62, 60, 14, '#64766a') + rect(14, 76, 52, 6, '#8d7958');
const assets = {
  grid: base + rect(12, 22, 12, 40, '#14272c') + rect(56, 22, 12, 40, '#14272c') + rect(16, 26, 4, 34, '#b5beaa') + rect(60, 26, 4, 34, '#b5beaa') + rect(12, 16, 12, 10, '#80c9d0') + rect(56, 16, 12, 10, '#80c9d0') + '<path fill="none" stroke="#80c9d0" stroke-width="3" d="M20 35h12l8 10 8-10h12M20 50h10l10-10 10 10h10"/>' + rect(30, 58, 20, 14, '#263c3b') + rect(36, 60, 8, 6, '#d7c78b'),
  repair: base + rect(12, 24, 56, 42, '#14272c') + rect(16, 28, 48, 34, '#637e71') + rect(8, 20, 64, 10, '#b4aa82') + rect(34, 32, 12, 26, '#a4d2b6') + rect(26, 40, 28, 10, '#a4d2b6') + rect(16, 60, 14, 12, '#9d805c') + rect(52, 60, 12, 12, '#9d805c'),
  flame: base + rect(18, 20, 44, 46, '#14272c') + rect(22, 24, 36, 40, '#746c54') + rect(12, 38, 14, 28, '#a58159') + rect(54, 38, 14, 28, '#a58159') + rect(28, 8, 24, 20, '#14272c') + rect(32, 12, 16, 12, '#b8bca6') + rect(36, 10, 8, 8, '#ebad6e') + rect(30, 34, 20, 8, '#d59560') + rect(30, 48, 20, 6, '#14272c'),
  sniper: base + rect(16, 26, 12, 40, '#667c70') + rect(52, 26, 12, 40, '#667c70') + '<path fill="none" stroke="#9fa695" stroke-width="4" d="m22 32 36 30m0-30L22 62"/>' + rect(12, 8, 56, 24, '#14272c') + rect(16, 12, 48, 14, '#838e81') + rect(28, 14, 24, 6, '#b6b9d4') + rect(8, 26, 64, 8, '#b09a75'),
};
for (const [key, body] of Object.entries(assets)) writeFileSync(`public/assets/weapons/${key}.svg`, svg(80, 88, body));
for (const kind of ['blighter', 'bomber']) {
  let body = '';
  for (let f = 0; f < 3; f++) {
    const dy = [0, 2, -2][f];
    let art = rect(25, 66 + dy, 18, 24, '#14272c') + rect(54, 66 - dy, 18, 24, '#14272c') + rect(29, 70 + dy, 10, 15, '#626c5b') + rect(58, 70 - dy, 10, 15, '#626c5b');
    if (kind === 'bomber') {
      art += rect(13, 26, 70, 46, '#14272c') + rect(21, 20, 54, 56, '#14272c') + rect(23, 28, 50, 40, '#8b7757') + rect(31, 24, 34, 50, '#a38456') + rect(34, 33, 28, 26, '#dc9b60') + rect(40, 38, 16, 16, '#edd18a') + rect(30, 6, 36, 24, '#14272c') + rect(34, 10, 28, 14, '#8d9978') + rect(38, 14, 6, 5, '#efbb7c') + rect(53, 14, 6, 5, '#efbb7c') + rect(7, 34 + dy, 14, 28, '#69705c') + rect(75, 34 - dy, 14, 28, '#69705c');
      art += '<path fill="none" stroke="#3d4d46" stroke-width="4" d="M26 34h44M26 62h44M33 28v44M64 28v44"/>';
    } else {
      art += rect(17, 30, 61, 43, '#14272c') + rect(23, 34, 49, 34, '#65785c') + rect(15, 19, 40, 30, '#14272c') + rect(19, 23, 32, 22, '#99a274') + rect(8, 31, 24, 12, '#14272c') + rect(8, 34, 20, 6, '#bacb83') + rect(24, 25, 7, 5, '#e3b578') + rect(56, 18, 25, 30, '#14272c') + rect(60, 22, 17, 22, '#a3b778') + rect(62, 26, 6, 8, '#c5d694') + rect(8, 48 + dy, 13, 22, '#79866b') + rect(75, 45 - dy, 13, 25, '#79866b') + rect(32, 47, 24, 6, '#8e9c68') + rect(39, 58, 24, 6, '#8e9c68');
    }
    body += `<g transform="translate(${f * 96},0)">${art}</g>`;
  }
  writeFileSync(`public/assets/enemies/${kind}.svg`, svg(288, 96, body));
}
const license = 'public/assets/licenses/project-art.txt';
const note = '\nProgression expansion: weapons/grid.svg, repair.svg, flame.svg, sniper.svg;\nenemies/blighter.svg, bomber.svg. Original grid-vector art, CC0 1.0, 2026-10-25.\n';
if (!readFileSync(license, 'utf8').includes('Progression expansion:')) writeFileSync(license, readFileSync(license, 'utf8') + note);
const path = 'public/assets/manifest.json', manifest = JSON.parse(readFileSync(path, 'utf8'));
for (const file of [...Object.keys(assets).map(k => `weapons/${k}.svg`), 'enemies/blighter.svg', 'enemies/bomber.svg']) if (!manifest.assets.some(a => a.file === file)) manifest.assets.push({ file });
for (const entry of manifest.assets) { const bytes = readFileSync('public/assets/' + entry.file); entry.bytes = bytes.length; entry.sha256 = createHash('sha256').update(bytes).digest('hex'); }
writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
