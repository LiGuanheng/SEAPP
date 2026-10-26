import { test, expect, type Page } from './fixtures.ts';

const state = (page: Page): Promise<any> => page.evaluate(() => ((window as any).__nightLight ?? (window as any).__baseLight ?? (window as any).__lastLight).snapshot());
async function key(page: Page, code: string) { await page.keyboard.press(code); await page.clock.runFor(60); }
async function clickWorld(page: Page, x: number, y: number) {
  const s = await state(page), b = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(b.x + (x - s.camera.x) * s.camera.zoom / 1280 * b.width, b.y + (y - s.camera.y) * s.camera.zoom / 720 * b.height); await page.clock.runFor(80);
}

test('第三阶段五位Boss逐波/双Boss登场，范围技能与新素材无缺帧，终局冻结', async ({ page }) => {
  test.setTimeout(150000); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' || /frame.*not found|missing.*texture/i.test(m.text())) errors.push(m.text()); });
  // 合法已解锁战役夹具；只通过键鼠施工和倍速，诊断接口保持只读。
  await page.addInitScript(() => localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, clearedStage: 2, expeditions: 4, depot: { materials: 100, energy: 40, medkits: 0 }, survivors: ['engineer', 'medic', 'captain', 'ranger', 'brawler', 'guardian', 'gunner'], weapons: ['pistol', 'rifle', 'axe', 'bow'], lastSummary: null, base: null })));
  await page.clock.install(); await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await page.clock.runFor(100);
  for (const [code, x, y] of [['Digit2', 832, 352], ['Digit3', 960, 352], ['Digit4', 608, 640], ['Digit4', 864, 640], ['Digit4', 608, 352], ['Digit6', 1024, 576], ['Digit7', 928, 736], ['Digit8', 576, 416], ['Digit9', 1056, 352], ['Digit2', 832, 800]] as const) { await key(page, code); if (y >= 800) { await page.keyboard.down('KeyS'); await page.clock.runFor(300); await page.keyboard.up('KeyS'); } await clickWorld(page, x + 4, y + 4); await key(page, 'Escape'); if (y >= 800) await key(page, 'KeyC'); }
  expect((await state(page)).plan.buildings).toHaveLength(10);
  expect((await state(page)).plan.soldiers).toHaveLength(8);
  await page.screenshot({ path: 'artifacts/progression-late-base.png' });
  await key(page, 'Enter'); await key(page, 'KeyN'); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready); await key(page, 'KeyT'); await key(page, 'KeyT');
  const kinds = new Set<string>(); let skill = false, checkedPause = false, capturedNewBoss = false, capturedHorde = false;
  for (let i = 0; i < 260 && (await state(page)).status === 'playing'; i++) {
    await page.clock.runFor(180); const s = await state(page);
    for (const e of s.enemies) kinds.add(e.kind);
    if (!capturedHorde && s.enemies.length >= 40) { await page.screenshot({ path: 'artifacts/assault-horde.png' }); capturedHorde = true; }
    if (s.hazards.length || s.enemies.some((e: any) => e.windup)) {
      skill = true;
      if (!checkedPause) {
        await key(page, 'KeyP'); const paused = await state(page); await page.screenshot({ path: 'artifacts/progression-skill-paused.png' });
        await page.clock.runFor(2000); expect(await state(page)).toEqual(paused); await key(page, 'KeyP'); checkedPause = true;
      }
    }
    if (!capturedNewBoss && s.enemies.some((e: any) => ['bomber', 'blighter'].includes(e.kind) && Math.hypot(e.x - 768, e.y - 512) < 390)) {
      await page.screenshot({ path: 'artifacts/progression-new-boss.png' }); capturedNewBoss = true;
    }
    expect(s.enemies.length).toBeLessThanOrEqual(72); expect(s.hazards.length).toBeLessThanOrEqual(8);
  }
  const end = await state(page); expect(end.status).toBe('victory'); expect(end.elapsed).toBe(120); expect(end.stage).toBe(3);
  expect([...end.bossesSeen].sort()).toEqual(['bird', 'blighter', 'bomber', 'knight', 'queen']);
  for (const kind of ['spiderling', 'undead', 'crow']) expect(kinds.has(kind)).toBe(true);
  expect(skill).toBe(true); expect(capturedNewBoss).toBe(true); expect(capturedHorde).toBe(true);
  expect(end.view.particles).toBeLessThanOrEqual(240); expect(end.view.corpses).toBeLessThanOrEqual(40); expect(end.view.objects).toBeLessThan(800);
  await page.screenshot({ path: 'artifacts/progression-final-victory.png' }); await page.clock.runFor(1000); expect(await state(page)).toEqual(end); expect(errors).toEqual([]);
});

test('重新探索真实生成新种子和支线摆位，保留主线物资、药房奖励与工程师位置', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.clock.install();
  const seeds = new Set<number>(), shapes = new Set<string>();
  for (let i = 0; i < 3; i++) {
    await page.goto('/?test=1'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); await page.clock.runFor(100);
    const s = await state(page), e = s.expedition; seeds.add(e.layout.seed); shapes.add(JSON.stringify(e.layout.debris));
    expect(e.caches.find((c: any) => c.id === 'salvage')).toMatchObject({ x: 1056, y: 736, opened: false });
    expect(e.caches.find((c: any) => c.id === 'room-1')).toMatchObject({ x: 1024, y: 432 });
    expect(e.survivors.find((n: any) => n.id === 'engineer')).toMatchObject({ x: 1104, y: 852 });
    await page.screenshot({ path: `artifacts/varied-city-${i}.png` });
  }
  expect(seeds.size).toBe(3); expect(shapes.size).toBeGreaterThan(1); expect(errors).toEqual([]);
});
