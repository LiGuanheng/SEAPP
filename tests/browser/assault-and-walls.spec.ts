import { test, expect, type Page } from './fixtures.ts';

const state = (p: Page): Promise<any> => p.evaluate(() => ((window as any).__baseLight ?? (window as any).__nightLight).snapshot());
async function key(p: Page, code: string) { await p.keyboard.press(code); await p.clock.runFor(70); }
async function screen(p: Page, x: number, y: number) { const b = (await p.locator('canvas').boundingBox())!; return { x: b.x + x / 1280 * b.width, y: b.y + y / 720 * b.height }; }
async function move(p: Page, x: number, y: number) { const s = await state(p), q = await screen(p, (x - s.camera.x) * s.camera.zoom, (y - s.camera.y) * s.camera.zoom); await p.mouse.move(q.x, q.y, { steps: 1 }); await p.clock.runFor(80); }
async function click(p: Page, x: number, y: number) { await move(p, x, y); await p.mouse.down(); await p.clock.runFor(70); await p.mouse.up(); await p.clock.runFor(70); }
async function ready(p: Page) {
  await p.addInitScript(() => { if (!localStorage.getItem('last-light.campaign.v2')) localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, expeditions: 1, depot: { materials: 40, energy: 10, medkits: 0 }, survivors: ['engineer'], weapons: ['pistol'], lastSummary: null, base: null })); });
  await p.clock.install(); await p.goto('/?mode=base&test=1'); await p.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await p.clock.runFor(150);
}

test('按住拖墙补齐水平及斜线，回划/停留不重复扣费，松手停止并可刷新保存', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await ready(page); await key(page, 'Digit5');
  await move(page, 612, 516); await page.mouse.down(); await page.clock.runFor(70); await move(page, 932, 516);
  expect((await state(page)).plan.buildings).toHaveLength(11); expect((await state(page)).campaign.depot.materials).toBe(29);
  await move(page, 612, 516); await page.clock.runFor(400); expect((await state(page)).campaign.depot.materials).toBe(29);
  await page.mouse.up(); await move(page, 932, 580); expect((await state(page)).plan.buildings).toHaveLength(11);
  await move(page, 612, 580); await page.mouse.down(); await page.clock.runFor(70); await move(page, 772, 644);
  const diagonal = await state(page); expect(diagonal.plan.buildings).toHaveLength(19);
  await move(page, 612, 580); await page.mouse.up(); expect((await state(page)).plan.buildings).toHaveLength(19); expect((await state(page)).campaign.depot.materials).toBe(21);
  await page.screenshot({ path: 'artifacts/wall-drag-line.png' });
  await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await page.clock.runFor(80);
  const s = await state(page); expect(s.plan.buildings.filter((b: any) => b.y === 512).map((b: any) => b.x).sort((a: number, b: number) => a - b)).toEqual(Array.from({ length: 11 }, (_, i) => 608 + 32 * i));
  expect(s.plan.buildings).toHaveLength(19); expect(s.campaign.depot.materials).toBe(21); expect(errors).toEqual([]);
});

test('拖墙在暂停、Esc、离开画布时取消，不会恢复后误建；穿过通道仍留通路', async ({ page }) => {
  await ready(page); await key(page, 'Digit5'); await move(page, 612, 580); await page.mouse.down(); await page.clock.runFor(80);
  await key(page, 'KeyP'); const count = (await state(page)).plan.buildings.length; await move(page, 772, 580); expect((await state(page)).plan.buildings).toHaveLength(count);
  await key(page, 'KeyP'); await move(page, 836, 580); expect((await state(page)).plan.buildings).toHaveLength(count); await page.mouse.up();
  await move(page, 836, 580); await page.mouse.down(); await page.clock.runFor(70); await key(page, 'Escape'); const stopped = (await state(page)).plan.buildings.length;
  await move(page, 932, 580); expect((await state(page)).plan.buildings).toHaveLength(stopped); await page.mouse.up();
  await key(page, 'Digit5'); await move(page, 1252, 612); await page.mouse.down(); await page.clock.runFor(70); await move(page, 1252, 772); await page.mouse.up();
  expect((await state(page)).plan.buildings.every((b: any) => b.y < 672 || b.y >= 768)).toBe(true);
  await move(page, 900, 612); await page.mouse.down(); await page.clock.runFor(70); const leaving = (await state(page)).plan.buildings.length;
  await page.mouse.move(0, 0); await page.clock.runFor(80); await move(page, 932, 612); expect((await state(page)).plan.buildings).toHaveLength(leaving); await page.mouse.up();
});

test('点选设施后可点击出售，显示真实回收金额，暂停不穿透且不可重复领取', async ({ page }) => {
  await ready(page); await key(page, 'Digit2'); await click(page, 1220, 548); await key(page, 'Escape'); await click(page, 1232, 576);
  expect((await state(page)).selectedBuilding).toBe(1); await page.screenshot({ path: 'artifacts/building-sell-button.png' });
  const q = await screen(page, 1128, 610); await key(page, 'KeyP'); await page.mouse.click(q.x, q.y); await key(page, 'KeyX'); expect((await state(page)).plan.buildings).toHaveLength(1);
  await key(page, 'KeyP'); await page.mouse.click(q.x, q.y); await page.clock.runFor(80); const sold = await state(page);
  expect(sold.plan.buildings).toHaveLength(0); expect(sold.campaign.depot).toMatchObject({ materials: 37, energy: 8 });
  await key(page, 'KeyX'); expect((await state(page)).campaign.depot).toEqual(sold.campaign.depot);
  await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  expect((await state(page)).plan.buildings).toHaveLength(0); expect((await state(page)).campaign.depot.materials).toBe(37);
});
