import { test, expect } from './fixtures.ts';
import { campaignForStage } from '../../scripts/validate-balance.mjs';

for (const [difficulty, stage] of [['normal', 2], ['normal', 5], ['hard', 2]] as const) {
  test(`${difficulty}第${stage}夜：有限物资混合布防可守至黎明，浏览器无异常`, async ({ page }) => {
    test.setTimeout(180000);
    // 预置各阶段合法施工结果，不调整敌我血量，不通过诊断接口写入战斗状态。
    const campaign = campaignForStage(stage, difficulty);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(c => localStorage.setItem('last-light.campaign.v2', JSON.stringify(c)), campaign);
    await page.clock.install(); await page.goto(`/?mode=night&difficulty=${difficulty}&test=1&intro=0`);
    await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready);
    await page.clock.runFor(1800);
    for (const key of ['Space', 'KeyT', 'KeyT']) { await page.keyboard.press(key); await page.clock.runFor(60); }
    const snapshot = () => page.evaluate(() => (window as any).__nightLight.snapshot());
    for (let i = 0; i < 45 && (await snapshot()).status === 'playing'; i++) await page.clock.runFor(1600);
    const result = await snapshot();
    expect(result.stage).toBe(stage); expect(result.difficulty).toBe(difficulty);
    expect(result.status).toBe('victory'); expect(result.elapsed).toBe(120);
    expect(result.lampHealth).toBeGreaterThan(0); expect(result.bossesSeen.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `artifacts/balance-${difficulty}-stage-${stage}.png` });
  });
}
