import { test, expect, type Page } from './fixtures.ts';

const state = (page: Page): Promise<any> => page.evaluate(() => ((window as any).__nightLight ?? (window as any).__baseLight ?? (window as any).__lastLight).snapshot());
async function key(page: Page, code: string) {
  await page.keyboard.down(code); await page.clock.runFor(40); await page.keyboard.up(code); await page.clock.runFor(60);
}
async function clickWorld(page: Page, x: number, y: number, button: 'left' | 'right' = 'left') {
  // 虚拟时钟下镜头更新可能晚一帧；按实际可见范围移动，避免落点落到 HUD/画布外。
  // 保留真实 WASD 操作，不写入只读诊断接口或降低阵地/战斗断言。
  for (let i = 0; i < 12; i++) {
    const current = await state(page), sx = (x - current.camera.x) * current.camera.zoom, sy = (y - current.camera.y) * current.camera.zoom;
    const code = sy < 120 ? 'KeyW' : sy > 560 ? 'KeyS' : sx < 40 ? 'KeyA' : sx > 1060 ? 'KeyD' : null;
    if (!code) break;
    await page.keyboard.down(code); await page.clock.runFor(150); await page.keyboard.up(code); await page.clock.runFor(40);
  }
  const s = await state(page), b = (await page.locator('canvas').boundingBox())!;
  expect(s.paused, '施工/支援前保持活动状态，越界点击不可用 Esc 意外暂停').toBe(false);
  expect((y - s.camera.y) * s.camera.zoom).toBeGreaterThanOrEqual(94);
  expect((y - s.camera.y) * s.camera.zoom).toBeLessThan(596);
  await page.mouse.move(b.x + (x - s.camera.x) * s.camera.zoom / 1280 * b.width, b.y + (y - s.camera.y) * s.camera.zoom / 720 * b.height);
  // 铺墙在固定步读取“仍按住左键”；让按下跨过一帧，避免并行负载下 down/up 同帧合并。
  await page.mouse.down({ button }); await page.clock.runFor(40); await page.mouse.up({ button }); await page.clock.runFor(80);
}

test('第三阶段五位Boss逐波/双Boss登场，范围技能与新素材无缺帧，终局冻结', async ({ page }) => {
  test.setTimeout(150000); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' || /frame.*not found|missing.*texture/i.test(m.text())) errors.push(m.text()); });
  // 合法已解锁战役夹具；只通过键鼠施工和倍速，诊断接口保持只读。
  await page.addInitScript(() => localStorage.setItem('last-light.campaign.v2', JSON.stringify({ version: 2, clearedStage: 2, expeditions: 4, depot: { materials: 140, energy: 40, medkits: 0 }, survivors: ['engineer', 'medic', 'captain', 'ranger', 'brawler', 'guardian', 'gunner'], weapons: ['pistol', 'rifle', 'axe', 'bow'], lastSummary: null, base: null })));
  await page.clock.install(); await page.goto('/?mode=base&test=1'); await page.waitForFunction(() => (window as any).__baseLight?.snapshot().ready);
  // install 后时间仍自然流动；暂停后仅用 runFor 推进，CPU/截图耗时不再消耗30秒布防预算。
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000); await page.clock.runFor(100);
  for (const [code, x, y] of [['Digit2', 1088, 544], ['Digit3', 1216, 544], ['Digit4', 864, 832], ['Digit4', 1184, 832], ['Digit4', 864, 544], ['Digit6', 1280, 768], ['Digit7', 1184, 928], ['Digit8', 832, 608], ['Digit3', 1312, 544], ['Digit2', 1088, 992]] as const) { await key(page, code); if (y >= 800) { await page.keyboard.down('KeyS'); await page.clock.runFor(300); await page.keyboard.up('KeyS'); } await clickWorld(page, x + 4, y + 4); await key(page, 'Escape'); if (y >= 800) await key(page, 'KeyC'); }
  for (const [code, x, y] of [['Digit3', 704, 544], ['Digit8', 832, 928], ['Digit8', 1216, 992], ['Digit6', 800, 832]] as const) {
    await key(page, code); if (y >= 736) { await page.keyboard.down('KeyS'); await page.clock.runFor(300); await page.keyboard.up('KeyS'); }
    await clickWorld(page, x + 4, y + 4); await key(page, 'Escape'); await key(page, 'KeyC');
  }
  for (const y of [256, 864]) {
    if (y === 864) { await page.keyboard.down('KeyS'); await page.clock.runFor(500); await page.keyboard.up('KeyS'); }
    await key(page, 'Digit5');
    expect((await state(page)).placement, `第${y}行施工前必须真实选中城墙`).toBe('wall');
    for (const x of [416, 448, 480, 512, 544, 576, 608, 640, 672]) {
      const before = await state(page); await clickWorld(page, x + 4, y + 4); const after = await state(page);
      expect(after.plan.buildings.length, `城墙${x},${y}；placement=${after.placement}；camera=${JSON.stringify(after.camera)}；paused=${after.paused}`).toBe(before.plan.buildings.length + 1);
    }
    await key(page, 'Escape'); await key(page, 'KeyC');
  }
  // 四趟补给夹具补足防空、地面交叉火力与南侧箭塔；仍通过实际施工扣费。
  for (const [code, x, y] of [['Digit0', 864, 992], ['Digit2', 1152, 544], ['Digit2', 896, 928], ['Digit4', 704, 832], ['Digit4', 1088, 448], ['Digit4', 1216, 448], ['Digit4', 1280, 928]] as const) { await key(page, code); await clickWorld(page, x + 4, y + 4); await key(page, 'Escape'); await key(page, 'KeyC'); }
  expect((await state(page)).plan.buildings).toHaveLength(39);
  expect((await state(page)).plan.soldiers).toHaveLength(8);
  for (let i = 0; i < 8; i++) {
    const s = (await state(page)).plan.soldiers[i], points = [[944,784],[1104,784],[944,624],[1104,624],[912,704],[1136,704],[1024,832],[1024,592]];
    const p = s.role === 'gunner' ? [768, 400] : s.role === 'guardian' ? [768, 608] : points[i];
    await clickWorld(page, s.x, s.y - 16); await clickWorld(page, p[0], p[1], 'right');
  }
  await page.clock.runFor(10000);
  await page.screenshot({ path: 'artifacts/progression-late-base.png' });
  if ((await state(page)).plan.status === 'preparing') await key(page, 'Enter');
  expect((await state(page)).plan.status).toBe('ready'); await key(page, 'KeyN');
  for (let i = 0; i < 20 && !await page.evaluate(() => (window as any).__nightLight?.snapshot().ready); i++) await page.clock.runFor(100);
  expect(await page.evaluate(() => (window as any).__nightLight?.snapshot().ready)).toBe(true); await key(page, 'KeyT'); await key(page, 'KeyT');
  const kinds = new Set<string>(); let skill = false, checkedPause = false, capturedNewBoss = false, capturedHorde = false;
  for (let i = 0; i < 260 && (await state(page)).status === 'playing'; i++) {
    await page.clock.runFor(180); const s = await state(page);
    for (const e of s.enemies) kinds.add(e.kind);
    if (s.charges && s.supportCooldown === 0) {
      const target = s.enemies.find((e: any) => ['tank', 'bomber', 'blighter'].includes(e.kind) && Math.hypot(e.x - 1024, e.y - 704) < 350);
      if (target) { await key(page, 'KeyF'); await clickWorld(page, target.x, target.y); }
    }
    if (!capturedHorde && s.enemies.length >= 40) { await page.screenshot({ path: 'artifacts/assault-horde.png' }); capturedHorde = true; }
    if (s.hazards.length || s.enemies.some((e: any) => e.windup)) {
      skill = true;
      if (!checkedPause) {
        await key(page, 'KeyP'); const paused = await state(page); await page.screenshot({ path: 'artifacts/progression-skill-paused.png' });
        await page.clock.runFor(2000); expect(await state(page)).toEqual(paused); await key(page, 'KeyP'); checkedPause = true;
      }
    }
    if (!capturedNewBoss && s.enemies.some((e: any) => ['bomber', 'blighter'].includes(e.kind) && Math.hypot(e.x - 1024, e.y - 704) < 390)) {
      await page.screenshot({ path: 'artifacts/progression-new-boss.png' }); capturedNewBoss = true;
    }
    expect(s.enemies.length).toBeLessThanOrEqual(96); expect(s.hazards.length).toBeLessThanOrEqual(8);
  }
  const end = await state(page); expect(end.status).toBe('victory'); expect(end.elapsed).toBe(120); expect(end.stage).toBe(3);
  expect([...end.bossesSeen].sort()).toEqual(['bird', 'blighter', 'bomber', 'knight', 'queen']);
  for (const kind of ['spiderling', 'undead', 'crow']) expect(kinds.has(kind)).toBe(true);
  expect(skill).toBe(true); expect(capturedNewBoss).toBe(true); expect(capturedHorde).toBe(true);
  expect(end.view.particles).toBeLessThanOrEqual(240); expect(end.view.corpses).toBeLessThanOrEqual(40); expect(end.view.objects).toBeLessThan(800);
  await page.screenshot({ path: 'artifacts/progression-final-victory.png' }); await page.clock.runFor(1000); expect(await state(page)).toEqual(end); expect(errors).toEqual([]);
});

test('重新探索真实生成新种子和支线摆位，保留主线物资、药房奖励与工程师位置', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.clock.install();
  const seeds = new Set<number>(), shapes = new Set<string>();
  for (let i = 0; i < 3; i++) {
    await page.goto('/?play=1&test=1'); await page.waitForFunction(() => (window as any).__lastLight?.snapshot().ready); await page.clock.runFor(100);
    const s = await state(page), e = s.expedition; seeds.add(e.layout.seed); shapes.add(JSON.stringify(e.layout.debris));
    expect(e.caches.find((c: any) => c.id === 'salvage')).toMatchObject({ x: 1056, y: 736, opened: false });
    expect(e.caches.find((c: any) => c.id === 'room-1')).toMatchObject({ x: 1024, y: 432 });
    expect(e.survivors.find((n: any) => n.id === 'engineer')).toMatchObject({ x: 1104, y: 852 });
    await page.screenshot({ path: `artifacts/varied-city-${i}.png` });
  }
  expect(seeds.size).toBe(3); expect(shapes.size).toBeGreaterThan(1); expect(errors).toEqual([]);
});
