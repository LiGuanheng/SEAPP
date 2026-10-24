import { test, expect, type Page } from './fixtures.ts';

const state = (page: Page): Promise<any> => page.evaluate(() => ((window as any).__nightLight ?? (window as any).__baseLight ?? (window as any).__lastLight).snapshot());
async function key(page: Page, code: string) { await page.keyboard.press(code); await page.clock.runFor(60); }
async function clickWorld(page: Page, x: number, y: number) {
  const s = await state(page), b = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(b.x + (x - s.camera.x) * s.camera.zoom / 1280 * b.width, b.y + (y - s.camera.y) * s.camera.zoom / 720 * b.height); await page.clock.runFor(80);
}

test('实机完整夜战四位 Boss、蜘蛛/亡灵/飞行随从与范围技能；新素材无缺帧报错', async ({ page }) => {
  test.setTimeout(150000); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' || /frame.*not found|missing.*texture/i.test(m.text())) errors.push(m.text()); });
  // 合法丰富存档，用于覆盖所有兵种与整场演出；真实短路线另由 night.spec 验证。
  await page.addInitScript(() => localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, expeditions: 4, depot: { materials: 60, energy: 12, medkits: 0 }, survivors: ['engineer', 'medic', 'captain', 'ranger', 'brawler'], weapons: ['pistol', 'rifle', 'axe', 'bow'], lastSummary: null, base: null })));
  await page.clock.install(); await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await page.clock.runFor(100);
  for (const [code, x, y] of [['Digit2', 832, 352], ['Digit3', 960, 352], ['Digit4', 608, 640], ['Digit4', 864, 640], ['Digit5', 1376, 672]] as const) { await key(page, code); await clickWorld(page, x + 4, y + 4); await key(page, 'Escape'); }
  expect((await state(page)).plan.buildings).toHaveLength(5);
  await page.screenshot({ path: 'artifacts/bosses-large-base.png' });
  await key(page, 'Enter'); await key(page, 'KeyN'); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready); await key(page, 'KeyT'); await key(page, 'KeyT');
  const followers = new Set<string>(), captured = new Set<string>(), focused = new Set<string>(); let skill = false, checkedPause = false;
  for (let i = 0; i < 245 && (await state(page)).status === 'playing'; i++) {
    await page.clock.runFor(180); const s = await state(page);
    for (const e of s.enemies) {
      followers.add(e.kind);
      if (['queen', 'axeman', 'knight', 'bird'].includes(e.kind) && !captured.has(e.kind)) {
        if (!focused.has(e.kind)) {
          // 使用真实镜头操作观察入口，避免把屏幕外的 Boss 名称条当作精灵截图。
          await key(page, 'KeyC'); const direction = ({ queen: 'KeyA', axeman: 'KeyW', knight: 'KeyS', bird: 'KeyD' } as Record<string, string>)[e.kind];
          await page.keyboard.down(direction); await page.clock.runFor(600); await page.keyboard.up(direction); focused.add(e.kind);
        }
        const current = await state(page), actor = current.enemies.find((a: any) => a.id === e.id);
        if (actor) {
          const x = (actor.x - current.camera.x) * current.camera.zoom, y = (actor.y - current.camera.y) * current.camera.zoom;
          const visible = Math.hypot(actor.x - 768, actor.y - 512) < 390 || current.plan.soldiers.some((s: any) => current.fighters.some((f: any) => f.id === s.id && f.health > 0) && Math.hypot(actor.x - s.x, actor.y - s.y) < 270) || current.plan.buildings.some((b: any) => ['turret', 'arrowtower', 'cannon'].includes(b.kind) && Math.hypot(actor.x - b.x - 32, actor.y - b.y - 32) < 300);
          if (visible && x > 80 && x < 1080 && y > 240 && y < 560) {
            // 等命中闪白结束再留图，素材外形才能辨认；不改战斗状态。
            let clean = actor;
            for (let frame = 0; frame < 6 && clean?.hurt > 0; frame++) { await page.clock.runFor(20); clean = (await state(page)).enemies.find((a: any) => a.id === e.id); }
            if (clean && clean.hurt === 0) { await page.screenshot({ path: `artifacts/boss-${e.kind}.png` }); captured.add(e.kind); await key(page, 'KeyC'); }
          }
        }
      }
    }
    if (s.hazards.length || s.enemies.some((e: any) => e.windup)) {
      skill = true;
      if (!checkedPause) {
        await key(page, 'KeyP'); const paused = await state(page); await page.screenshot({ path: 'artifacts/bosses-skill-paused.png' });
        await page.clock.runFor(2000); expect(await state(page)).toEqual(paused); await key(page, 'KeyP'); checkedPause = true;
      }
    }
    expect(s.enemies.length).toBeLessThanOrEqual(72); expect(s.hazards.length).toBeLessThanOrEqual(8);
  }
  const end = await state(page); expect(end.status).toBe('victory'); expect(end.elapsed).toBe(120);
  expect([...end.bossesSeen].sort()).toEqual(['axeman', 'bird', 'knight', 'queen']);
  for (const kind of ['spiderling', 'undead', 'crow']) expect(followers.has(kind)).toBe(true);
  expect(skill).toBe(true); expect(captured.size).toBe(4);
  expect(end.view.particles).toBeLessThanOrEqual(240); expect(end.view.corpses).toBeLessThanOrEqual(40); expect(end.view.objects).toBeLessThan(800);
  await page.screenshot({ path: 'artifacts/bosses-victory.png' }); await page.clock.runFor(1000); expect(await state(page)).toEqual(end); expect(errors).toEqual([]);
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
