import { test, expect, type Page } from './fixtures.ts';

type Snapshot = {
  status: string; elapsed: number; kills: number; paused: boolean;
  player: { x: number; y: number; ammo: number; health: number; reload: number; shots: number; stamina: number };
  zombies: { id: number; x: number; y: number; health: number }[];
  camera: { x: number; y: number };
  view: { particles: number; corpses: number; actors: number; bullets: number };
  objects: number;
};
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() => (window as any).__lastLight.snapshot());
async function ready(page: Page) {
  await page.clock.install(); await page.goto('/?mode=combat&test=1');
  await page.waitForFunction(() => Boolean((window as any).__lastLight?.snapshot().ready));
  await page.clock.runFor(150);
}
async function screenPoint(page: Page, x: number, y: number) {
  const box = (await page.locator('canvas').boundingBox())!;
  return { x: box.x + x / 1280 * box.width, y: box.y + y / 720 * box.height };
}
async function aimAt(page: Page, x: number, y: number) {
  const state = await snapshot(page), point = await screenPoint(page, x - state.camera.x, y - state.camera.y);
  await page.mouse.move(point.x, point.y);
}

test('直接出现真实像素场景，WASD/冲刺/瞄准射击可操作，实际命中并击杀', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#app')).toHaveCount(0);
  await expect(page.locator('#load-error')).toBeHidden();
  const before = await snapshot(page);
  await page.keyboard.down('KeyD'); await page.clock.runFor(400); await page.keyboard.up('KeyD');
  const moved = await snapshot(page); expect(moved.player.x).toBeGreaterThan(before.player.x + 45);
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyA'); await page.clock.runFor(300); await page.keyboard.up('KeyA'); await page.keyboard.up('ShiftLeft');
  expect((await snapshot(page)).player.stamina).toBeLessThan(100);
  await page.screenshot({ path: 'artifacts/phase1-city.png' });
  for (let i = 0; i < 18 && (await snapshot(page)).kills < 1; i++) {
    const state = await snapshot(page);
    const enemy = state.zombies.slice().sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y))[0];
    await aimAt(page, enemy.x, enemy.y - 16);
    await page.mouse.down(); await page.clock.runFor(100); await page.mouse.up();
  }
  const shot = await snapshot(page);
  expect(shot.kills).toBeGreaterThan(0); expect(shot.player.shots).toBeGreaterThan(0);
  expect(shot.view.corpses).toBeGreaterThan(0);
  await page.screenshot({ path: 'artifacts/phase1-combat.png' });
  expect(errors).toEqual([]);
});

test('暂停与失焦停止模拟，恢复后没有残留移动或自动开火，R 可换弹', async ({ page }) => {
  await ready(page);
  const state = await snapshot(page); await aimAt(page, state.player.x + 300, state.player.y - 16);
  await page.mouse.down(); await page.clock.runFor(300); await page.mouse.up();
  expect((await snapshot(page)).player.ammo).toBeLessThan(18);
  await page.keyboard.press('KeyR'); await page.clock.runFor(200);
  await page.keyboard.press('Escape'); await page.clock.runFor(50);
  const paused = await snapshot(page); expect(paused.paused).toBe(true);
  await page.clock.runFor(5000); expect(await snapshot(page)).toEqual(paused);
  await page.keyboard.press('Escape'); await page.clock.runFor(1200);
  expect((await snapshot(page)).player.ammo).toBe(18);
  await page.keyboard.down('KeyD'); await page.mouse.down(); await page.clock.runFor(150);
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.clock.runFor(100);
  expect((await snapshot(page)).paused).toBe(true);
  await page.keyboard.up('KeyD'); await page.mouse.up(); await page.keyboard.press('KeyP');
  const resumed = await snapshot(page); await page.clock.runFor(300);
  const after = await snapshot(page); expect(after.player.x).toBe(resumed.player.x); expect(after.player.shots).toBe(resumed.player.shots);
});

test('丧尸真实追击、攻击、失败与重试；持续运行无页面异常', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  const first = await snapshot(page);
  await page.clock.runFor(3500);
  const following = await snapshot(page);
  const target = following.zombies.find(z => z.id === first.zombies[0].id)!;
  expect(Math.hypot(target.x - first.player.x, target.y - first.player.y)).toBeLessThan(Math.hypot(first.zombies[0].x - first.player.x, first.zombies[0].y - first.player.y));
  for (let i = 0; i < 7 && (await snapshot(page)).status !== 'defeat'; i++) await page.clock.runFor(3000);
  expect((await snapshot(page)).status).toBe('defeat');
  const dead = await snapshot(page); await page.clock.runFor(1200); expect((await snapshot(page)).elapsed).toBe(dead.elapsed);
  await page.screenshot({ path: 'artifacts/phase1-defeat.png' });
  await page.keyboard.press('Enter'); await page.clock.runFor(200);
  const fresh = await snapshot(page); expect(fresh.status).toBe('playing'); expect(fresh.player.health).toBe(100); expect(fresh.kills).toBe(0);
  expect(fresh.view.corpses).toBe(0); expect(fresh.view.particles).toBe(0);
  await page.keyboard.down('KeyD'); await page.clock.runFor(300); await page.keyboard.up('KeyD');
  expect((await snapshot(page)).player.x).toBeGreaterThan(fresh.player.x + 35);
  expect(errors).toEqual([]);
});

test('窗口缩放后仍能瞄准射击，正常入口不暴露测试接口，旧存档不改变', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('last-light.save.v1', 'legacy-sentinel'));
  await ready(page); await page.setViewportSize({ width: 1024, height: 768 }); await page.clock.runFor(200);
  for (let i = 0; i < 16 && (await snapshot(page)).kills === 0; i++) {
    const state = await snapshot(page), enemy = state.zombies[0];
    await aimAt(page, enemy.x, enemy.y - 16);
    await page.mouse.down(); await page.clock.runFor(100); await page.mouse.up();
  }
  expect((await snapshot(page)).player.shots).toBeGreaterThan(0);
  expect((await snapshot(page)).kills).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem('last-light.save.v1'))).toBe('legacy-sentinel');
  await page.goto('/'); await page.clock.runFor(200);
  expect(await page.evaluate(() => '__lastLight' in window)).toBe(false);
});

test('素材缺失时出现清晰错误，避免静默黑屏', async ({ page }) => {
  await page.route('**/assets/characters/zombie.png', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#load-error')).toBeVisible();
  await expect(page.locator('#load-error')).toContainText('素材载入失败');
});

test('一分钟场景运行与多次重试，无控制台错误或对象累积', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await ready(page); const initial = await snapshot(page);
  for (let i = 0; i < 8; i++) {
    await page.clock.runFor(8000);
    const state = await snapshot(page);
    expect(state.zombies.length).toBeLessThanOrEqual(28);
    expect(state.view.particles).toBeLessThanOrEqual(220);
    expect(state.view.corpses).toBeLessThanOrEqual(36);
    expect(state.objects).toBeLessThan(initial.objects + 350);
    if (state.status === 'defeat') { await page.keyboard.press('Enter'); await page.clock.runFor(50); }
  }
  expect(errors).toEqual([]);
});
