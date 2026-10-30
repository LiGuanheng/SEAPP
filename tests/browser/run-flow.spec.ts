import { test, expect, type Page } from './fixtures.ts';
import { BaseWorld } from '../../src/core/base-world.ts';
import { newCampaign, type Campaign } from '../../src/core/campaign.ts';
import { RankedRun } from '../../src/core/ranking.ts';

const state = (page: Page): Promise<any> => page.evaluate(() => ((window as any).__nightLight ?? (window as any).__baseLight ?? (window as any).__lastLight).snapshot());
async function key(page: Page, code: string) { await page.keyboard.down(code); await page.clock.runFor(40); await page.keyboard.up(code); await page.clock.runFor(40); }
async function click(page: Page, x: number, y: number) {
  const b = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(b.x + x / 1280 * b.width, b.y + y / 720 * b.height); await page.mouse.down(); await page.clock.runFor(40); await page.mouse.up(); await page.clock.runFor(40);
}
function camp(clearedStage = 0): Campaign {
  const c = newCampaign(); c.clearedStage = clearedStage; c.depot = { materials: 60, energy: 20, medkits: 2 };
  c.survivors = ['engineer', 'captain', 'medic']; c.weapons = ['pistol', 'rifle'];
  const b = new BaseWorld(c);
  for (const [kind, x, y] of [['turret', 1088, 544], ['arrowtower', 864, 832], ['arrowtower', 1120, 832], ['barricade', 1216, 832]] as const) {
    const result = b.build(kind, { x, y }, kind === 'barricade' ? 1 : 0); if (!result.ok) throw new Error(result.message);
  }
  return b.campaign;
}
async function prepared(page: Page, mode = 'base', clearedStage = 0) {
  await page.addInitScript(c => localStorage.setItem('last-light.campaign.v2', JSON.stringify(c)), camp(clearedStage));
  await page.clock.install(); await page.goto(`/?mode=${mode}&test=1&intro=0`); await page.waitForFunction(() => ((window as any).__baseLight ?? (window as any).__nightLight)?.snapshot().ready);
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100); await page.clock.runFor(1800);
}

test('主菜单提供难度、新游戏、背景、指南与排行榜，没有演示模式入口', async ({ page }) => {
  await page.route('**/api/leaderboard?**', route => route.fulfill({ json: { board: 'speed', difficulty: 'normal', scope: 'clear', scoreVersion: 3, entries: [] } }));
  await page.goto('/'); await expect(page.getByRole('main', { name: '主菜单' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/v014-main-menu.png' });
  await expect(page.getByRole('button', { name: '开始新游戏', exact: true })).toBeVisible();
  await page.getByLabel('游戏难度', { exact: true }).selectOption('hard'); await expect(page.getByLabel('游戏难度', { exact: true })).toHaveValue('hard');
  await expect(page.getByText('课堂演示', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: '游戏背景', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('dialog')).toContainText('灯'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '操作指南', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('dialog')).toContainText('探索'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '排行榜', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '开始新游戏', exact: true }).click(); await expect(page.getByRole('main', { name: '主菜单' })).toBeHidden();
  expect(new URL(page.url()).searchParams.get('difficulty')).toBe('hard'); await page.screenshot({ path: 'artifacts/v014-main-menu-start.png' });
});

test('灯塔视觉中心在整个战场正中，缩放/回中保持居中；黑雾外不能施工', async ({ page }) => {
  await prepared(page);
  const centered = (s: any) => { expect((1024 - s.camera.x) * s.camera.zoom).toBeCloseTo(640, 0); expect((672 - s.camera.y) * s.camera.zoom).toBeCloseTo(345, 0); };
  centered(await state(page));
  await page.mouse.move(500, 400); for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 200); await page.clock.runFor(20); }
  expect((await state(page)).camera.zoom).toBe(0.5); centered(await state(page));
  const before = await state(page); await key(page, 'Digit2'); const s = await state(page);
  await click(page, (1808 - s.camera.x) * s.camera.zoom, (832 - s.camera.y) * s.camera.zoom);
  expect((await state(page)).plan.buildings).toHaveLength(before.plan.buildings.length); expect((await state(page)).campaign.depot).toEqual(before.campaign.depot);
  await key(page, 'Escape'); await key(page, 'KeyD'); await key(page, 'KeyC'); centered(await state(page));
  await page.screenshot({ path: 'artifacts/v014-centered-battlefield.png' });
});

test('首夜胜利可跳过街区，直接扩建布防；手动完成后开启第二夜', async ({ page }) => {
  test.setTimeout(150000); await prepared(page, 'night'); await key(page, 'KeyT'); await key(page, 'KeyT');
  const initial = await state(page); expect(initial.lightRadius).toBe(480);
  for (let i = 0; i < 28 && (await state(page)).status === 'playing'; i++) await page.clock.runFor(1600);
  expect((await state(page)).status).toBe('victory'); await page.clock.runFor(2600);
  await key(page, 'Enter'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  const next = await state(page); expect(next.plan.stage).toBe(2); expect(next.plan.status).toBe('preparing'); expect(next.lightRadius).toBe(640); expect(next.buildArea.width).toBeGreaterThan(initial.buildArea.width);
  expect(next.campaign.expeditions).toBe(initial.campaign.expeditions); expect(next.plan.buildings).toHaveLength(initial.plan.buildings.length); expect(next.campaign.depot.materials).toBe(initial.campaign.depot.materials + 24);
  expect(next.ranking.phaseTimesMs.night).toBe(120000); expect(next.ranking.elapsedMs).toBeGreaterThanOrEqual(120000); expect(next.ranking.elapsedMs).toBe(next.ranking.phaseTimesMs.night + next.ranking.phaseTimesMs.base);
  await page.screenshot({ path: 'artifacts/v014-next-stage-preparation.png' });
  await key(page, 'KeyT'); await key(page, 'KeyT'); await page.clock.runFor(10500); expect((await state(page)).plan.status).toBe('preparing'); await key(page,'Enter'); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready);
  expect((await state(page)).stage).toBe(2); expect((await state(page)).status).toBe('playing'); expect((await state(page)).ranking.phaseTimesMs.base).toBeGreaterThan(10000);
});

test('主动结束：暂停/取消/结算，真实提交挑战名次，完整通关榜隔离', async ({ page }) => {
  test.setTimeout(120000); await prepared(page, 'night'); await page.clock.runFor(20000);
  await page.getByRole('button', { name: '结束并结算', exact: true }).click(); const paused = await state(page); await page.clock.runFor(2500); expect(await state(page)).toEqual(paused);
  await page.getByRole('button', { name: '继续游玩', exact: true }).click(); await page.clock.runFor(1000); expect((await state(page)).elapsed).toBeGreaterThan(paused.elapsed);
  await page.getByRole('button', { name: '结束并结算', exact: true }).click(); await page.getByRole('button', { name: '确认结束本局', exact: true }).click();
  await expect(page.getByRole('heading', { name: '本局已结算，灯火仍在。' })).toBeVisible(); await expect(page.locator('.online-note')).toContainText('挑战成绩榜');
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('last-light.pending-score.v1')!).result);
  expect(result.outcome).toBe('retired'); expect(result.completed).toBe(false); expect(result.scope).toBe('challenge'); expect(result.score).toBeGreaterThan(0);
  expect(result.phaseTimesMs.day).toBe(0); expect(result.phaseTimesMs.night).toBeGreaterThan(20000); expect(result.durationMs).toBe(result.phaseTimesMs.day + result.phaseTimesMs.base + result.phaseTimesMs.night); expect(result.totalDurationMs).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: '结束并结算', exact: true })).toBeDisabled();
  const frozen = await state(page); await page.keyboard.press('Escape'); await key(page, 'Enter'); await page.clock.runFor(2000); expect(await state(page)).toEqual(frozen);
  if (process.env.E2E_REAL_API) {
    await page.getByLabel('玩家昵称').fill('主动结算守灯人'); const response = page.waitForResponse(r => r.url().endsWith('/api/scores') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '提交成绩', exact: true }).click(); const r = await response; expect(r.status()).toBe(201); const body = await r.json(); expect(body.ranks.score).toBeGreaterThan(0); expect(body.ranks.speed).toBe(null);
    await expect(page.getByRole('status')).toContainText(`第 ${body.ranks.score} 名`);
    await page.getByRole('button', { name: '查看排行榜 →' }).click(); await expect(page.getByLabel('榜单范围')).toHaveValue('challenge'); await expect(page.getByRole('cell', { name: '主动结算守灯人', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '极速通关榜' })).toBeDisabled(); await page.getByLabel('榜单范围').selectOption('clear'); await expect(page.getByRole('cell', { name: '主动结算守灯人', exact: true })).toHaveCount(0);
  }
  await page.screenshot({ path: 'artifacts/v014-settlement.png' });
});

test('重新开始阶段丢弃本阶段施工与耗时，保留此前阶段进度', async ({ page }) => {
  await prepared(page, 'base', 2); const before = await state(page);
  await key(page, 'Digit2'); const p = await state(page); await click(page, (1216 - p.camera.x) * p.camera.zoom, (544 - p.camera.y) * p.camera.zoom); await key(page, 'Escape');
  expect((await state(page)).plan.buildings).toHaveLength(before.plan.buildings.length + 1); await page.clock.runFor(2000);
  await page.getByRole('button', { name: '重新开始阶段', exact: true }).click(); await expect(page.getByRole('heading', { name: '重新开始本阶段？' })).toBeVisible();
  await page.getByRole('button', { name: '确认重新开始本阶段', exact: true }).click(); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await page.clock.runFor(100);
  const restored = await state(page); expect(restored.plan.stage).toBe(3); expect(restored.campaign.clearedStage).toBe(2); expect(restored.plan.buildings).toHaveLength(before.plan.buildings.length); expect(restored.campaign.depot).toEqual(before.campaign.depot); expect(restored.plan.status).toBe('preparing'); expect(restored.ranking.elapsedMs).toBeLessThan(before.ranking.elapsedMs);
  await page.screenshot({ path: 'artifacts/v014-stage-restart.png' });
});

test('街区死亡自动显示分数与榜单，Enter不能复活或回城', async ({ page }) => {
  test.setTimeout(120000); await page.clock.install(); await page.goto('/?play=1&test=1&intro=0'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
  for (let i = 0; i < 20 && (await state(page)).status === 'playing'; i++) await page.clock.runFor(4000);
  expect((await state(page)).status).toBe('defeat'); await page.clock.runFor(2500); await expect(page.getByRole('heading', { name: '灯火熄灭，本局结束。' })).toBeVisible(); await expect(page.locator('.online-note')).toContainText('挑战成绩榜');
  const dead = await state(page); await page.keyboard.press('Escape'); await key(page, 'Enter'); await page.clock.runFor(2000); expect(await state(page)).toEqual(dead); await page.screenshot({ path: 'artifacts/v014-city-death-result.png' });
});

test('继续合法第四阶段存档，守住第五夜才完成五阶段通关并展示总成绩', async ({ page }) => {
  test.setTimeout(180000);
  // 构造公开存档格式的阶段起点；施工和此前成绩均经过真实模型校验，不写只读诊断接口。
  const campaign = newCampaign(); campaign.clearedStage = 4; campaign.depot = { materials: 1500, energy: 700, medkits: 2 };
  campaign.survivors = ['engineer', 'captain', 'ranger', 'brawler', 'guardian', 'gunner', 'medic']; campaign.weapons = ['pistol', 'rifle', 'axe', 'bow'];
  const base = new BaseWorld(campaign);
  for (let y = 192; y <= 1056 && base.plan.buildings.length < 64; y += 96) for (let x = 352; x <= 1344 && base.plan.buildings.length < 64; x += 96) {
    base.build(['turret', 'turret', 'cannon', 'sniper', 'repair'][base.plan.buildings.length % 5] as 'turret', { x, y });
  }
  expect(base.plan.buildings.length).toBeGreaterThanOrEqual(40);
  const run = new RankedRun('11111111-1111-4111-8111-111111111111', 'easy');
  for (const stage of [1, 2, 3, 4] as const) {
    run.update(true, (stage - 1) * 100000); run.advancePhase('day', 20); run.advancePhase('base', 30); run.advancePhase('night', 120);
    run.finishNight({ stage, outcome: 'victory', kills: 50, bossKills: 1, lampHealth: 300, soldiers: 8 }, stage * 100000);
  }
  expect(run.result).toBe(null);
  const checkpoint = { version: 1, stage: 5, phase: 'base', difficulty: 'easy', practice: false, campaign: base.campaign, run: run.checkpoint(400000) };
  await page.addInitScript(value => { localStorage.setItem('last-light.stage-checkpoint.v1', JSON.stringify(value)); localStorage.setItem('last-light.campaign.v2', JSON.stringify(value.campaign)); }, checkpoint);
  await page.clock.install(); await page.goto('/?test=1&intro=0'); await expect(page.getByRole('main', { name: '主菜单' })).toBeVisible(); await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
  await page.getByRole('button', { name: '继续游戏', exact: true }).click(); await page.clock.runFor(120); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  expect((await state(page)).plan.stage).toBe(5); expect((await state(page)).ranking.clearedStages).toBe(4);
  await key(page, 'KeyT'); await key(page, 'KeyT'); await page.clock.runFor(10500); expect((await state(page)).plan.status).toBe('preparing'); await key(page,'Enter'); await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready);
  await key(page, 'KeyT'); await key(page, 'KeyT');
  for (let i = 0; i < 28 && (await state(page)).status === 'playing'; i++) await page.clock.runFor(1600);
  expect((await state(page)).stage).toBe(5); expect((await state(page)).status).toBe('victory'); await page.clock.runFor(2600);
  await expect(page.getByRole('heading', { name: /灯火长明/ })).toBeVisible();
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('last-light.pending-score.v1')!).result);
  expect(result.completed).toBe(true); expect(result.outcome).toBe('victory'); expect(result.scope).toBe('clear'); expect(result.stages.map((s: any) => s.stage)).toEqual([1, 2, 3, 4, 5]);
  expect(result.phaseTimesMs.night).toBe(600000); expect(result.phaseTimesMs.base).toBeGreaterThan(130000); expect(result.durationMs).toBe(result.phaseTimesMs.day + result.phaseTimesMs.base + result.phaseTimesMs.night);
  await page.screenshot({ path: 'artifacts/v014-five-stage-victory.png' });
});
