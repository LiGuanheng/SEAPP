import { test, expect, type Page } from './fixtures.ts';

const state = (page: Page): Promise<any> => page.evaluate(() => (window as any).__lastLight.snapshot());
async function ready(page: Page) {
  await page.clock.install(); await page.goto('/?test=1');
  await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready);
  await page.clock.runFor(100);
}
async function walk(page: Page, x: number, y: number) {
  for (let i = 0; i < 40; i++) {
    const p = (await state(page)).player, dx = x - p.x, dy = y - p.y;
    if (Math.hypot(dx, dy) < 15) return;
    const keys = [Math.abs(dx) > 9 ? (dx > 0 ? 'KeyD' : 'KeyA') : '', Math.abs(dy) > 9 ? (dy > 0 ? 'KeyS' : 'KeyW') : ''].filter(Boolean);
    for (const key of keys) await page.keyboard.down(key);
    await page.clock.runFor(Math.min(140, Math.max(45, Math.hypot(dx, dy) / 168 * 900)));
    for (const key of keys) await page.keyboard.up(key);
  }
  throw Error(`无法走到 ${x},${y}：${JSON.stringify((await state(page)).player)}`);
}
async function shoot(page: Page, x: number, y: number, duration: number) {
  const s = await state(page), box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + (x - s.camera.x) / 1280 * box.width, box.y + (y - s.camera.y) / 720 * box.height);
  await page.mouse.down(); await page.clock.runFor(duration); await page.mouse.up();
}

test('键鼠完成搜刮、步枪、护送、背包暂停、提前回营与刷新存档', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await ready(page);
  await page.evaluate(() => localStorage.setItem('last-light.save.v1', 'legacy-sentinel'));
  await page.screenshot({ path: 'artifacts/phase2-exploration.png' });
  await walk(page, 1056, 736); await page.keyboard.press('KeyE'); await page.clock.runFor(50);
  expect((await state(page)).expedition.inventory).toEqual({ materials: 8, energy: 2, medkits: 0 });
  await page.keyboard.press('KeyE'); expect((await state(page)).expedition.inventory.materials).toBe(8);
  await walk(page, 1200, 780); await page.keyboard.press('KeyE'); await page.clock.runFor(50);
  expect((await state(page)).weaponId).toBe('rifle');
  await shoot(page, 1500, 780, 300); expect((await state(page)).player.ammo).toBeLessThan(24);
  const magazine = (await state(page)).player.ammo;
  await page.keyboard.press('Digit1'); expect((await state(page)).weaponId).toBe('pistol');
  await page.keyboard.press('Digit2'); expect((await state(page)).player.ammo).toBe(magazine);
  await walk(page, 1136, 852); await page.keyboard.press('KeyE'); await page.clock.runFor(100);
  expect((await state(page)).expedition.survivors[0].state).toBe('following');
  await page.keyboard.press('Tab'); await page.clock.runFor(40);
  const paused = await state(page); expect(paused.paused).toBe(true);
  await page.clock.runFor(4000); expect(await state(page)).toEqual(paused);
  await page.screenshot({ path: 'artifacts/phase2-backpack.png' });
  await page.keyboard.press('Escape'); await page.clock.runFor(50);
  expect((await state(page)).paused).toBe(false);
  await walk(page, 920, 760); await page.clock.runFor(600); await page.keyboard.press('KeyE'); await page.clock.runFor(100);
  const result = await state(page); expect(result.status).toBe('complete');
  expect(result.expedition.summary.rescued).toContain('engineer');
  expect(result.expedition.campaign.depot).toEqual({ materials: 12, energy: 2, medkits: 0 });
  expect(result.elapsed).toBeLessThan(30);
  await page.screenshot({ path: 'artifacts/phase2-return.png' });
  await page.keyboard.press('KeyE'); await page.clock.runFor(500); expect((await state(page)).expedition.campaign.expeditions).toBe(1);
  await page.reload(); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); await page.clock.runFor(100);
  expect((await state(page)).expedition.campaign.depot.materials).toBe(12);
  expect((await state(page)).expedition.inventory.materials).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('last-light.save.v1'))).toBe('legacy-sentinel');
  expect(errors).toEqual([]);
});

test('损坏存档与浏览器禁用存储时仍能探索、结算并清楚提示未保存', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('last-light.campaign.v2', '{broken');
    Storage.prototype.setItem = () => { throw new DOMException('storage disabled'); };
  });
  await ready(page); expect((await state(page)).expedition.campaign.expeditions).toBe(0);
  await walk(page, 1056, 736); await page.keyboard.press('KeyE');
  await walk(page, 920, 760); await page.keyboard.press('KeyE'); await page.clock.runFor(100);
  expect((await state(page)).status).toBe('complete');
  expect(await page.evaluate(() => localStorage.getItem('last-light.campaign.v2'))).toBe('{broken');
  await page.screenshot({ path: 'artifacts/phase2-storage-disabled.png' });
  expect(errors).toEqual([]);
});

test('实际射击防守至 90 秒，黄昏自动收队并只入库一次', async ({ page }) => {
  // 完整90秒模拟在并行Chrome软件渲染下可能接近真实时间；保留全部战斗断言。
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await ready(page);
  await walk(page, 1056, 736); await page.keyboard.press('KeyE');
  await walk(page, 1200, 780); await page.keyboard.press('KeyE');
  await walk(page, 1024, 736);
  for (let i = 0; i < 190; i++) {
    const s = await state(page);
    if (s.status !== 'playing') break;
    const enemy = s.zombies.slice().sort((a: any, b: any) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0];
    if (enemy) await shoot(page, enemy.x, enemy.y - 16, 500);
    else await page.clock.runFor(500);
  }
  const s = await state(page);
  expect(s.status).toBe('complete'); expect(s.expedition.summary.reason).toBe('sunset');
  expect(s.elapsed).toBe(90); expect(s.expedition.remaining).toBe(0); expect(s.expedition.summary.duration).toBe(90); expect(s.kills).toBeGreaterThan(5);
  expect(s.expedition.campaign.expeditions).toBe(1); expect(s.expedition.campaign.depot.materials).toBe(8);
  await page.clock.runFor(2000); expect(await state(page)).toEqual(s);
  await page.screenshot({ path: 'artifacts/phase2-sunset.png' });
  expect(errors).toEqual([]);
});
