import { test, expect, type Page } from './fixtures.ts';
import { Navigation } from '../../src/core/navigation.ts';

const state = (page: Page): Promise<any> => page.evaluate(() => ((window as any).__nightLight ?? (window as any).__baseLight ?? (window as any).__lastLight).snapshot());
async function key(page: Page, code: string) { await page.keyboard.press(code); await page.clock.runFor(60); }
async function click(page: Page, x: number, y: number, world = false) {
  if (world) { const s = await state(page); x = (x - s.camera.x) * s.camera.zoom; y = (y - s.camera.y) * s.camera.zoom; }
  const box = (await page.locator('canvas').boundingBox())!; await page.mouse.click(box.x + x / 1280 * box.width, box.y + y / 720 * box.height); await page.clock.runFor(80);
}
async function walk(page: Page, x: number, y: number) {
  const first = await state(page), goal = { x, y }, nav = new Navigation(2048, 1408, 32, first.expedition.layout.obstacles, 12); nav.rebuild(goal);
  for (let i = 0; i < 350; i++) {
    const s = await state(page), p = s.player, dx = x - p.x, dy = y - p.y;
    if (s.status !== 'playing') throw new Error(`探索在抵达目标前结束: ${s.status}`);
    if (Math.hypot(dx, dy) < 25) return;
    const d = nav.direction(p, goal), keys = [Math.abs(d.x) > .1 ? d.x > 0 ? 'KeyD' : 'KeyA' : '', Math.abs(d.y) > .1 ? d.y > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
    for (const code of keys) await page.keyboard.down(code); await page.clock.runFor(100); for (const code of keys) await page.keyboard.up(code);
    const z = s.zombies.filter((z: any) => s.expedition.vision.visibleEnemies.includes(z.id)).sort((a: any, b: any) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (z) { const box = (await page.locator('canvas').boundingBox())!; await page.mouse.move(box.x + (z.x - s.camera.x) * (s.camera.zoom ?? 1) / 1280 * box.width, box.y + (z.y - 16 - s.camera.y) * (s.camera.zoom ?? 1) / 720 * box.height); }
  }
  throw new Error(`无法步行到 ${x},${y}: ${JSON.stringify((await state(page)).player)}`);
}

test('首阶段锁定设施、胜利保存成长、直接进入第二阶段，也可选择探索', async ({ page }) => {
  test.setTimeout(150000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (!localStorage.getItem('last-light.campaign.v2')) localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, expeditions: 1, depot: { materials: 16, energy: 2, medkits: 0 }, survivors: ['engineer'], weapons: ['pistol', 'rifle'], lastSummary: null, base: null })); });
  await page.clock.install(); await page.goto('/?play=1&test=1&mode=base'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await page.clock.runFor(100);
  const before = (await state(page)).campaign.depot; await key(page, 'Digit6'); expect((await state(page)).placement).toBe(null); expect((await state(page)).campaign.depot).toEqual(before);
  await page.screenshot({ path: 'artifacts/progression-stage-one.png' });
  for (const [code, x, y] of [['Digit2', 1088, 544], ['Digit4', 864, 832], ['Digit4', 1120, 832], ['Digit1', 1216, 832]] as const) { await key(page, code); await click(page, x + 4, y + 4, true); await key(page, 'Escape'); }
  await key(page, 'Enter'); await key(page, 'KeyN'); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready); await key(page, 'KeyT'); await key(page, 'KeyT');
  for (let i = 0; i < 13 && (await state(page)).status === 'playing'; i++) await page.clock.runFor(3500);
  const win = await state(page); expect(win.status).toBe('victory'); expect(win.bossesSeen).toEqual(['axeman']);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('last-light.campaign.v2')!)); expect(saved.clearedStage).toBe(1); expect(saved.base.stage).toBe(1);
  await key(page, 'Enter'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); expect((await state(page)).plan.stage).toBe(2);
  // 用已保存结果重新打开原阵地，再从布防入口回城；不向只读诊断接口写入状态。
  await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await key(page, 'Enter'); await click(page, 1198, 70);
  await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); await page.clock.runFor(200);
  expect((await state(page)).expedition.survivors.some((s: any) => s.id === 'guardian')).toBe(true);
  // 后续探索允许空手回营；此例验证阶段分支，不把随机搜救战斗混进施工解锁断言。
  await walk(page, 920, 760); await key(page, 'KeyE'); expect((await state(page)).status).toBe('complete'); await key(page, 'Enter');
  await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); expect((await state(page)).plan.stage).toBe(2);
  await key(page, 'Digit6'); expect((await state(page)).placement).toBe('grid'); await click(page, 1284, 772, true); await key(page, 'Escape');
  expect((await state(page)).plan.buildings.some((b: any) => b.kind === 'grid')).toBe(true);
  await page.screenshot({ path: 'artifacts/progression-stage-two.png' }); expect(errors).toEqual([]);
});

test('第二阶段真实进入新街区房屋，英雄营救、伏击与护送返营，刷新保留英雄', async ({ page }) => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (!localStorage.getItem('last-light.campaign.v2')) localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, clearedStage: 1, lanternLevel: 2, expeditions: 1, depot: { materials: 0, energy: 0, medkits: 0 }, survivors: [], weapons: ['pistol', 'rifle'], lastSummary: null, base: null })); });
  await page.clock.install(); await page.goto('/?play=1&test=1'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); await page.clock.runFor(100);
  await key(page, 'Digit2'); const box = (await page.locator('canvas').boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  const hero = (await state(page)).expedition.survivors.find((s: any) => s.id === 'guardian'); await walk(page, hero.x, hero.y);
  await page.mouse.up(); await page.screenshot({ path: 'artifacts/progression-hero-rescue.png' });
  await key(page, 'KeyE'); expect((await state(page)).expedition.survivors.find((s: any) => s.id === 'guardian').state).toBe('following');
  await page.mouse.down(); await walk(page, 920, 760); await page.mouse.up();
  await page.clock.runFor(1200); await key(page, 'KeyE'); expect((await state(page)).expedition.summary.rescued).toContain('guardian');
  await key(page, 'Enter'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  expect((await state(page)).plan.soldiers.filter((s: any) => s.role === 'guardian')).toHaveLength(1);
  await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  expect((await state(page)).plan.soldiers.filter((s: any) => s.role === 'guardian')).toHaveLength(1); expect(errors).toEqual([]);
});

test('后期新增区域真实施工、远距离编队移动、小地图定位与存档刷新', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (!localStorage.getItem('last-light.campaign.v2')) localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, clearedStage: 3, expeditions: 2, depot: { materials: 60, energy: 20, medkits: 0 }, survivors: [], weapons: ['pistol'], lastSummary: null, base: null })); });
  await page.clock.install(); await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await page.clock.runFor(100);
  await click(page, 1240, 192); // 战术地图右下区域，只定位相机。
  await key(page, 'Digit9'); await click(page, 1892, 1252, true); await key(page, 'Escape');
  expect((await state(page)).plan.buildings).toMatchObject([{ kind: 'sniper', x: 1888, y: 1248 }]);
  await key(page, 'Space'); const s = await state(page), box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + (1800 - s.camera.x) * s.camera.zoom / 1280 * box.width, box.y + (1248 - s.camera.y) * s.camera.zoom / 720 * box.height, { button: 'right' });
  await page.clock.runFor(1000); expect((await state(page)).plan.soldiers.some((s: any) => s.moving)).toBe(true);
  await page.screenshot({ path: 'artifacts/progression-expanded-sector.png' });
  await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  expect((await state(page)).plan.buildings).toHaveLength(1); expect((await state(page)).campaign.depot.materials).toBe(36); expect(errors).toEqual([]);
});
