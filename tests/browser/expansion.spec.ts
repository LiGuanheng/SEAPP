import { test, expect, type Page } from './fixtures.ts';

const state = (page: Page): Promise<any> => page.evaluate(() => ((window as any).__nightLight ?? (window as any).__baseLight ?? (window as any).__lastLight).snapshot());
async function key(page: Page, code: string) { await page.keyboard.press(code); await page.clock.runFor(60); }
async function point(page: Page, x: number, y: number, world = false) {
  if (world) { const s = await state(page); x = (x - s.camera.x) * (s.camera.zoom ?? 1); y = (y - s.camera.y) * (s.camera.zoom ?? 1); }
  const b = (await page.locator('canvas').boundingBox())!; return { x: b.x + x / 1280 * b.width, y: b.y + y / 720 * b.height };
}
async function click(page: Page, x: number, y: number, world = false) { const p = await point(page, x, y, world); await page.mouse.click(p.x, p.y); await page.clock.runFor(80); }
async function ready(page: Page, mode = '') { await page.clock.install(); await page.goto(`/?test=1${mode ? `&mode=${mode}` : ''}`); await page.waitForFunction(() => Boolean((window as any).__lastLight?.snapshot().ready || (window as any).__baseLight?.snapshot().ready)); await page.clock.runFor(100); }
async function walk(page: Page, x: number, y: number) {
  for (let i = 0; i < 65; i++) {
    const p = (await state(page)).player, dx = x - p.x, dy = y - p.y; if (Math.hypot(dx, dy) < 13) return;
    const keys = [Math.abs(dx) > 8 ? dx > 0 ? 'KeyD' : 'KeyA' : '', Math.abs(dy) > 8 ? dy > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
    for (const k of keys) await page.keyboard.down(k); await page.clock.runFor(Math.min(130, Math.max(40, Math.hypot(dx, dy) * 5))); for (const k of keys) await page.keyboard.up(k);
  }
  throw Error(`无法步行到 ${x},${y}: ${JSON.stringify((await state(page)).player)}`);
}
async function fire(page: Page, x: number, y: number, ms: number) { const p = await point(page, x, y, true); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.clock.runFor(ms); await page.mouse.up(); }

test('真实走入药房战斗、取得猎弓、营救弓手，再从门口护送回营', async ({ page }) => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await ready(page);
  await walk(page, 1056, 736); await key(page, 'KeyE'); await walk(page, 1200, 780); await key(page, 'KeyE');
  await walk(page, 1072, 720); await walk(page, 1072, 544); await walk(page, 1072, 464);
  expect((await state(page)).expedition.currentRoom).toBe(1); expect((await state(page)).expedition.exploredRooms).toContain(1);
  await page.screenshot({ path: 'artifacts/expansion-room-entry.png' });
  for (let i = 0; i < 35; i++) {
    const s = await state(page), z = s.zombies.filter((z: any) => z.x > 900 && z.x < 1240 && z.y < 515).sort((a: any, b: any) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0];
    if (!z) break; await fire(page, z.x, z.y - 16, 130);
  }
  expect((await state(page)).kills).toBeGreaterThanOrEqual(2);
  await walk(page, 1024, 432); await key(page, 'KeyE'); expect((await state(page)).weaponId).toBe('bow'); expect((await state(page)).expedition.lanternLevel).toBe(2);
  await page.clock.runFor(700); const shots = (await state(page)).player.shots; await fire(page, 1072, 230, 150); expect((await state(page)).player.shots).toBeGreaterThan(shots);
  expect((await state(page)).bullets.some((b: any) => b.arrow)).toBe(true);
  await key(page, 'Digit3'); expect((await state(page)).weaponId).toBe('axe'); const swung = (await state(page)).player.shots;
  await fire(page, 1080, 432, 750); expect((await state(page)).player.shots).toBeGreaterThan(swung); await page.screenshot({ path: 'artifacts/expansion-room-cleared.png' });
  await walk(page, 1136, 400); await key(page, 'KeyE'); expect((await state(page)).expedition.survivors.find((s: any) => s.id === 'ranger').state).toBe('following');
  await key(page, 'KeyH'); await key(page, 'Digit2'); await walk(page, 1072, 464); await walk(page, 1072, 544); await walk(page, 1072, 720); await walk(page, 920, 760);
  await page.clock.runFor(1600); await key(page, 'KeyE'); expect((await state(page)).status).toBe('complete'); expect((await state(page)).expedition.summary.rescued).toContain('ranger');
  await key(page, 'Enter'); expect((await state(page)).plan.soldiers.some((s: any) => s.role === 'archer')).toBe(true); expect(errors).toEqual([]);
});

test('探索滚轮缩放后仍正确瞄准，独立配乐开关保存，真实 Web Audio 启动旋律', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { (window as any).__musicNotes = 0; const create = AudioContext.prototype.createOscillator; AudioContext.prototype.createOscillator = function () { (window as any).__musicNotes++; return create.call(this); }; });
  await ready(page); await key(page, 'KeyL'); expect((await state(page)).musicMuted).toBe(true); await key(page, 'KeyL');
  await expect.poll(() => page.evaluate(() => (window as any).__musicNotes)).toBeGreaterThan(2);
  const p = await point(page, 700, 350); await page.mouse.move(p.x, p.y); await page.mouse.wheel(0, 400); await page.clock.runFor(150); expect((await state(page)).camera.zoom).toBeLessThan(1);
  for (let i = 0; i < 30 && (await state(page)).kills < 1; i++) { const s = await state(page), z = s.zombies.slice().sort((a: any, b: any) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0]; if (z) await fire(page, z.x, z.y - 16, 150); }
  expect((await state(page)).kills).toBeGreaterThan(0);
  await page.mouse.wheel(0, -800); await page.clock.runFor(100); const zoom = (await state(page)).camera.zoom; expect(zoom).toBeGreaterThan(0.65);
  await key(page, 'KeyP'); await page.mouse.wheel(0, 1000); await page.clock.runFor(100); expect((await state(page)).camera.zoom).toBe(zoom);
  await key(page, 'KeyL'); await page.reload(); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); expect((await state(page)).musicMuted).toBe(true); expect(errors).toEqual([]);
});

test('五类防御和六人兵种阵地，2/3 倍速推进真实夜战，暂停与胜负保持正确', async ({ page }) => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, expeditions: 4, depot: { materials: 60, energy: 12, medkits: 0 }, survivors: ['engineer', 'medic', 'captain', 'ranger', 'brawler'], weapons: ['pistol', 'rifle', 'axe', 'bow'], lastSummary: null, base: null })));
  await ready(page, 'base'); expect((await state(page)).plan.soldiers).toHaveLength(6);
  for (const [code, x, y] of [['Digit2', 832, 352], ['Digit3', 960, 352], ['Digit4', 608, 640], ['Digit4', 864, 640], ['Digit1', 960, 640], ['Digit5', 1056, 640]] as const) { await key(page, code); await click(page, x + 4, y + 4, true); await key(page, 'Escape'); }
  expect(new Set((await state(page)).plan.buildings.map((b: any) => b.kind)).size).toBe(5);
  await key(page, 'KeyT'); const two = await state(page); await page.clock.runFor(1000); expect((await state(page)).plan.elapsed - two.plan.elapsed).toBeCloseTo(2, 0);
  await key(page, 'KeyT'); expect((await state(page)).speed).toBe(3); await page.screenshot({ path: 'artifacts/expansion-defenses.png' });
  await key(page, 'Enter'); await key(page, 'KeyN'); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready); await page.clock.runFor(100); expect((await state(page)).speed).toBe(1);
  await key(page, 'KeyT'); await key(page, 'KeyT'); const before = await state(page); await page.clock.runFor(2000); expect((await state(page)).elapsed - before.elapsed).toBeCloseTo(6, 0);
  await key(page, 'KeyP'); const paused = await state(page); await key(page, 'KeyT'); await page.clock.runFor(2000); expect(await state(page)).toEqual(paused); await key(page, 'KeyP');
  for (let i = 0; i < 11 && (await state(page)).status === 'playing'; i++) { await page.clock.runFor(4000); if (i === 6) await page.screenshot({ path: 'artifacts/expansion-fast-night.png' }); }
  const ended = await state(page); expect(ended.status).toBe('victory'); expect(ended.elapsed).toBe(120); expect(ended.wave).toBe(5); expect(ended.kills).toBeGreaterThan(30); expect(ended.view.particles).toBeLessThanOrEqual(240);
  await key(page, 'KeyT'); await page.clock.runFor(1000); expect(await state(page)).toEqual(ended); expect(errors).toEqual([]);
});
