import { test, expect, type Page } from '@playwright/test';

const state = (page: Page): Promise<any> => page.evaluate(() => (window as any).__lastLight.snapshot());
async function key(page: Page, code: string) { await page.keyboard.press(code); await page.clock.runFor(60); }
async function click(page: Page, x: number, y: number) { const b = (await page.locator('canvas').boundingBox())!; await page.mouse.click(b.x + x / 1280 * b.width, b.y + y / 720 * b.height); await page.clock.runFor(80); }
async function walk(page: Page, x: number, y: number) {
  for (let i = 0; i < 50; i++) {
    const p = (await state(page)).player, dx = x - p.x, dy = y - p.y; if (Math.hypot(dx, dy) < 12) return;
    const keys = [Math.abs(dx) > 8 ? dx > 0 ? 'KeyD' : 'KeyA' : '', Math.abs(dy) > 8 ? dy > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
    for (const k of keys) await page.keyboard.down(k); await page.clock.runFor(90); for (const k of keys) await page.keyboard.up(k);
  }
  throw Error('探索目标无法到达');
}

test('首次开场真实播放三幕叙事，失焦暂停，自动开始不消耗探索预算且记住已观看', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.clock.install(); await page.goto('/?test=1');
  await page.waitForFunction(() => (window as any).__storyLight?.snapshot().ready); await page.clock.runFor(500);
  expect(await page.evaluate(() => '__lastLight' in window)).toBe(false); await page.screenshot({ path: 'artifacts/story-darkness.png' });
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); const paused = await page.evaluate(() => (window as any).__storyLight.snapshot());
  await page.clock.runFor(2000); expect(await page.evaluate(() => (window as any).__storyLight.snapshot())).toEqual(paused);
  await click(page, 500, 350); await page.clock.runFor(2700); expect(await page.evaluate(() => (window as any).__storyLight.snapshot().chapter)).toBe(1);
  await page.screenshot({ path: 'artifacts/story-home.png' }); await page.clock.runFor(3100); expect(await page.evaluate(() => (window as any).__storyLight.snapshot().chapter)).toBe(2);
  await page.screenshot({ path: 'artifacts/story-mission.png' }); await page.clock.runFor(3000); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready);
  expect((await state(page)).elapsed).toBeLessThan(1); expect(await page.evaluate(() => '__storyLight' in window)).toBe(false);
  expect(await page.evaluate(() => sessionStorage.getItem('last-light.prologue.seen'))).toBe('1');
  await page.reload(); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); expect(await page.evaluate(() => '__storyLight' in window)).toBe(false); expect(errors).toEqual([]);
});

test('公开序章重播入口可立即跳过，存储禁用不阻断游戏，跳过键不误射击', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('storage disabled'); }; });
  await page.clock.install(); await page.goto('/?intro=1&test=1'); await page.waitForFunction(() => (window as any).__storyLight?.snapshot().ready);
  await key(page, 'Space'); await page.clock.runFor(100); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready);
  expect((await state(page)).player.shots).toBe(0); expect((await state(page)).status).toBe('playing'); expect(errors).toEqual([]);
});

test('真实提灯探索揭开迷雾，搜刮镜片即时增亮，安全返营保留灯级并播放归来叠化', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => sessionStorage.setItem('last-light.prologue.seen', '1'));
  await page.clock.install(); await page.goto('/?test=1'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); await page.clock.runFor(850);
  const start = await state(page); expect(start.expedition.capacity).toBe(48); expect(start.expedition.lightRadius).toBe(240);
  expect(start.view.visibleEnemies).toBe(start.expedition.vision.visibleEnemies.length); expect(start.expedition.vision.visibleSurvivors).not.toContain('ranger');
  await page.screenshot({ path: 'artifacts/fog-before.png' }); await walk(page, 1152, 688); await key(page, 'KeyE'); const brighter = await state(page);
  expect(brighter.expedition.lanternLevel).toBe(1); expect(brighter.expedition.lightRadius).toBe(320); expect(brighter.expedition.vision.explored).toBeGreaterThan(start.expedition.vision.explored);
  expect(brighter.view.visibleEnemies).toBe(brighter.expedition.vision.visibleEnemies.length); await page.screenshot({ path: 'artifacts/fog-upgraded.png' });
  await key(page, 'KeyP'); const paused = await state(page); await page.clock.runFor(1000); expect(await state(page)).toEqual(paused); await key(page, 'KeyP');
  await walk(page, 920, 760); await key(page, 'KeyE'); expect((await state(page)).status).toBe('complete');
  expect(await page.evaluate(() => (window as any).__lastLight.presentation().title)).toContain('归来'); await page.screenshot({ path: 'artifacts/return-transition.png' });
  await page.clock.runFor(2300); expect(await page.evaluate(() => (window as any).__lastLight.presentation().active)).toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('last-light.campaign.v2')!).lanternLevel)).toBe(1);
  await key(page, 'Enter'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await page.screenshot({ path: 'artifacts/home-transition.png' });
  await page.goto('/?test=1'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); expect((await state(page)).expedition.lightRadius).toBe(320); expect(errors).toEqual([]);
});

test('实机可建六十段墙，正常扣费、保存并刷新，原四十座限制已移除', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (!localStorage.getItem('last-light.campaign.v2')) localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, expeditions: 1, depot: { materials: 100, energy: 0, medkits: 0 }, survivors: [], weapons: ['pistol'], lastSummary: null, base: null })); });
  await page.clock.install(); await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await page.clock.runFor(850); await key(page, 'Digit5');
  for (let i = 0; i < 60; i++) {
    const s = await page.evaluate(() => (window as any).__baseLight.snapshot()), x = 368 + i % 10 * 32, y = 272 + Math.floor(i / 10) * 32;
    await click(page, (x - s.camera.x) * s.camera.zoom, (y - s.camera.y) * s.camera.zoom);
  }
  const result = await page.evaluate(() => (window as any).__baseLight.snapshot()); expect(result.plan.buildings).toHaveLength(60); expect(result.campaign.depot.materials).toBe(40);
  await page.screenshot({ path: 'artifacts/sixty-walls.png' }); await page.reload(); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  expect((await page.evaluate(() => (window as any).__baseLight.snapshot())).plan.buildings).toHaveLength(60); expect(errors).toEqual([]);
});
