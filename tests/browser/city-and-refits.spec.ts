import { test, expect, type Page } from './fixtures.ts';
import { Navigation } from '../../src/core/navigation.ts';
const state = (p: Page): Promise<any> => p.evaluate(() => ((window as any).__baseLight ?? (window as any).__nightLight ?? (window as any).__lastLight).snapshot());
async function key(p: Page, code: string) { await p.keyboard.press(code); await p.clock.runFor(60); }
async function clickWorld(p: Page, x: number, y: number) { const s = await state(p), b = (await p.locator('canvas').boundingBox())!; await p.mouse.click(b.x + (x - s.camera.x) * s.camera.zoom / 1280 * b.width, b.y + (y - s.camera.y) * s.camera.zoom / 720 * b.height); await p.clock.runFor(80); }
async function walk(p: Page, x: number, y: number) {
  const snapshot = await state(p), target = { x, y }, nav = new Navigation(2048, 1408, 32, snapshot.expedition.layout.obstacles, 12); nav.rebuild(target);
  for (let i = 0; i < 300; i++) {
    const s = await state(p), dx = x - s.player.x, dy = y - s.player.y;
    if (s.status !== 'playing') throw Error('城市路线途中失守：' + JSON.stringify(s.player));
    const enemy = s.zombies.filter((z: any) => Math.hypot(z.x - s.player.x, z.y - s.player.y) < 140).sort((a: any, b: any) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0];
    if (enemy) { const box = (await p.locator('canvas').boundingBox())!; await p.mouse.move(box.x + (enemy.x - s.camera.x) * s.camera.zoom / 1280 * box.width, box.y + (enemy.y - 16 - s.camera.y) * s.camera.zoom / 720 * box.height); }
    if (Math.hypot(dx, dy) < 24) return;
    const d = nav.direction(s.player, target), codes = [Math.abs(d.x) > .1 ? d.x > 0 ? 'KeyD' : 'KeyA' : '', Math.abs(d.y) > .1 ? d.y > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
    for (const k of codes) await p.keyboard.down(k);
    await p.clock.runFor(100);
    for (const k of codes) await p.keyboard.up(k);
  }
  throw Error('城市实际路线受阻：' + JSON.stringify((await state(p)).player));
}

test('三个种子真实走入不同街区门口与室内，轮廓/入口/道路结构变化且迷雾保留', async ({ page }) => {
  const shapes = new Set(), templates = new Set(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install();
  for (const seed of [1000, 1006, 1024]) {
    await page.goto(`/?play=1&test=1&seed=${seed}`); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready);
    await key(page, 'Digit3'); await page.mouse.move(600, 360); await page.mouse.down();
    const s = await state(page), room = s.expedition.layout.buildings[3], door = { x: (room.x + (room.doorColumn ?? Math.floor(room.width / 2)) + 0.5) * 32, y: (room.y + room.height) * 32 };
    templates.add(s.expedition.layout.template); shapes.add(JSON.stringify(room));
    for (const p of [[door.x, door.y + 36]]) await walk(page, p[0], p[1]);
    await page.screenshot({ path: `artifacts/v011/city-${seed}-entrance.png` });
    await walk(page, door.x, door.y - 48); expect((await state(page)).expedition.currentRoom).toBe(3);
    expect((await state(page)).expedition.vision.explored).toBeGreaterThan(s.expedition.vision.explored);
    await page.screenshot({ path: `artifacts/v011/city-${seed}-interior.png` });
    await page.mouse.up();
  }
  expect(templates.size).toBe(3); expect(shapes.size).toBe(3); expect(errors).toEqual([]);
});

test('真实库存改装两种炮塔、刷新保留、暂停不误扣，夜战实际发射防空破片与榴弹', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (!localStorage.getItem('last-light.campaign.v2')) localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, clearedStage: 2, expeditions: 0, depot: { materials: 100, energy: 30, medkits: 0 }, survivors: ['engineer'], weapons: ['pistol'], lastSummary: null, base: null })); });
  await page.clock.install(); await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  await key(page, 'Digit2'); await clickWorld(page, 676, 836); await key(page, 'Escape'); await clickWorld(page, 704, 864);
  await key(page, 'KeyP'); await key(page, 'KeyU'); expect((await state(page)).campaign.depot.materials).toBe(95); await key(page, 'KeyP');
  await key(page, 'KeyU'); expect((await state(page)).plan.buildings[0].upgrade).toBe('flak'); expect((await state(page)).campaign.depot.materials).toBe(90);
  await key(page, 'Digit3'); await clickWorld(page, 836, 548); await key(page, 'Escape'); await clickWorld(page, 864, 576); await key(page, 'KeyU');
  expect((await state(page)).plan.buildings[1].upgrade).toBe('howitzer'); expect((await state(page)).campaign.depot).toMatchObject({ materials: 75, energy: 19 });
  await page.screenshot({ path: 'artifacts/v011/refit-defenses.png' });
  await page.reload(); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); expect((await state(page)).plan.buildings.map((b: any) => b.upgrade)).toEqual(['flak', 'howitzer']);
  await key(page, 'Enter'); await key(page, 'KeyN'); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready); await key(page, 'Space'); await key(page, 'KeyT'); await key(page, 'KeyT');
  const depot = (await state(page)).campaign.depot; await key(page, 'KeyU'); expect((await state(page)).campaign.depot).toEqual(depot);
  let flak = false, shell = false;
  for (let i = 0; i < 90 && (await state(page)).status === 'playing'; i++) { await page.clock.runFor(150); const s = await state(page); flak ||= s.shotsFired.flak > 0; shell ||= s.shotsFired.shell > 0; if (flak && shell) break; }
  expect(flak).toBe(true); expect(shell).toBe(true); await page.screenshot({ path: 'artifacts/v011/refit-live-fire.png' }); expect(errors).toEqual([]);
});

test('出发、黄昏归来与失守均展示真实地图，跳过失败演出后进入成绩', async ({ page }) => {
  await page.clock.install(); await page.goto('/?play=1&test=1&seed=1000'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready);
  await page.clock.runFor(650); await page.screenshot({ path: 'artifacts/v011/departure.png' });
  await key(page, 'Space'); await walk(page, 1056, 736); await key(page, 'KeyE'); await walk(page, 920, 760); await key(page, 'KeyE');
  expect((await state(page)).status).toBe('complete'); await page.clock.runFor(700); await page.screenshot({ path: 'artifacts/v011/sunset-return.png' });
  await key(page, 'Space'); expect(await page.evaluate(() => (window as any).__lastLight.presentation().active)).toBe(false);
  await page.goto('/?mode=night&test=1'); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready); await key(page, 'Space'); await key(page, 'KeyT'); await key(page, 'KeyT');
  for (let i = 0; i < 100 && (await state(page)).status === 'playing'; i++) await page.clock.runFor(500);
  expect((await state(page)).status).toBe('defeat'); await page.clock.runFor(400); await page.screenshot({ path: 'artifacts/v011/defeat-extinction.png' });
  await key(page, 'Space'); expect((await state(page)).lampHealth).toBe(0); expect(await page.evaluate(() => (window as any).__nightLight.presentation().active)).toBe(false);
  await key(page, 'Enter'); await expect(page.getByRole('dialog')).toBeVisible(); expect((await state(page)).status).toBe('defeat'); expect((await state(page)).lampHealth).toBe(0);
});
