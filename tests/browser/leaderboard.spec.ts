import { test, expect } from './fixtures.ts';
import { calculateScore, GAME_VERSION, SCORE_VERSION, type StageScore } from '../../src/core/scoring.ts';

const stages: StageScore[] = ([1, 2, 3] as const).map(stage => ({ stage, kills: stage * 50, bossKills: 1, lampHealth: 300, soldiers: 3 }));
const result = { runId: '12345678-1234-4123-8123-123456789012', difficulty: 'normal', completed: true, durationMs: 480000, score: calculateScore(stages, 480000).total, maxSpeed: 3, stages, scoreVersion: SCORE_VERSION, gameVersion: GAME_VERSION };

test('随时看榜、空/失败/加载反馈、难度筛选，关闭保留原暂停状态，小窗口可用', async ({ page }) => {
  let fail = false;
  await page.route('**/api/leaderboard?**', async route => {
    if (fail) return route.abort();
    await route.fulfill({ json: { board: 'speed', difficulty: 'normal', scoreVersion: 1, entries: [] } });
  });
  await page.goto('/?test=1'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready);
  const pausedBefore = await page.evaluate(() => (window as any).__lastLight.snapshot().paused);
  await page.getByRole('button', { name: '排行榜', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('档案尚空');
  expect(await page.evaluate(() => (window as any).__lastLight.snapshot().paused)).toBe(true);
  await page.getByLabel('游戏难度').selectOption('hard'); await page.getByRole('button', { name: '综合得分榜', exact: true }).click();
  await expect(page.getByRole('button', { name: '综合得分榜' })).toHaveAttribute('aria-pressed', 'true');
  fail = true; await page.getByRole('button', { name: '刷新榜单' }).click(); await expect(page.getByRole('status')).toContainText('连接失败');
  await page.keyboard.press('Escape'); expect(await page.evaluate(() => (window as any).__lastLight.snapshot().paused)).toBe(pausedBefore);
  await page.keyboard.press('Space'); await expect(page.getByRole('dialog')).toBeHidden();
  if (!pausedBefore) await page.keyboard.press('KeyP');
  await page.getByRole('button', { name: '排行榜', exact: true }).click(); await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as any).__lastLight.snapshot().paused)).toBe(true);
  await page.getByRole('button', { name: '排行榜', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'artifacts/leaderboard-mobile.png' });
  expect(await page.locator('.online-dialog').evaluate(e => e.scrollWidth <= e.clientWidth + 2)).toBe(true);
  await page.keyboard.press('Escape');
});

test('结算得分构成、昵称校验、首次失败安全重试、成功结果及本地昵称恢复', async ({ page }) => {
  await page.addInitScript(value => { localStorage.setItem('last-light.pending-score.v1', JSON.stringify({ result: value })); localStorage.setItem('last-light.nickname.v1', '旧昵称'); }, result);
  const sent: unknown[] = [];
  await page.route('**/api/scores', async route => {
    sent.push(route.request().postDataJSON());
    if (sent.length === 1) return route.abort();
    await route.fulfill({ status: 200, json: { entry: { id: result.runId }, duplicate: true } });
  });
  await page.goto('/?test=1'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready);
  await page.getByRole('button', { name: '通关成绩', exact: true }).click();
  await expect(page.getByText('三夜已尽，灯火长明。')).toBeVisible(); await expect(page.getByLabel('玩家昵称')).toHaveValue('旧昵称');
  await page.getByLabel('玩家昵称').fill(''); await page.getByLabel('玩家昵称').focus(); await page.keyboard.type('Keeper02'); await expect(page.getByLabel('玩家昵称')).toHaveValue('Keeper02');
  await page.getByLabel('玩家昵称').fill('<bad>'); await page.getByRole('button', { name: '提交成绩', exact: true }).click(); await expect(page.getByRole('status')).toContainText('昵称需'); expect(sent).toHaveLength(0);
  await page.getByLabel('玩家昵称').fill('北境守灯人'); await page.getByRole('button', { name: '提交成绩', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('连接失败'); await expect(page.getByLabel('玩家昵称')).toBeDisabled();
  await page.getByRole('button', { name: '重试提交', exact: true }).click(); await expect(page.getByRole('status')).toContainText('成绩已收录');
  expect(sent).toHaveLength(2); expect(sent[0]).toEqual(sent[1]); expect(await page.evaluate(() => localStorage.getItem('last-light.nickname.v1'))).toBe('北境守灯人');
  await expect(page.getByRole('button', { name: '已提交 ✓' })).toBeDisabled(); await page.screenshot({ path: 'artifacts/leaderboard-result.png' });
});

test('榜单文本安全显示、不执行恶意昵称；排名战役不读取或覆盖原营地', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, expeditions: 99, depot: { materials: 999, energy: 99, medkits: 0 }, survivors: [], weapons: ['pistol'], lastSummary: null, base: null })));
  await page.route('**/api/leaderboard?**', route => route.fulfill({ json: { board: 'speed', difficulty: 'normal', scoreVersion: 1, entries: Array.from({ length: 20 }, (_, i) => ({ id: String(i), nickname: i === 0 ? '<img src=x onerror=alert(1)>' : `守灯人 ${i + 1}`, difficulty: 'normal', durationMs: 480000 + i * 1000, score: 18022 - i * 10, maxSpeed: 3, submittedAt: '2026-10-26T00:00:00Z' })) } }));
  await page.goto('/?ranked=1&test=1&intro=0'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready);
  expect(await page.evaluate(() => (window as any).__lastLight.snapshot().expedition.campaign.expeditions)).toBe(0);
  await page.getByRole('button', { name: '排行榜', exact: true }).click(); await expect(page.getByRole('cell', { name: '<img src=x onerror=alert(1)>' })).toBeVisible(); expect(await page.locator('.online-dialog img').count()).toBe(0);
  await page.screenshot({ path: 'artifacts/leaderboard-desktop.png' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('last-light.campaign.v2')!).expeditions)).toBe(99);
});

test('浏览器fetch真实API写入PostgreSQL并刷新榜单（显式本地环境）', async ({ page }) => {
  test.skip(!process.env.E2E_REAL_API, '用 test-with-local-postgres.mjs --e2e 启动真实数据库和API');
  await page.addInitScript(value => localStorage.setItem('last-light.pending-score.v1', JSON.stringify({ result: value })), { ...result, runId: crypto.randomUUID(), durationMs: 240000, score: calculateScore(stages, 240000).total });
  await page.goto('/?test=1'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready);
  await page.getByRole('button', { name: '通关成绩', exact: true }).click(); await page.getByLabel('玩家昵称').fill('浏览器联调');
  const saved = page.waitForResponse(r => r.url().endsWith('/api/scores') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '提交成绩', exact: true }).click(); expect((await saved).status()).toBe(201);
  await expect(page.getByRole('status')).toContainText('成绩已收录');
  await page.getByRole('button', { name: '查看排行榜 →' }).click(); await page.getByRole('button', { name: '综合得分榜' }).click();
  await expect(page.getByRole('cell', { name: '浏览器联调', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/leaderboard-live.png' });
});

test('排名活动时钟在真实场景中排除暂停、指南、榜单等待，重载开始新战役', async ({ page }) => {
  await page.route('**/api/leaderboard?**', route => route.fulfill({ json: { entries: [], scoreVersion: 1 } }));
  await page.clock.install(); await page.goto('/?ranked=1&test=1'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready);
  const snapshot = () => page.evaluate(() => (window as any).__lastLight.snapshot());
  if ((await snapshot()).paused) await page.keyboard.press('KeyP');
  await page.clock.runFor(2000); const active = (await snapshot()).ranking.elapsedMs; expect(active).toBeGreaterThanOrEqual(1900);
  await page.keyboard.press('KeyP'); const paused = (await snapshot()).ranking.elapsedMs; await page.clock.runFor(5000); expect((await snapshot()).ranking.elapsedMs).toBe(paused);
  await page.keyboard.press('KeyP'); await page.clock.runFor(1000); expect((await snapshot()).ranking.elapsedMs).toBeGreaterThanOrEqual(paused + 990);
  await page.keyboard.press('F1'); const guide = (await snapshot()).ranking.elapsedMs; await page.clock.runFor(4000); expect((await snapshot()).ranking.elapsedMs).toBe(guide); await page.keyboard.press('F1');
  await page.getByRole('button', { name: '排行榜', exact: true }).click(); const menu = (await snapshot()).ranking.elapsedMs; await page.clock.runFor(5000); expect((await snapshot()).ranking.elapsedMs).toBe(menu);
  await page.keyboard.press('Escape'); await page.clock.runFor(1000); expect((await snapshot()).ranking.elapsedMs).toBeGreaterThanOrEqual(menu + 990);
  await page.reload(); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); expect((await snapshot()).ranking.elapsedMs).toBeLessThan(1000);
});
