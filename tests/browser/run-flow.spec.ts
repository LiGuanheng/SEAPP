import { test, expect, type Page } from './fixtures.ts';

const state = (page: Page): Promise<any> => page.evaluate(() => ((window as any).__nightLight ?? (window as any).__baseLight ?? (window as any).__lastLight).snapshot());
async function key(page: Page, code: string) { await page.keyboard.down(code); await page.clock.runFor(40); await page.keyboard.up(code); await page.clock.runFor(40); }
async function click(page: Page, x: number, y: number) {
  const b = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(b.x + x / 1280 * b.width, b.y + y / 720 * b.height); await page.mouse.down(); await page.clock.runFor(40); await page.mouse.up(); await page.clock.runFor(40);
}
async function demo(page: Page) {
  await page.clock.install(); await page.goto('/?demo=1&test=1&intro=0'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100); await page.clock.runFor(1800);
}

test('灯塔在战场中心，缩放/回中仍居中；黑雾外不能施工', async ({ page }) => {
  await demo(page);
  const centered = (s: any) => { expect((768 - s.camera.x) * s.camera.zoom).toBeCloseTo(540, 0); expect((512 - s.camera.y) * s.camera.zoom).toBeCloseTo(345, 0); };
  centered(await state(page));
  await page.mouse.move(500, 400); for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 200); await page.clock.runFor(20); }
  expect((await state(page)).camera.zoom).toBe(0.5); centered(await state(page));
  const before = await state(page); await key(page, 'Digit2');
  const s = await state(page); await click(page, (1508 - s.camera.x) * s.camera.zoom, (640 - s.camera.y) * s.camera.zoom);
  expect((await state(page)).plan.buildings).toHaveLength(before.plan.buildings.length); expect((await state(page)).campaign.depot).toEqual(before.campaign.depot);
  await key(page, 'Escape'); await key(page, 'KeyD'); await key(page, 'KeyC'); centered(await state(page));
  await page.screenshot({ path: 'artifacts/v013-centered-battlefield.png' });
});

test('首夜胜利可跳过街区，直接扩建布防；30秒倒计时自动开启第二夜', async ({ page }) => {
  test.setTimeout(150000); await demo(page);
  const initial = await state(page); expect(initial.lightRadius).toBe(390);
  await page.clock.runFor(10500); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready);
  for (let i = 0; i < 28 && (await state(page)).status === 'playing'; i++) await page.clock.runFor(1600);
  expect((await state(page)).status).toBe('victory'); await page.clock.runFor(2600);
  await key(page, 'Enter'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  const next = await state(page); expect(next.plan.stage).toBe(2); expect(next.remaining).toBeGreaterThan(29); expect(next.lightRadius).toBe(530); expect(next.buildArea.width).toBeGreaterThan(initial.buildArea.width);
  expect(next.campaign.expeditions).toBe(initial.campaign.expeditions); expect(next.plan.buildings).toHaveLength(initial.plan.buildings.length); expect(next.campaign.depot.materials).toBe(initial.campaign.depot.materials + 24);
  await page.screenshot({ path: 'artifacts/v013-next-stage-preparation.png' });
  await page.clock.runFor(10500); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready);
  expect((await state(page)).stage).toBe(2); expect((await state(page)).status).toBe('playing');
});

test('演示局主动结束：暂停/取消/结算，真实提交名次，原营地保留且分榜', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem('last-light.campaign.v2', 'original-camp-sentinel'));
  await demo(page); await page.clock.runFor(18000);
  await page.getByRole('button', { name: '结束并结算', exact: true }).click();
  const paused = await state(page); await page.clock.runFor(2500); expect(await state(page)).toEqual(paused);
  await page.getByRole('button', { name: '继续游玩', exact: true }).click(); await page.clock.runFor(1000); expect((await state(page)).elapsed).toBeGreaterThan(paused.elapsed);
  await page.getByRole('button', { name: '结束并结算', exact: true }).click(); await page.getByRole('button', { name: '确认结束本局', exact: true }).click();
  await expect(page.getByRole('heading', { name: '本局已结算，灯火仍在。' })).toBeVisible(); await expect(page.locator('.online-note')).toContainText('课堂演示榜');
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('last-light.pending-score.v1')!).result);
  expect(result.outcome).toBe('retired'); expect(result.completed).toBe(false); expect(result.scope).toBe('demo'); expect(result.score).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: '结束并结算', exact: true })).toBeDisabled();
  const frozen = await state(page); await page.keyboard.press('Escape'); await key(page, 'Enter'); await page.clock.runFor(2000); expect(await state(page)).toEqual(frozen);
  expect(await page.evaluate(() => localStorage.getItem('last-light.campaign.v2'))).toBe('original-camp-sentinel');
  if (process.env.E2E_REAL_API) {
    await page.getByLabel('玩家昵称').fill('课堂主动结算');
    const response = page.waitForResponse(r => r.url().endsWith('/api/scores') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '提交成绩', exact: true }).click(); const r = await response; expect(r.status()).toBe(201); const body = await r.json(); expect(body.ranks.score).toBeGreaterThan(0); expect(body.ranks.speed).toBe(null);
    await expect(page.getByRole('status')).toContainText(`第 ${body.ranks.score} 名`);
    await page.getByRole('button', { name: '查看排行榜 →' }).click(); await expect(page.getByLabel('榜单范围')).toHaveValue('demo'); await expect(page.getByRole('cell', { name: '课堂主动结算', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '极速通关榜' })).toBeDisabled();
    await page.getByLabel('榜单范围').selectOption('clear'); await expect(page.getByRole('cell', { name: '课堂主动结算', exact: true })).toHaveCount(0);
  }
  await page.screenshot({ path: 'artifacts/v013-demo-settlement.png' });
});

test('街区死亡自动显示分数与榜单，Enter不能复活或回城', async ({ page }) => {
  test.setTimeout(120000); await page.clock.install(); await page.goto('/?test=1&intro=0'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready);
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
  for (let i = 0; i < 20 && (await state(page)).status === 'playing'; i++) await page.clock.runFor(4000);
  expect((await state(page)).status).toBe('defeat'); await page.clock.runFor(2500);
  await expect(page.getByRole('heading', { name: '灯火熄灭，本局结束。' })).toBeVisible(); await expect(page.locator('.online-note')).toContainText('挑战成绩榜');
  const dead = await state(page); await page.keyboard.press('Escape'); await key(page, 'Enter'); await page.clock.runFor(2000); expect(await state(page)).toEqual(dead);
  await page.screenshot({ path: 'artifacts/v013-city-death-result.png' });
});
