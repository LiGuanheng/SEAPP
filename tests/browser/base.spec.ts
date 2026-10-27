import { test, expect, type Page } from './fixtures.ts';

const state = (page: Page): Promise<any> => page.evaluate(() => (window as any).__baseLight.snapshot());
async function uiPoint(page: Page, x: number, y: number) {
  const b = (await page.locator('canvas').boundingBox())!; return { x: b.x + x / 1280 * b.width, y: b.y + y / 720 * b.height };
}
async function point(page: Page, x: number, y: number) {
  const s = await state(page); return uiPoint(page, (x - s.camera.x) * s.camera.zoom, (y - s.camera.y) * s.camera.zoom);
}
async function click(page: Page, x: number, y: number, button: 'left' | 'right' = 'left') {
  const p = await point(page, x, y); await page.mouse.click(p.x, p.y, { button }); await page.clock.runFor(80);
}
async function prepared(page: Page, captain = false) {
  await page.addInitScript(({ captain }) => {
    localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, expeditions: 1, depot: { materials: 20, energy: 4, medkits: 0 }, survivors: captain ? ['engineer', 'captain'] : ['engineer'], weapons: ['pistol'], lastSummary: null }));
  }, { captain });
  await page.clock.install(); await page.goto('/?mode=base&test=1');
  await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await page.clock.runFor(100);
}
async function walkExpedition(page: Page, x: number, y: number) {
  for (let i = 0; i < 40; i++) {
    const p = await page.evaluate(() => (window as any).__lastLight.snapshot().player), dx = x - p.x, dy = y - p.y;
    if (Math.hypot(dx, dy) < 15) return;
    const keys = [Math.abs(dx) > 9 ? (dx > 0 ? 'KeyD' : 'KeyA') : '', Math.abs(dy) > 9 ? (dy > 0 ? 'KeyS' : 'KeyW') : ''].filter(Boolean);
    for (const k of keys) await page.keyboard.down(k);
    await page.clock.runFor(Math.min(140, Math.max(45, Math.hypot(dx, dy) / 168 * 900)));
    for (const k of keys) await page.keyboard.up(k);
  }
  throw Error('探索路线未到达目标');
}

test('真实探索回营后进入基地，资源建设、选兵右键移动、驻守、框选、暂停与存档', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install(); await page.goto('/?test=1&practice=base'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); await page.clock.runFor(100);
  for (const p of [{ x: 1056, y: 736 }, { x: 1104, y: 852 }, { x: 920, y: 760 }]) { await walkExpedition(page, p.x, p.y); await page.clock.runFor(200); await page.keyboard.press('KeyE'); }
  await page.clock.runFor(100); expect(await page.evaluate(() => (window as any).__lastLight.snapshot().status)).toBe('complete');
  await page.keyboard.press('Enter'); await page.clock.runFor(200); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  expect((await state(page)).campaign.depot.materials).toBe(12);
  await page.screenshot({ path: 'artifacts/phase3-base.png' });
  await page.keyboard.press('Digit2'); const preview = await point(page, 964, 356); await page.mouse.move(preview.x, preview.y); await page.clock.runFor(80);
  await page.screenshot({ path: 'artifacts/phase3-placement.png' });
  await click(page, 964, 356); expect((await state(page)).plan.buildings).toHaveLength(1);
  expect((await state(page)).plan.buildings[0]).toMatchObject({ kind: 'turret', x: 960, y: 352 });
  expect((await state(page)).campaign.depot).toMatchObject({ materials: 7, energy: 0 });
  await click(page, 964, 356); expect((await state(page)).plan.buildings).toHaveLength(1);
  await page.keyboard.press('Digit1'); await click(page, 1060, 356); expect((await state(page)).plan.buildings).toHaveLength(2);
  await page.keyboard.press('Escape');
  await click(page, 688, 604); expect((await state(page)).selected).toEqual([1]);
  await page.keyboard.down('ShiftLeft'); await click(page, 752, 604); await page.keyboard.up('ShiftLeft'); expect((await state(page)).selected.sort()).toEqual([1, 2]);
  await click(page, 1056, 624, 'right'); await page.clock.runFor(1600);
  expect((await state(page)).plan.soldiers[0].x).toBeGreaterThan(800);
  await page.keyboard.press('KeyG'); await page.clock.runFor(60); const stopped = (await state(page)).plan.soldiers;
  await page.clock.runFor(500); expect((await state(page)).plan.soldiers).toEqual(stopped);
  const soldiers = (await state(page)).plan.soldiers;
  const start = await point(page, Math.min(...soldiers.map((s: any) => s.x)) - 35, Math.min(...soldiers.map((s: any) => s.y)) - 65);
  const end = await point(page, Math.max(...soldiers.map((s: any) => s.x)) + 35, Math.max(...soldiers.map((s: any) => s.y)) + 15);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 6 }); await page.mouse.up(); await page.clock.runFor(80);
  expect((await state(page)).selected).toHaveLength(3);
  await page.screenshot({ path: 'artifacts/phase3-command.png' });
  await page.keyboard.press('KeyP'); await page.clock.runFor(80); const paused = await state(page);
  await page.clock.runFor(5000); expect(await state(page)).toEqual(paused);
  await page.keyboard.press('KeyP'); await page.clock.runFor(70); expect((await state(page)).paused).toBe(false);
  await page.keyboard.press('Enter'); await page.clock.runFor(100);
  expect((await state(page)).plan.status).toBe('ready');
  await page.screenshot({ path: 'artifacts/phase3-ready.png' });
  await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await page.clock.runFor(100);
  expect((await state(page)).plan.buildings).toHaveLength(2); expect((await state(page)).campaign.depot.materials).toBe(5);
  expect(errors).toEqual([]);
});

test('镜头缩放/移动后仍正确落地，HUD 固定，旋转、拆除、驻守和失焦无残留输入', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await prepared(page, true); expect((await state(page)).plan.soldiers).toHaveLength(4);
  const p = await uiPoint(page, 700, 350); await page.mouse.move(p.x, p.y); await page.mouse.wheel(0, -200); await page.clock.runFor(100);
  const zoom = (await state(page)).camera.zoom; expect(zoom).toBeGreaterThan(0.9);
  await page.keyboard.down('KeyD'); await page.clock.runFor(250); await page.keyboard.up('KeyD');
  const button = await uiPoint(page, 65, 658); await page.mouse.click(button.x, button.y); await page.keyboard.press('KeyR');
  await click(page, 964, 356); const s = await state(page);
  expect(s.plan.buildings[0]).toMatchObject({ kind: 'barricade', x: 960, y: 352, rotation: 1 });
  await page.keyboard.press('Escape'); await click(page, 976, 384); expect((await state(page)).selectedBuilding).toBe(1);
  await page.keyboard.press('Delete'); await page.clock.runFor(80); expect((await state(page)).plan.buildings).toHaveLength(0); expect((await state(page)).campaign.depot.materials).toBe(19);
  await page.keyboard.press('Space'); expect((await state(page)).selected).toHaveLength(4);
  await click(page, 1000, 688, 'right'); await page.clock.runFor(300);
  await page.keyboard.down('KeyD'); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.clock.runFor(80);
  expect((await state(page)).paused).toBe(true); const paused = await state(page);
  const coveredHold = await uiPoint(page, 549, 661); await page.mouse.click(coveredHold.x, coveredHold.y);
  await page.clock.runFor(2000); expect(await state(page)).toEqual(paused);
  await page.keyboard.up('KeyD'); await page.keyboard.press('KeyP'); await page.keyboard.press('KeyG'); await page.clock.runFor(100); const camera = (await state(page)).camera;
  await page.clock.runFor(500); expect((await state(page)).camera).toEqual(camera); expect(errors).toEqual([]);
  await page.screenshot({ path: 'artifacts/phase3-zoom.png' });
});

test('30 秒自动完成，继续调整不重置预算，可返回探索；正常入口无诊断接口', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await prepared(page); await page.clock.runFor(30000);
  const s = await state(page); expect(s.plan.status).toBe('ready'); expect(s.remaining).toBe(0); expect(s.plan.elapsed).toBe(30);
  await page.clock.runFor(2000); expect(await state(page)).toEqual(s);
  await page.keyboard.press('Enter'); await page.clock.runFor(100); expect((await state(page)).plan.status).toBe('preparing'); expect((await state(page)).campaign.depot.materials).toBe(20);
  const explore = await uiPoint(page, 1198, 70); await page.mouse.click(explore.x, explore.y); await page.clock.runFor(100);
  await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready);
  expect(await page.evaluate(() => '__baseLight' in window)).toBe(false);
  await page.goto('/?mode=base'); await page.clock.runFor(150);
  expect(await page.evaluate(() => '__baseLight' in window || '__lastLight' in window)).toBe(false);
  expect(errors).toEqual([]);
});

test('基地读档失败不立即覆盖原存档，禁用写入后仍可建设、指挥和完成', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (!localStorage.getItem('last-light.campaign.v2')) localStorage.setItem('last-light.campaign.v2', '{broken'); });
  await page.clock.install(); await page.goto('/?mode=base&test=1');
  await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await page.clock.runFor(100);
  expect(await page.evaluate(() => localStorage.getItem('last-light.campaign.v2'))).toBe('{broken');
  // 使用正常营地存档作为异常存储的输入数据，不修改游戏内部模型。
  await page.evaluate(() => localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, expeditions: 0, depot: { materials: 12, energy: 2, medkits: 0 }, survivors: [], weapons: ['pistol'], lastSummary: null })));
  await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready); await page.clock.runFor(100);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('storage disabled'); }; });
  await page.keyboard.press('Digit2'); await click(page, 964, 356); expect((await state(page)).plan.buildings).toHaveLength(1);
  // Phaser 下一帧才分发按键；先确认全选完成，再发送右键指令，避免并行负载下先下令后选兵。
  await page.keyboard.press('Escape'); await page.clock.runFor(60); await page.keyboard.press('Space'); await page.clock.runFor(60);
  expect((await state(page)).selected).toHaveLength(3); await click(page, 1000, 688, 'right'); await page.clock.runFor(300);
  expect((await state(page)).plan.soldiers.some((s: any) => s.moving)).toBe(true);
  await page.keyboard.press('Enter'); await page.clock.runFor(100); expect((await state(page)).plan.status).toBe('ready');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('last-light.campaign.v2')))!).depot.materials).toBe(12);
  await page.screenshot({ path: 'artifacts/phase3-storage-disabled.png' }); expect(errors).toEqual([]);
});
