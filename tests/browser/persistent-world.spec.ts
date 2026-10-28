import { test, expect, type Page } from './fixtures.ts';
import { newCampaign } from '../../src/core/campaign.ts';
import { BaseWorld } from '../../src/core/base-world.ts';
import { SURVIVOR_PROFILES, HERO_IDS } from '../../src/config/survivors.ts';
import { Navigation } from '../../src/core/navigation.ts';

const state = (p: Page): Promise<any> => p.evaluate(() => ((window as any).__nightLight ?? (window as any).__baseLight ?? (window as any).__lastLight).snapshot());
async function key(p: Page, k: string) { await p.keyboard.down(k); await p.clock.runFor(50); await p.keyboard.up(k); await p.clock.runFor(50); }
async function click(p: Page, x: number, y: number) { const b = (await p.locator('canvas').boundingBox())!; await p.mouse.click(b.x + x / 1280 * b.width, b.y + y / 720 * b.height); await p.clock.runFor(80); }
async function walk(p: Page, goal: { x: number; y: number }) {
  const s = await state(p), nav = new Navigation(2048, 1408, 32, s.expedition.layout.obstacles, 12); nav.rebuild(goal);
  for (let i = 0; i < 350; i++) {
    const s = await state(p), at = s.player; if (Math.hypot(at.x - goal.x, at.y - goal.y) < 25) return;
    const d = nav.direction(at, goal), keys = [Math.abs(d.x) > .1 ? d.x > 0 ? 'KeyD' : 'KeyA' : '', Math.abs(d.y) > .1 ? d.y > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
    for (const k of keys) await p.keyboard.down(k); await p.clock.runFor(100); for (const k of keys) await p.keyboard.up(k);
  }
  throw new Error('未能沿真实地图到达搜救目标');
}

test('旧箱耗尽与已救NPC由存档真实呈现，空手返营后转入另一片不同建筑的街区', async ({ page }) => {
  const c = newCampaign(); c.expeditions = 2; c.survivors = ['engineer']; c.weapons.push('rifle'); c.exploration = { version: 1, seed: 13579, visits: [1, 1, 0, 0, 0, 0], looted: [['salvage'], [], [], [], [], []], lastDistrict: 1 };
  await page.addInitScript(c => localStorage.setItem('last-light.campaign.v2', JSON.stringify(c)), c);
  await page.clock.install(); await page.goto('/?play=1&test=1&intro=0'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
  const first = await state(page); expect(first.expedition.district).toBe(0); expect(first.expedition.caches[0].depleted).toBe(true); expect(first.expedition.survivors.some((s: any) => s.id === 'engineer')).toBe(false); expect(first.ownedWeapons).toContain('rifle');
  await walk(page, first.expedition.caches[0]); await key(page, 'KeyE'); expect((await state(page)).expedition.inventory.materials).toBe(0); await page.screenshot({ path: 'artifacts/v015-depleted-city.png' });
  await walk(page, { x: 920, y: 760 }); await key(page, 'KeyE'); expect((await state(page)).status).toBe('complete'); await key(page, 'Enter'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await click(page, 1198, 70); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready);
  const next = await state(page); expect(next.expedition.district).toBe(1); expect(next.expedition.layout.buildings).not.toEqual(first.expedition.layout.buildings); expect(next.expedition.survivors.some((s: any) => s.id === 'engineer')).toBe(false); await page.screenshot({ path: 'artifacts/v015-new-district.png' });
});

test('四英雄独立形象、防空塔实际施工、铁甲巨尸实际刷新，无缺图或动画错误', async ({ page }) => {
  test.setTimeout(150000); const c = newCampaign(); c.clearedStage = 4; c.survivors = Object.keys(SURVIVOR_PROFILES); c.depot = { materials: 100, energy: 40, medkits: 0 };
  const b = new BaseWorld(c); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('3000')) errors.push(m.text()); });
  await page.addInitScript(c => localStorage.setItem('last-light.campaign.v2', JSON.stringify(c)), b.campaign); await page.clock.install(); await page.goto('/?mode=base&test=1&difficulty=easy'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100); await page.clock.runFor(1800);
  const s = await state(page); for (const id of HERO_IDS) expect(s.plan.soldiers.filter((x: any) => x.role === id)).toHaveLength(1);
  await key(page, 'Digit0'); const current = await state(page); expect(current.placement).toBe('antiair'); await click(page, (964 - current.camera.x) * current.camera.zoom, (356 - current.camera.y) * current.camera.zoom); expect((await state(page)).plan.buildings[0].kind).toBe('antiair'); await key(page, 'Escape');
  await page.screenshot({ path: 'artifacts/v015-four-heroes.png' });
  // 用公开施工操作补齐地面防线，让本例验证防空/重甲刷新，而非故意用纯防空塔守第五关。
  for (const [x, y] of [[832,352],[608,352],[608,640],[864,640],[1056,640],[832,800]]) { await key(page, 'Digit2'); const v = await state(page); await click(page, (x + 4 - v.camera.x) * v.camera.zoom, (y + 4 - v.camera.y) * v.camera.zoom); await key(page, 'Escape'); }
  await key(page, 'Enter'); await key(page, 'KeyN'); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready); await key(page, 'KeyT'); await key(page, 'KeyT');
  let tank = false; for (let i = 0; i < 35 && (await state(page)).status === 'playing'; i++) { await page.clock.runFor(500); tank ||= (await state(page)).enemies.some((e: any) => e.kind === 'tank'); if (tank) break; }
  expect(tank).toBe(true); await page.screenshot({ path: 'artifacts/v015-tank-night.png' }); expect(errors).toEqual([]);
});
