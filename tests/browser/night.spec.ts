import { test, expect, type Page } from './fixtures.ts';

const state = (page: Page): Promise<any> => page.evaluate(() => (window as any).__nightLight.snapshot());
async function key(page: Page, code: string) { await page.keyboard.press(code); await page.clock.runFor(60); }
async function screen(page: Page, x: number, y: number) { const b = (await page.locator('canvas').boundingBox())!; return { x: b.x + x / 1280 * b.width, y: b.y + y / 720 * b.height }; }
async function worldPoint(page: Page, x: number, y: number, base = false) {
  const s = base ? await page.evaluate(() => (window as any).__baseLight.snapshot()) : await state(page);
  return screen(page, (x - s.camera.x) * s.camera.zoom, (y - s.camera.y) * s.camera.zoom);
}
async function clickWorld(page: Page, x: number, y: number, base = false, button: 'left' | 'right' = 'left') { const p = await worldPoint(page, x, y, base); await page.mouse.click(p.x, p.y, { button }); await page.clock.runFor(80); }
async function walk(page: Page, x: number, y: number) {
  for (let i = 0; i < 50; i++) {
    const p = await page.evaluate(() => (window as any).__lastLight.snapshot().player), dx = x - p.x, dy = y - p.y;
    if (Math.hypot(dx, dy) < 15) return;
    const keys = [Math.abs(dx) > 9 ? (dx > 0 ? 'KeyD' : 'KeyA') : '', Math.abs(dy) > 9 ? (dy > 0 ? 'KeyS' : 'KeyW') : ''].filter(Boolean);
    for (const k of keys) await page.keyboard.down(k); await page.clock.runFor(Math.min(140, Math.max(40, Math.hypot(dx, dy) / 168 * 900))); for (const k of keys) await page.keyboard.up(k);
  }
  throw Error('无法到达探索目标');
}

test('一轮探索、手动完成布防入夜、真实指挥/炮火/暂停/音效开关、120 秒守夜胜利并保存', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.clock.install(); await page.goto('/?play=1&test=1'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); await page.clock.runFor(100);
  for (const p of [{ x: 1056, y: 736 }, { x: 1200, y: 780 }, { x: 1264, y: 704 }, { x: 1104, y: 852 }, { x: 920, y: 760 }]) { await walk(page, p.x, p.y); await page.clock.runFor(200); await key(page, 'KeyE'); }
  await key(page, 'Enter'); await page.clock.runFor(200); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  await key(page, 'Digit2'); await clickWorld(page, 1092, 548, true);
  await key(page, 'Digit1'); await key(page, 'KeyR'); await page.clock.runFor(50); await clickWorld(page, 1220, 836, true); await key(page, 'Escape');
  await key(page, 'Digit4'); await clickWorld(page, 868, 836, true); await clickWorld(page, 1124, 836, true); await key(page, 'Escape');
  expect((await page.evaluate(() => (window as any).__baseLight.snapshot())).plan.buildings).toHaveLength(4);
  expect((await page.evaluate(() => (window as any).__baseLight.snapshot())).plan.buildings[1].rotation).toBe(1);
  await page.clock.runFor(30000); expect((await page.evaluate(() => (window as any).__baseLight.snapshot())).plan.status).toBe('preparing'); await key(page,'Enter'); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready); await page.clock.runFor(100);
  expect(await page.evaluate(() => '__baseLight' in window)).toBe(false);
  expect((await state(page)).status).toBe('playing'); expect((await state(page)).charges).toBe(2);
  await key(page, 'KeyM'); await page.clock.runFor(50); expect((await state(page)).muted).toBe(true); await key(page, 'KeyM'); await page.clock.runFor(50); expect((await state(page)).muted).toBe(false);
  await page.clock.runFor(6000); await page.screenshot({ path: 'artifacts/phase4-night.png' });
  await clickWorld(page, 944, 796); await clickWorld(page, 944, 784, false, 'right'); await page.clock.runFor(300); await key(page, 'KeyG');
  await key(page, 'Space'); expect((await state(page)).selected).toHaveLength(4);
  await key(page, 'KeyP'); await page.clock.runFor(100); const paused = await state(page); expect(paused.paused).toBe(true);
  const covered = await screen(page, 350, 663); await page.mouse.click(covered.x, covered.y); await page.clock.runFor(3000); expect(await state(page)).toEqual(paused);
  await key(page, 'KeyP'); await key(page, 'KeyF'); await clickWorld(page, 1176, 784); expect((await state(page)).charges).toBe(1);
  await page.clock.runFor(650); await page.screenshot({ path: 'artifacts/phase4-explosion.png' });
  let capturedHorde = false;
  for (let i = 0; i < 32; i++) {
    const s = await state(page); if (s.status !== 'playing') break;
    if (s.elapsed > 107 && !capturedHorde) { await page.screenshot({ path: 'artifacts/phase4-horde.png' }); capturedHorde = true; }
    if (s.elapsed > 55 && s.charges && s.supportCooldown === 0) {
      const e = s.enemies.find((e: any) => e.kind === 'brute' && Math.hypot(e.x - 1024, e.y - 704) < 360);
      if (e) { await key(page, 'KeyF'); await clickWorld(page, e.x, e.y); }
    }
    await page.clock.runFor(4000);
  }
  const won = await state(page); expect(won.status).toBe('victory'); expect(won.elapsed).toBe(120); expect(won.lampHealth).toBeGreaterThan(0); expect(won.kills).toBeGreaterThan(25); expect(won.wave).toBe(5);
  expect(won.view.particles).toBeLessThanOrEqual(240); expect(won.view.corpses).toBeLessThanOrEqual(40); expect(won.view.objects).toBeLessThan(800);
  await page.screenshot({ path: 'artifacts/phase4-victory.png' });
  await page.clock.runFor(3000); expect(await state(page)).toEqual(won);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('last-light.campaign.v2')!)); expect(saved.nightsWon).toBe(1); expect(saved.lastNight.outcome).toBe('victory');
  expect(saved.base.buildings).toHaveLength(4);
  await key(page, 'Enter'); await page.clock.runFor(200); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  const next = await page.evaluate(() => (window as any).__baseLight.snapshot()); expect(next.plan.stage).toBe(2); expect(next.plan.status).toBe('preparing'); expect(next.lightRadius).toBe(640);
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('last-light.campaign.v2')!))).nightsWon).toBe(1);
  expect(errors).toEqual([]);
});

test('没有设施时真实失守，存储禁用仍能结算，Enter不会自动重试', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install(); await page.goto('/?mode=night&test=1'); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready); await page.clock.runFor(100);
  await key(page, 'KeyM'); expect((await state(page)).muted).toBe(true);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('disabled'); }; });
  for (let i = 0; i < 25 && (await state(page)).status === 'playing'; i++) await page.clock.runFor(5000);
  const lost = await state(page); expect(lost.status).toBe('defeat'); expect(lost.lampHealth).toBe(0);
  await page.screenshot({ path: 'artifacts/phase4-defeat.png' });
  await page.clock.runFor(2600); expect((await state(page)).elapsed).toBe(lost.elapsed);
  expect(await page.evaluate(() => localStorage.getItem('last-light.campaign.v2'))).toBe(null);
  await expect(page.getByRole('heading', { name: '灯火熄灭，本局结束。' })).toBeVisible();
  await page.keyboard.press('Escape'); await key(page, 'Enter'); await page.clock.runFor(200); expect((await state(page)).status).toBe('defeat'); expect((await state(page)).lampHealth).toBe(0); expect(errors).toEqual([]);
  await page.goto('/?mode=night'); await page.clock.runFor(200); expect(await page.evaluate(() => '__nightLight' in window)).toBe(false);
});
