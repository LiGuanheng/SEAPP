import { test, expect, type Page } from './fixtures.ts';

const state = (page: Page): Promise<any> => page.evaluate(() => ((window as any).__nightLight ?? (window as any).__baseLight ?? (window as any).__lastLight).snapshot());
async function key(page: Page, code: string) { await page.keyboard.press(code); await page.clock.runFor(60); }
async function click(page: Page, x: number, y: number, world = false) {
  if (world) { const s = await state(page); x = (x - s.camera.x) * s.camera.zoom; y = (y - s.camera.y) * s.camera.zoom; }
  const box = (await page.locator('canvas').boundingBox())!; await page.mouse.click(box.x + x / 1280 * box.width, box.y + y / 720 * box.height); await page.clock.runFor(80);
}
async function walk(page: Page, x: number, y: number) {
  for (let i = 0; i < 80; i++) {
    const s = await state(page), p = s.player, dx = x - p.x, dy = y - p.y;
    if (Math.hypot(dx, dy) < 7) return;
    const code = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'KeyD' : 'KeyA' : dy > 0 ? 'KeyS' : 'KeyW';
    await page.keyboard.down(code); await page.clock.runFor(Math.min(150, Math.max(20, Math.max(Math.abs(dx), Math.abs(dy)) / 168 * 1000))); await page.keyboard.up(code);
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
  for (const [code, x, y] of [['Digit2', 832, 352], ['Digit4', 608, 640], ['Digit4', 864, 640], ['Digit1', 960, 640]] as const) { await key(page, code); await click(page, x + 4, y + 4, true); await key(page, 'Escape'); }
  await key(page, 'Enter'); await key(page, 'KeyN'); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready); await key(page, 'KeyT'); await key(page, 'KeyT');
  for (let i = 0; i < 13 && (await state(page)).status === 'playing'; i++) await page.clock.runFor(3500);
  const win = await state(page); expect(win.status).toBe('victory'); expect(win.bossesSeen).toEqual(['axeman']);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('last-light.campaign.v2')!)); expect(saved.clearedStage).toBe(1); expect(saved.base.stage).toBe(1);
  await key(page, 'Enter'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); expect((await state(page)).plan.stage).toBe(2);
  // 用已保存结果重新打开原阵地，再从布防入口回城；不向只读诊断接口写入状态。
  await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await key(page, 'Enter'); await click(page, 1198, 70);
  await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); await page.clock.runFor(200);
  expect((await state(page)).expedition.survivors.some((s: any) => s.id === 'guardian')).toBe(true);
  await walk(page, 1056, 736); await key(page, 'KeyE'); await walk(page, 920, 760); await key(page, 'KeyE'); await key(page, 'Enter');
  await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); expect((await state(page)).plan.stage).toBe(2);
  await key(page, 'Digit6'); expect((await state(page)).placement).toBe('grid'); await click(page, 1028, 580, true); await key(page, 'Escape');
  expect((await state(page)).plan.buildings.some((b: any) => b.kind === 'grid')).toBe(true);
  await page.screenshot({ path: 'artifacts/progression-stage-two.png' }); expect(errors).toEqual([]);
});

test('第二阶段真实进入维修站，英雄营救、伏击与护送返营，刷新保留英雄', async ({ page }) => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (!localStorage.getItem('last-light.campaign.v2')) localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, clearedStage: 1, lanternLevel: 2, expeditions: 1, depot: { materials: 0, energy: 0, medkits: 0 }, survivors: [], weapons: ['pistol'], lastSummary: null, base: null })); });
  await page.clock.install(); await page.goto('/?play=1&test=1'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); await page.clock.runFor(100);
  await key(page, 'Digit3'); const box = (await page.locator('canvas').boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  for (const [x, y] of [[624, 720], [624, 592], [272, 592], [272, 528], [272, 432], [352, 368]]) await walk(page, x, y);
  await page.mouse.up(); await page.screenshot({ path: 'artifacts/progression-hero-rescue.png' });
  await key(page, 'KeyE'); expect((await state(page)).expedition.survivors.find((s: any) => s.id === 'guardian').state).toBe('following');
  await page.mouse.down(); for (const [x, y] of [[272, 432], [272, 528], [272, 592], [624, 592], [624, 720], [920, 760]]) await walk(page, x, y); await page.mouse.up();
  await page.clock.runFor(1200); await key(page, 'KeyE'); expect((await state(page)).expedition.summary.rescued).toContain('guardian');
  await key(page, 'Enter'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  expect((await state(page)).plan.soldiers.filter((s: any) => s.role === 'guardian')).toHaveLength(1);
  await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  expect((await state(page)).plan.soldiers.filter((s: any) => s.role === 'guardian')).toHaveLength(1); expect(errors).toEqual([]);
});

test('后期新增区域真实施工、远距离编队移动、小地图定位与存档刷新', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (!localStorage.getItem('last-light.campaign.v2')) localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, clearedStage: 2, expeditions: 2, depot: { materials: 60, energy: 20, medkits: 0 }, survivors: [], weapons: ['pistol'], lastSummary: null, base: null })); });
  await page.clock.install(); await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await page.clock.runFor(100);
  await click(page, 1240, 192); // 战术地图右下区域，只定位相机。
  await key(page, 'Digit9'); await click(page, 1764, 1092, true); await key(page, 'Escape');
  expect((await state(page)).plan.buildings).toMatchObject([{ kind: 'sniper', x: 1760, y: 1088 }]);
  await key(page, 'Space'); const s = await state(page), box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + (1680 - s.camera.x) * s.camera.zoom / 1280 * box.width, box.y + (1050 - s.camera.y) * s.camera.zoom / 720 * box.height, { button: 'right' });
  await page.clock.runFor(1000); expect((await state(page)).plan.soldiers.some((s: any) => s.moving)).toBe(true);
  await page.screenshot({ path: 'artifacts/progression-expanded-sector.png' });
  await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  expect((await state(page)).plan.buildings).toHaveLength(1); expect((await state(page)).campaign.depot.materials).toBe(50); expect(errors).toEqual([]);
});
