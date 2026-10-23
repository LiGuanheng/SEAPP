import { test, expect } from '@playwright/test';
import { createGame } from '../../src/game/engine.ts';

test('探索救援、建塔、小队、战斗暂停和刷新恢复形成真实操作闭环', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '长夜将至，灯火不熄。' })).toBeVisible();
  await page.locator('[data-action="explore"][data-value="ruins"]').click();
  await expect(page.locator('#camp')).toContainText('林岚');
  await expect(page.locator('#camp')).toContainText('燃烧瓶');
  await expect(page.locator('[data-action="explore"]').first()).toBeDisabled();
  await page.getByRole('button', { name: '在 04 号点建造哨戒塔', exact: true }).click();
  await expect(page.locator('#tower-count')).toHaveText('1 / 12');
  await page.locator('[data-action="squad"][data-value="0"]').click();
  await expect(page.locator('#population-value')).toHaveText('5');
  await page.getByRole('button', { name: '迎接黑夜' }).click();
  await page.clock.runFor(2100);
  await expect(page.locator('#mission')).toContainText('在场感染者');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const pausedEnergy = await page.locator('#energy-value').textContent();
  const pausedStatistics = await page.locator('.night-stats').textContent();
  await page.clock.runFor(5000);
  await expect(page.locator('#energy-value')).toHaveText(pausedEnergy!);
  await expect(page.locator('.night-stats')).toHaveText(pausedStatistics!);
  await page.reload();
  await expect(page.getByRole('button', { name: '继续守夜' })).toBeVisible();
  await expect(page.locator('#tower-count')).toHaveText('1 / 12');
  await expect(page.locator('#camp')).toContainText('林岚');
  await page.screenshot({ path: 'artifacts/paused-battle.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('弹窗暂停、音量设置持久化，重新开始必须明确确认', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: '迎接黑夜' }).click();
  await page.clock.runFor(1200);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const previous = await page.locator('.night-stats').textContent();
  await page.clock.runFor(5000);
  await expect(page.locator('.night-stats')).toHaveText(previous!);
  await page.locator('#volume').fill('67');
  await expect(page.locator('#volume-label')).toHaveText('67%');
  await page.getByRole('button', { name: '保存并返回' }).click();
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await page.getByRole('button', { name: '继续当前游戏' }).click();
  await expect(page.locator('#mission')).toContainText('夜间防守');
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await page.getByRole('button', { name: '确认重新开始' }).click();
  await expect(page.locator('#mission')).toContainText('白昼行动');
  await expect(page.locator('#materials-value')).toHaveText('100');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.locator('#volume')).toHaveValue('67');
});

test('损坏存档给出提示，存储被禁用仍可探索与建设', async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem('last-light.save.v1', '{invalid'));
  await page.goto('/');
  await expect(page.locator('#toast')).toContainText('存档');
  await expect(page.getByRole('button', { name: '迎接黑夜' })).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); };
  });
  await page.locator('[data-action="explore"][data-value="ruins"]').click();
  await expect(page.locator('#save-status')).toContainText('仅本次有效');
  await page.getByRole('button', { name: '在 04 号点建造哨戒塔', exact: true }).click();
  await expect(page.locator('#tower-count')).toHaveText('1 / 12');
});

test('桌面初始界面完整，390px 窄屏无横向溢出且可部署', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: 'artifacts/outpost-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '迎接黑夜' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '在 04 号点建造哨戒塔', exact: true }).click();
  await expect(page.locator('#tower-count')).toHaveText('1 / 12');
  await page.screenshot({ path: 'artifacts/outpost-mobile.png', fullPage: true });
});

test('真实界面守过第一夜，选择强化后进入第二天并呈现夜战', async ({ page, context }) => {
  test.setTimeout(60000);
  const initial = createGame(2026);
  await context.addInitScript(state => {
    if (!localStorage.getItem('last-light.save.v1')) localStorage.setItem('last-light.save.v1', JSON.stringify({ version: 1, state, settings: { muted: true, volume: 0.35 } }));
  }, initial);
  await page.clock.install();
  await page.goto('/');
  await page.locator('[data-action="explore"][data-value="warehouse"]').click();
  for (const id of ['04', '06', '07']) await page.getByRole('button', { name: `在 ${id} 号点建造哨戒塔`, exact: true }).click();
  await page.locator('[data-action="squad"][data-value="0"]').click();
  await page.getByRole('button', { name: '迎接黑夜' }).click();
  await page.getByRole('button', { name: '切换战斗速度' }).click();
  await page.clock.runFor(3500);
  await expect(page.locator('#mission')).toContainText('夜间防守');
  await page.screenshot({ path: 'artifacts/night-battle.png', fullPage: true });
  await page.locator('[data-action="weapon"][data-value="molotov"]').click();
  await expect(page.locator('#camp')).toContainText('×0');
  await page.clock.runFor(20000);
  await expect(page.locator('#mission')).toContainText('黎明奖励');
  await page.locator('[data-action="upgrade"]').first().click();
  await expect(page.locator('.campaign-day strong')).toHaveText('02');
  await expect(page.locator('[data-action="explore"]').first()).toBeEnabled();
});

test('战斗数字刷新保留技能按钮焦点，按下到松开的点击不中断', async ({ page }) => {
  await page.clock.install(); await page.goto('/');
  await page.getByRole('button', { name: '迎接黑夜' }).click();
  await page.clock.runFor(1500);
  const pulse = page.locator('[data-action="pulse"]');
  await pulse.focus();
  await page.clock.runFor(1100);
  await expect(pulse).toBeFocused();
  const box = await pulse.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.clock.runFor(1100);
  await page.mouse.up();
  await expect(pulse).toContainText('脉冲充能');
});

test('能源显示不向上取整，避免看似够用但无法释放技能', async ({ page, context }) => {
  const initial = createGame(2); initial.energy = 11.99;
  await context.addInitScript(state => localStorage.setItem('last-light.save.v1', JSON.stringify({ version: 1, state })), initial);
  await page.goto('/');
  await expect(page.locator('#energy-value')).toHaveText('11');
});
