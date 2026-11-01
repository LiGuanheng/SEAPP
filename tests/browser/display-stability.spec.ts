import { test, expect, type Page } from './fixtures.ts';
import { newCampaign } from '../../src/core/campaign.ts';
import { Navigation } from '../../src/core/navigation.ts';

const state = (page: Page): Promise<any> => page.evaluate(() => ((window as any).__lastLight ?? (window as any).__baseLight ?? (window as any).__nightLight).snapshot());
async function key(page: Page, code: string) { await page.keyboard.press(code); await page.clock.runFor(100); }
async function click(page: Page, x: number, y: number) {
  const b = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(b.x + x / 1280 * b.width, b.y + y / 720 * b.height); await page.clock.runFor(100);
}
async function coloredPixels(page: Page, rect: { x: number; y: number; width: number; height: number }, rgb: number[]) {
  const b = (await page.locator('canvas').boundingBox())!;
  const png = await page.screenshot({ clip: { x: b.x + rect.x / 1280 * b.width, y: b.y + rect.y / 720 * b.height, width: rect.width / 1280 * b.width, height: rect.height / 720 * b.height } });
  return page.evaluate(async ({ png, rgb }) => {
    const image = new Image(); image.src = 'data:image/png;base64,' + png; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data; let count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (rgb.every((c, k) => Math.abs(pixels[i + k] - c) < 15)) count++;
    return count;
  }, { png: png.toString('base64'), rgb });
}
async function walk(page: Page, goal: { x: number; y: number }) {
  const initial = await state(page), nav = new Navigation(2048, 1408, 32, initial.expedition.layout.obstacles, 12); nav.rebuild(goal);
  for (let i = 0; i < 180; i++) {
    const p = (await state(page)).player; if (Math.hypot(p.x - goal.x, p.y - goal.y) < 16) return;
    const d = nav.direction(p, goal), keys = [Math.abs(d.x) > .1 ? d.x > 0 ? 'KeyD' : 'KeyA' : '', Math.abs(d.y) > .1 ? d.y > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
    for (const k of keys) await page.keyboard.down(k); await page.clock.runFor(70); for (const k of keys) await page.keyboard.up(k);
  }
  throw new Error('未能步行到回营信标');
}

for (const preference of ['ultra', 'high', 'standard']) test(`旧${preference}偏好自动失效，固定1080p且营地保留、菜单无画质选择`, async ({ page }) => {
  const campaign = newCampaign(); campaign.expeditions = 2; campaign.depot = { materials: 30, energy: 12, medkits: 2 };
  await page.addInitScript(({ preference, campaign }) => { localStorage.setItem('last-light.display-quality', preference); localStorage.setItem('last-light.campaign.v2', JSON.stringify(campaign)); }, { preference, campaign });
  await page.goto('/?test=1'); await page.getByRole('main', { name: '主菜单' }).waitFor();
  expect(await page.locator('canvas').evaluate(c => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height])).toEqual([1920, 1080]);
  await expect(page.getByLabel('画面清晰度')).toHaveCount(0); await expect(page.getByRole('combobox')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('last-light.display-quality'))).toBe(null);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('last-light.campaign.v2')!))).toEqual(campaign);
});

test('原4K玩家探索HUD与浮层真实可见，鼠标连续回营/布防/换街区，再手动入夜', async ({ page }) => {
  test.setTimeout(180000); await page.setViewportSize({ width: 2551, height: 1307 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const campaign = newCampaign(); campaign.weapons.push('rifle');
  campaign.exploration = { version: 1, seed: 13579, visits: [0, 0, 0, 0, 0, 0], looted: [[], [], [], [], [], []], lastDistrict: -1 };
  await page.addInitScript(c => { localStorage.setItem('last-light.display-quality', 'ultra'); localStorage.setItem('last-light.campaign.v2', JSON.stringify(c)); }, campaign);
  await page.clock.install(); await page.goto('/?play=1&difficulty=easy&test=1&intro=0');
  const districts: number[] = [];
  for (let trip = 0; trip < 3; trip++) {
    await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); await key(page, 'Space');
    const current = await state(page); districts.push(current.expedition.district);
    await page.mouse.move(900, 400); await page.mouse.wheel(0, -200); await page.clock.runFor(100);
    // 读取实际截图中的生命条像素，防止模型正常却把整层HUD画到屏幕外。
    expect(await coloredPixels(page, { x: 28, y: 94, width: 200, height: 6 }, [169, 198, 155])).toBeGreaterThan(200);
    if (trip === 0) await page.screenshot({ path: 'artifacts/v0171-visible-exploration.png' });
    await click(page, 1220, 67); expect((await state(page)).paused).toBe(true);
    expect(await coloredPixels(page, { x: 530, y: 523, width: 45, height: 30 }, [217, 186, 125])).toBeGreaterThan(200);
    if (trip === 0) await page.screenshot({ path: 'artifacts/v0171-visible-pause.png' });
    await click(page, 640, 540); expect((await state(page)).paused).toBe(false);
    await key(page, 'Tab'); expect((await state(page)).paused).toBe(true);
    expect(await coloredPixels(page, { x: 530, y: 523, width: 45, height: 30 }, [217, 186, 125])).toBeGreaterThan(200);
    await click(page, 640, 540); expect((await state(page)).paused).toBe(false);
    if (trip === 0) {
      await walk(page, current.expedition.caches.find((c: any) => c.id === 'salvage')); await key(page, 'KeyE');
      expect((await state(page)).expedition.inventory.materials).toBe(8);
      await walk(page, current.expedition.survivors.find((s: any) => s.id === 'engineer')); await key(page, 'KeyE');
      expect((await state(page)).expedition.survivors.find((s: any) => s.id === 'engineer').state).toBe('following');
    }
    await walk(page, { x: 920, y: 760 }); await page.clock.runFor(700); await key(page, 'KeyE');
    expect((await state(page)).status).toBe('complete'); await key(page, 'Space');
    if (trip === 0) expect((await state(page)).expedition.summary.rescued).toContain('engineer');
    expect(await coloredPixels(page, { x: 530, y: 523, width: 45, height: 30 }, [217, 186, 125])).toBeGreaterThan(200);
    await page.screenshot({ path: `artifacts/v0171-visible-return-${trip}.png` }); await click(page, 640, 540);
    await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
    if (trip < 2) await click(page, 1198, 70); else {
      await page.screenshot({ path: 'artifacts/v0171-stable-preparation.png' }); await click(page, 1128, 641);
      await page.waitForFunction(() => (window as any).__nightLight?.snapshot().ready); expect((await state(page)).phase).toBe('night');
    }
  }
  expect(districts[0]).not.toBe(districts[1]); expect(districts[1]).not.toBe(districts[2]); expect(errors).toEqual([]);
});
