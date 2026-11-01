import { test, expect, type Page } from './fixtures.ts';
import { hardFixture } from '../../scripts/validate-hard.mjs';
const state = (p: Page): Promise<any> => p.evaluate(() => (window as any).__nightLight?.snapshot() ?? (window as any).__baseLight?.snapshot());

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
  // 暂停已清除爆炸震屏；战斗中真实相机允许有瞬时震动偏移。
  expect((1024 - paused.camera.x) * paused.camera.zoom).toBeCloseTo(640, 0); expect((672 - paused.camera.y) * paused.camera.zoom).toBeCloseTo(345, 0); expect(errors).toEqual([]);
});
