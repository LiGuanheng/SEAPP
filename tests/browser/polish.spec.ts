import { test, expect, type Page } from './fixtures.ts';

const state = (page: Page): Promise<any> => page.evaluate(() => ((window as any).__nightLight ?? (window as any).__baseLight ?? (window as any).__lastLight).snapshot());
async function key(page: Page, code: string) { await page.keyboard.press(code); await page.clock.runFor(50); }
async function click(page: Page, x: number, y: number, button: 'left' | 'right' = 'left') {
  const b = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(b.x + x / 1280 * b.width, b.y + y / 720 * b.height, { button }); await page.clock.runFor(80);
}
async function ready(page: Page, mode = '') {
  await page.clock.install(); await page.goto(`/?test=1${mode ? `&mode=${mode}` : ''}`);
  await page.waitForFunction(() => Boolean((window as any).__lastLight?.snapshot().ready || (window as any).__baseLight?.snapshot().ready || (window as any).__nightLight?.snapshot().ready));
  await page.clock.runFor(100);
}

test('探索指南冻结世界、阻断穿透，关闭后保留背包和失焦暂停', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await ready(page);
  await page.keyboard.down('KeyA'); await page.clock.runFor(2400); await page.keyboard.up('KeyA');
  await page.screenshot({ path: 'artifacts/polish-objective.png' });
  await click(page, 1040, 27); const guide = await state(page); expect(guide.guide).toBe(true); expect(guide.paused).toBe(true);
  await key(page, 'KeyE'); await key(page, 'Tab'); await key(page, 'Enter');
  await click(page, 1198, 59); await click(page, 900, 420); await page.clock.runFor(3000);
  expect(await state(page)).toEqual(guide);
  await page.screenshot({ path: 'artifacts/polish-city-guide.png' });
  await click(page, 640, 624); expect((await state(page)).paused).toBe(false);
  await key(page, 'Tab'); await page.clock.runFor(80); const bag = await state(page);
  // 背包遮罩挡住底下的暂停按钮；以往点击会意外关包恢复战斗。
  await click(page, 1220, 67); expect(await state(page)).toEqual(bag);
  await key(page, 'F1'); await key(page, 'Escape'); await page.clock.runFor(1000);
  expect(await state(page)).toEqual(bag);
  await key(page, 'Tab'); await key(page, 'F1');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await key(page, 'F1'); expect((await state(page)).paused).toBe(true);
  await key(page, 'KeyP'); await page.clock.runFor(100); expect((await state(page)).paused).toBe(false);
  expect(errors).toEqual([]);
});

test('白天真实枪声与交互音色启用，静音跨探索到夜战保留', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    (window as any).__audioStarts = 0;
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this), start = source.start.bind(source);
      source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => { (window as any).__audioStarts++; start(...args); };
      return source;
    };
  });
  await ready(page);
  await key(page, 'KeyM'); expect((await state(page)).muted).toBe(true);
  await key(page, 'KeyM'); await page.waitForTimeout(150);
  const canvas = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width * 900 / 1280, canvas.y + canvas.height * 400 / 720);
  await page.mouse.down(); await page.clock.runFor(200); await page.mouse.up();
  expect((await state(page)).player.shots).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as any).__audioStarts)).toBeGreaterThan(0);
  await page.keyboard.down('KeyD'); await page.clock.runFor(450); await page.keyboard.up('KeyD');
  const before = await page.evaluate(() => (window as any).__audioStarts);
  await key(page, 'KeyE'); expect((await state(page)).expedition.inventory.materials).toBe(8);
  expect(await page.evaluate(() => (window as any).__audioStarts)).toBeGreaterThan(before);
  await key(page, 'KeyM'); const silent = await page.evaluate(() => (window as any).__audioStarts);
  await page.mouse.down(); await page.clock.runFor(200); await page.mouse.up(); expect(await page.evaluate(() => (window as any).__audioStarts)).toBe(silent);
  // 真实返营切换场景，而不是直接替换 URL。
  await page.keyboard.down('KeyA'); await page.clock.runFor(800); await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyS'); await page.clock.runFor(230); await page.keyboard.up('KeyS');
  await key(page, 'KeyE'); expect((await state(page)).status).toBe('complete');
  await key(page, 'Enter'); await page.clock.runFor(150); await key(page, 'Enter'); await page.clock.runFor(150);
  expect((await state(page)).phase).toBe('night'); expect((await state(page)).muted).toBe(true); expect(errors).toEqual([]);
});

for (const mode of ['base', 'night']) test(`${mode} 战术地图只移动镜头，C 回中，指南不误操作或消耗支援`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await ready(page, mode);
  await key(page, 'Space'); const initial = await state(page);
  await click(page, 1240, 120); const corner = await state(page);
  expect(corner.camera.x).not.toBe(initial.camera.x); expect(corner.camera.y).not.toBe(initial.camera.y);
  expect(corner.plan.soldiers.every((s: any) => s.destination === null)).toBe(true);
  expect(corner.selected).toEqual(initial.selected);
  await key(page, 'KeyC'); await page.clock.runFor(100);
  expect((await state(page)).camera).toEqual(initial.camera);
  if (mode === 'night') {
    await key(page, 'KeyF'); const charges = (await state(page)).charges;
    await click(page, 1175, 165); expect((await state(page)).charges).toBe(charges); expect((await state(page)).support).toBe(true);
  } else await key(page, 'Digit2');
  await key(page, 'F1'); await page.clock.runFor(100); const paused = await state(page);
  await key(page, 'Enter'); await key(page, 'Space'); await click(page, 1240, 120, 'right'); await page.clock.runFor(3000);
  expect(await state(page)).toEqual(paused);
  await page.screenshot({ path: `artifacts/polish-${mode}-guide.png` });
  await key(page, 'Escape'); expect((await state(page)).paused).toBe(false);
  await key(page, 'Escape'); // 取消未完成的建造/支援模式。
  if (!(await state(page)).paused) await key(page, 'KeyP');
  await key(page, 'F1'); await key(page, 'F1'); expect((await state(page)).paused).toBe(true);
  await key(page, 'KeyP'); await key(page, 'KeyC'); await page.clock.runFor(mode === 'night' ? 12000 : 1000);
  await page.screenshot({ path: `artifacts/polish-${mode}-radar.png` }); expect(errors).toEqual([]);
});

test('探索真实战败后重试保留本次已载入营地，即使存储随后被禁用', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, expeditions: 2, depot: { materials: 17, energy: 4, medkits: 1 }, survivors: ['engineer'], weapons: ['pistol'], lastSummary: null, base: null })));
  await ready(page);
  await page.evaluate(() => { Storage.prototype.getItem = () => { throw new DOMException('storage disabled'); }; Storage.prototype.setItem = () => { throw new DOMException('storage disabled'); }; });
  for (let i = 0; i < 20 && (await state(page)).status === 'playing'; i++) await page.clock.runFor(2000);
  expect((await state(page)).status).toBe('defeat');
  await key(page, 'Enter'); expect((await state(page)).status).toBe('playing');
  expect((await state(page)).expedition.campaign.depot).toEqual({ materials: 17, energy: 4, medkits: 1 });
  expect((await state(page)).expedition.campaign.survivors).toEqual(['engineer']);
  expect((await state(page)).expedition.inventory.materials).toBe(0); expect(errors).toEqual([]);
});
