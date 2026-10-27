import { test, expect, type Page } from './fixtures.ts';
import { siegeFixture } from '../../scripts/validate-siege.mjs';
const state = (p: Page): Promise<any> => p.evaluate(() => (window as any).__nightLight.snapshot());
const presentation = (p: Page): Promise<any> => p.evaluate(() => (window as any).__nightLight.presentation());
async function key(p: Page, code: string) { await p.keyboard.press(code); await p.clock.runFor(60); }

test('入夜演出不随三倍速加速，暂停失焦冻结、跳过和减少动态不改变存档/操控', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install(); await page.goto('/?mode=night&test=1'); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready);
  await key(page, 'KeyT'); await key(page, 'KeyT'); await page.clock.runFor(400);
  expect((await state(page)).speed).toBe(3); expect((await presentation(page)).progress).toBeLessThan(0.35);
  await key(page, 'KeyP'); const paused = await state(page), frame = await presentation(page);
  await page.clock.runFor(1600); expect(await state(page)).toEqual(paused); expect(await presentation(page)).toEqual(frame);
  await key(page, 'KeyP'); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.clock.runFor(100);
  expect((await state(page)).paused).toBe(true); await key(page, 'KeyP');
  await key(page, 'KeyV'); expect((await presentation(page)).reduced).toBe(true);
  await key(page, 'Space'); expect((await presentation(page)).active).toBe(false); expect((await state(page)).selected).toHaveLength(3);
  expect((await state(page)).camera.zoom).toBe(0.9); expect(await page.evaluate(() => localStorage.getItem('last-light.campaign.v2'))).toBe(null);
  await page.reload(); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready);
  expect((await presentation(page)).reduced).toBe(true); expect((await state(page)).speed).toBe(1); expect(errors).toEqual([]);
});

test('真实第三阶段四向成群进攻、Boss演出与黎明，终局模型冻结而表现独立结束', async ({ page }) => {
  test.setTimeout(180000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(c => localStorage.setItem('last-light.campaign.v2', JSON.stringify(c)), siegeFixture('encirclement'));
  await page.clock.install(); await page.goto('/?mode=night&test=1'); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready);
  await page.clock.runFor(1100); await page.screenshot({ path: 'artifacts/v011/night-cinematic.png' });
  await key(page, 'Space'); await page.mouse.move(700, 360); for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 200);
  await key(page, 'KeyT'); await key(page, 'KeyT');
  let four = false, peak = 0, boss = false;
  for (let i = 0; i < 90 && (await state(page)).status === 'playing'; i++) {
    await page.clock.runFor(500); const s = await state(page); peak = Math.max(peak, s.enemies.length);
    if (s.pressure.filter((n: number) => n >= 3).length === 4 && s.enemies.length >= 50 && !four) {
      expect(new Set(s.enemies.map((e: any) => e.gate).filter((g: any) => g !== undefined)).size).toBe(4);
      await page.screenshot({ path: 'artifacts/v011/four-way-siege.png' }); four = true;
    }
    if ((await presentation(page)).kind === 'boss' && (await presentation(page)).active && !boss) { await page.screenshot({ path: 'artifacts/v011/boss-arrival.png' }); boss = true; }
    expect(s.enemies.length).toBeLessThanOrEqual(96); expect(s.view.particles).toBeLessThanOrEqual(200);
  }
  const end = await state(page); expect(end.status).toBe('victory'); expect(four).toBe(true); expect(boss).toBe(true); expect(peak).toBeGreaterThan(65);
  await page.clock.runFor(600); await page.screenshot({ path: 'artifacts/v011/dawn-light.png' });
  await page.clock.runFor(2600); const settled = await state(page);
  expect(settled.summary).toEqual(end.summary); expect(settled.enemies).toEqual(end.enemies); expect((await presentation(page)).active).toBe(false);
  await page.screenshot({ path: 'artifacts/v011/dawn-result.png' }); await key(page, 'Enter');
  await expect(page.getByRole('dialog')).toBeVisible(); expect((await state(page)).status).toBe('victory'); expect((await state(page)).elapsed).toBe(120); expect(errors).toEqual([]);
});
