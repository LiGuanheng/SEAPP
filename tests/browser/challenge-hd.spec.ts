import { test, expect, type Page } from './fixtures.ts';
import { BaseWorld } from '../../src/core/base-world.ts';
import { newCampaign } from '../../src/core/campaign.ts';
import { hardFixture } from '../../scripts/validate-hard.mjs';
const state = (p: Page): Promise<any> => p.evaluate(() => (window as any).__nightLight?.snapshot() ?? (window as any).__baseLight?.snapshot());
async function click(p: Page, x: number, y: number) { const b = (await p.locator('canvas').boundingBox())!; await p.mouse.click(b.x + x / 1280 * b.width, b.y + y / 720 * b.height); await p.clock.runFor(100); }

test('默认1440p高清，720p/1440p/4K可从菜单真实切换，布防按钮/建造/暂停命中保持准确', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const c = newCampaign(); c.depot = { materials: 40, energy: 12, medkits: 0 };
  await page.addInitScript(c => { if (!localStorage.getItem('last-light.campaign.v2')) localStorage.setItem('last-light.campaign.v2', JSON.stringify(c)); }, new BaseWorld(c).campaign);
  await page.clock.install(); await page.goto('/?test=1'); await page.getByRole('main', { name: '主菜单' }).waitFor();
  expect(await page.locator('canvas').evaluate(c => (c as HTMLCanvasElement).width)).toBe(2560);
  await page.getByLabel('游戏难度', { exact: true }).selectOption('hard');
  const load = page.waitForEvent('load'); await page.getByLabel('画面清晰度').selectOption('standard'); await load;
  await page.getByRole('main', { name: '主菜单' }).waitFor(); expect(await page.locator('canvas').evaluate(c => (c as HTMLCanvasElement).width)).toBe(1280);
  await expect(page.getByLabel('游戏难度', { exact: true })).toHaveValue('hard');
  await page.getByRole('button', { name: '继续游戏', exact: true }).click(); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  await page.keyboard.press('Space'); await page.clock.runFor(100); await page.keyboard.press('Digit2');
  const s = await state(page); await click(page, (1220 - s.camera.x) * s.camera.zoom, (548 - s.camera.y) * s.camera.zoom);
  expect((await state(page)).plan.buildings).toHaveLength(1); await click(page, 1198, 27); expect((await state(page)).paused).toBe(true);
  await page.getByRole('button', { name: '主菜单', exact: true }).click(); await page.getByRole('button', { name: '确认返回主菜单', exact: true }).click(); await page.clock.runFor(100); await page.getByRole('main', { name: '主菜单' }).waitFor();
  const high = page.waitForEvent('load'); await page.getByLabel('画面清晰度').selectOption('high'); await high;
  await page.getByRole('main', { name: '主菜单' }).waitFor(); expect(await page.locator('canvas').evaluate(c => (c as HTMLCanvasElement).height)).toBe(1440);
  await page.screenshot({ path: 'artifacts/v017-hd-menu.png', fullPage: true });
  const ultra = page.waitForEvent('load'); await page.getByLabel('画面清晰度').selectOption('ultra'); await ultra;
  await page.getByRole('main', { name: '主菜单' }).waitFor(); expect(await page.locator('canvas').evaluate(c => (c as HTMLCanvasElement).width)).toBe(3840);
  await page.getByRole('button', { name: '继续游戏', exact: true }).click(); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  await page.keyboard.press('Space'); await page.clock.runFor(100); const u = await state(page);
  expect((1024 - u.camera.x) * u.camera.zoom).toBeCloseTo(640, 0);
  await page.keyboard.press('Digit2'); await click(page, (1220 - u.camera.x) * u.camera.zoom, (548 - u.camera.y) * u.camera.zoom);
  expect((await state(page)).plan.buildings).toHaveLength(1); await page.keyboard.press('Escape'); await page.clock.runFor(100); await page.screenshot({ path: 'artifacts/v017-4k-preparation.png' }); expect(errors).toEqual([]);
});

test('高清困难第五夜真实多向尸潮与技能，保持实体上限、暂停和居中', async ({ page }) => {
  test.setTimeout(180000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(c => localStorage.setItem('last-light.campaign.v2', JSON.stringify(c)), hardFixture('balanced'));
  await page.clock.install(); await page.goto('/?mode=night&difficulty=hard&test=1'); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready);
  await page.keyboard.press('Space'); await page.keyboard.press('KeyT'); await page.keyboard.press('KeyT'); await page.clock.runFor(100);
  let peak = 0, captured = false;
  for (let i = 0; i < 48 && (await state(page)).status === 'playing'; i++) {
    await page.clock.runFor(500); const s = await state(page); peak = Math.max(peak, s.enemies.length); expect(s.enemies.length).toBeLessThanOrEqual(96);
    if (s.skillCasts > 0 && !captured) { await page.screenshot({ path: 'artifacts/v017-hard-raid.png' }); captured = true; }
  }
  const s = await state(page); expect(s.difficulty).toBe('hard'); expect(peak).toBeGreaterThan(50); expect(s.skillCasts).toBeGreaterThan(0);
  await page.keyboard.press('KeyP'); await page.clock.runFor(50); const paused = await state(page); await page.clock.runFor(1500); expect(await state(page)).toEqual(paused);
  expect((1024 - s.camera.x) * s.camera.zoom).toBeCloseTo(640, 0); expect((672 - s.camera.y) * s.camera.zoom).toBeCloseTo(345, 0); expect(errors).toEqual([]);
});
