import test from 'node:test';
import assert from 'node:assert/strict';
import { PADS, PATH_LENGTH, SQUAD_COST, TOWERS, positionAt } from '../src/game/data.ts';
import { buildTower, chooseUpgrade, createGame, effectiveLight, explore, nightEnemyCount, recruitSquad, repairBeacon, sellTower, setLight, startNight, tick, towerRange, usePulse, useWeapon } from '../src/game/engine.ts';
import { isGameState } from '../src/game/storage.ts';
import type { GameState, TowerKind } from '../src/game/types.ts';

function enemy(state: GameState, distance: number, health = 100): void {
  state.enemies.push({ id: state.nextId++, kind: 'drifter', distance, health, maxHealth: health, slowUntil: 0, flash: 0 });
}
function advance(state: GameState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / 0.05); i++) tick(state, 0.05);
}

test('新局互不共享数组；固定种子探索可复现，并得到首份武器和救援人物', () => {
  const a = createGame(42), b = createGame(42);
  explore(a, 'warehouse'); explore(b, 'warehouse');
  assert.deepEqual(a, b);
  assert.deepEqual(a.survivors, ['engineer']);
  assert.equal(a.weapons.molotov, 1);
  assert.equal(createGame(42).survivors.length, 0);
  const before = structuredClone(a);
  assert.equal(explore(a, 'ruins').ok, false);
  assert.deepEqual(a, before, '同一天重复探索不能扣资源或改变随机种子');
});

test('无效设施、地点与建造点被拒绝，状态保持完整', () => {
  const s = createGame(1), before = structuredClone(s);
  assert.equal(buildTower(s, '__proto__' as TowerKind, 0).ok, false);
  assert.equal(buildTower(s, 'sentry', -1).ok, false);
  assert.equal(buildTower(s, 'sentry', 0.5).ok, false);
  assert.equal(explore(s, '__proto__' as 'ruins').ok, false);
  assert.equal(setLight(s, '__proto__' as 'low').ok, false);
  assert.deepEqual(s, before);
});

test('建设原子扣费，拒绝占用与资源不足；拆除返回 60% 成本', () => {
  const s = createGame(1);
  assert.equal(buildTower(s, 'sentry', 3).ok, true);
  assert.equal(s.materials, 68);
  const snapshot = structuredClone(s);
  assert.equal(buildTower(s, 'mortar', 3).ok, false);
  assert.deepEqual(s, snapshot);
  s.materials = 1;
  assert.equal(buildTower(s, 'mortar', 5).ok, false);
  assert.equal(s.materials, 1);
  assert.equal(sellTower(s, 3).ok, true);
  assert.equal(s.materials, 20);
  assert.equal(s.towers.length, 0);
});

test('维修不会超出最大耐久，满血与夜间维修不扣材料', () => {
  const s = createGame(1);
  assert.equal(repairBeacon(s).ok, false);
  assert.equal(s.materials, 100);
  s.health = 97;
  assert.equal(repairBeacon(s).ok, true);
  assert.equal(s.health, 100);
  assert.equal(s.materials, 80);
  startNight(s); s.health = 50;
  assert.equal(repairBeacon(s).ok, false);
  assert.equal(s.materials, 80);
});

test('守备小队限定防区、资金与施工阶段', () => {
  const s = createGame(1);
  assert.equal(recruitSquad(s, 0).ok, true);
  assert.equal(s.materials, 100 - SQUAD_COST);
  assert.equal(recruitSquad(s, 0).ok, false);
  assert.equal(recruitSquad(s, 9).ok, false);
  s.materials = 0;
  assert.equal(recruitSquad(s, 1).ok, false);
  startNight(s); s.materials = 100;
  assert.equal(recruitSquad(s, 1).ok, false);
  assert.equal(buildTower(s, 'sentry', 1).ok, false);
  assert.equal(sellTower(s, 0).ok, false);
});

test('路径插值在拐点保持一致，越界距离安全钳位', () => {
  assert.deepEqual(positionAt(-1), { x: 0, y: 4 });
  assert.deepEqual(positionAt(3), { x: 3, y: 4 });
  assert.deepEqual(positionAt(4), { x: 3, y: 3 });
  assert.deepEqual(positionAt(PATH_LENGTH + 100), { x: 12, y: 4 });
});

test('亮度影响射程与开战数量，能源耗尽不会透支或终止设施作战', () => {
  const s = createGame(2);
  const normal = towerRange(s, 'sentry');
  setLight(s, 'high');
  assert.ok(towerRange(s, 'sentry') > normal);
  startNight(s);
  assert.equal(s.battle.total, nightEnemyCount(1, 'high'));
  setLight(s, 'low');
  assert.equal(s.battle.total, nightEnemyCount(1, 'high'), '开战后调光不应改变敌人总数');
  s.energy = 0.001;
  tick(s, 0.05);
  assert.equal(s.energy, 0);
  assert.equal(effectiveLight(s), 'low');
  assert.equal(setLight(s, 'high').ok, false);
  advance(s, 1);
  assert.equal(s.energy, 0);
});

test('未刷完敌人时，脉冲清场不会提前结算；冷却不能重复奖励', () => {
  const s = createGame(2);
  startNight(s); enemy(s, 2, 30);
  s.battle.spawned = 1;
  const initialMaterials = s.materials;
  assert.equal(usePulse(s).ok, true);
  assert.equal(s.stats.kills, 1);
  assert.equal(s.materials, initialMaterials + 3);
  assert.equal(s.energy, 63);
  assert.equal(usePulse(s).ok, false);
  tick(s, 0.05);
  assert.equal(s.phase, 'night');
  assert.equal(s.stats.kills, 1);
});

test('无敌人或能源不足时，脉冲与武器不消耗资源', () => {
  const s = createGame(2);
  s.weapons.molotov = 1;
  assert.equal(useWeapon(s, 'molotov').ok, false);
  startNight(s);
  assert.equal(usePulse(s).ok, false);
  assert.equal(useWeapon(s, 'molotov').ok, false);
  assert.equal(s.weapons.molotov, 1);
  enemy(s, 2); s.energy = 11;
  assert.equal(usePulse(s).ok, false);
  assert.equal(s.energy, 11);
});

test('脉冲耗尽最后能源时立即回落微光，黎明补给不擅自恢复强光', () => {
  const s = createGame(2);
  setLight(s, 'high'); startNight(s);
  s.energy = 12; s.battle.spawned = s.battle.total;
  enemy(s, 2, 30);
  assert.equal(usePulse(s).ok, true);
  assert.equal(s.energy, 0);
  assert.equal(s.light, 'low');
  tick(s, 0.05);
  assert.equal(s.phase, 'upgrade');
  assert.ok(s.energy > 0);
  assert.equal(effectiveLight(s), 'low');
});

test('燃烧持续四秒的伤害不依赖投掷时刻，末步按实际覆盖时间计伤', () => {
  for (const elapsed of [0, 0.35, 1.6, 7.95]) {
    const s = createGame(2); startNight(s);
    s.battle.elapsed = elapsed; s.battle.spawned = s.battle.total;
    enemy(s, 0, 150); s.weapons.molotov = 1;
    useWeapon(s, 'molotov'); advance(s, 4.1);
    assert.ok(Math.abs(s.enemies[0].health - 82) < 1e-8, `投掷时刻 ${elapsed}，剩余生命 ${s.enemies[0].health}`);
  }
});

test('战败清除枪火、脉冲与灼烧，终局不会保留永久攻击特效', () => {
  const s = createGame(2); buildTower(s, 'sentry', 3); recruitSquad(s, 0); startNight(s);
  s.health = 1; s.battle.spawned = s.battle.total;
  enemy(s, PATH_LENGTH - 0.001, 100);
  s.towers[0].flash = 0.15; s.squads[0].flash = 0.12;
  s.battle.pulseFlash = 0.7; s.battle.weaponFlash = 0.8; s.battle.fireUntil = 4;
  tick(s, 0.05);
  assert.equal(s.phase, 'defeat');
  assert.equal(s.towers[0].flash, 0);
  assert.equal(s.squads[0].flash, 0);
  assert.equal(s.battle.pulseFlash, 0);
  assert.equal(s.battle.weaponFlash, 0);
  assert.equal(s.battle.fireUntil, 0);
});

test('震荡弹减速不被霜冻塔缩短，消耗一件武器', () => {
  const s = createGame(2);
  buildTower(s, 'frost', 3); startNight(s);
  s.battle.spawned = 1; enemy(s, 4);
  s.weapons.emp = 1;
  assert.equal(useWeapon(s, 'emp').ok, true);
  const until = s.enemies[0].slowUntil;
  tick(s, 0.05);
  assert.equal(s.enemies[0].slowUntil, until);
  assert.ok(s.enemies[0].distance - 4 < 0.85 * 0.05);
  assert.equal(s.weapons.emp, 0);
  assert.equal(useWeapon(s, 'emp').ok, false);
});

test('燃烧瓶有持续群伤，范围塔可伤害同区域的多个感染者', () => {
  const fire = createGame(3);
  startNight(fire); enemy(fire, 3, 100); enemy(fire, 3.1, 100);
  fire.battle.spawned = 2; fire.weapons.molotov = 1;
  useWeapon(fire, 'molotov'); advance(fire, 1);
  assert.ok(fire.enemies[0].health <= 69);
  assert.ok(fire.enemies[1].health <= 69);
  const splash = createGame(3);
  buildTower(splash, 'mortar', 4); startNight(splash);
  enemy(splash, 7, 100); enemy(splash, 7.2, 100); splash.battle.spawned = 2;
  tick(splash, 0.05);
  assert.equal(splash.enemies[0].health, 70);
  assert.equal(splash.enemies[1].health, 70);
});

test('队长提高小队伤害，医生在守夜成功后修复灯塔', () => {
  const a = createGame(3), b = createGame(3);
  for (const s of [a, b]) { recruitSquad(s, 0); startNight(s); enemy(s, 3, 100); s.battle.spawned = 1; }
  b.survivors.push('captain');
  tick(a, 0.05); tick(b, 0.05);
  assert.ok(b.enemies[0].health < a.enemies[0].health);
  const medical = createGame(3);
  medical.survivors.push('medic'); medical.health = 65;
  startNight(medical); medical.battle.spawned = medical.battle.total;
  tick(medical, 0.05);
  assert.equal(medical.phase, 'upgrade');
  assert.equal(medical.health, 77);
  assert.equal(medical.upgradeChoices.length, 3);
  assert.equal(new Set(medical.upgradeChoices).size, 3);
  assert.equal(chooseUpgrade(medical, medical.upgradeChoices[0]).ok, true);
  const snapshot = structuredClone(medical);
  assert.equal(chooseUpgrade(medical, 'fortify').ok, false);
  assert.deepEqual(medical, snapshot);
});

test('无防守会失败，结束后继续 tick 不改变状态；白天也不推进战斗', () => {
  const s = createGame(4), initial = structuredClone(s);
  advance(s, 60); assert.deepEqual(s, initial);
  startNight(s); advance(s, 90);
  assert.equal(s.phase, 'defeat'); assert.equal(s.health, 0);
  const ended = structuredClone(s);
  advance(s, 60); assert.deepEqual(s, ended);
});

test('固定策略可在多个真实种子下守过五夜，全程状态可存档', () => {
  for (const seed of [1, 7, 42, 2026, 65535]) {
    const s = createGame(seed);
    while (s.phase !== 'victory' && s.phase !== 'defeat') {
      if (s.phase === 'preparation') {
        explore(s, 'warehouse');
        if (s.health < s.modifiers.maxHealth - 24 && s.materials >= 20) repairBeacon(s);
        const plan: [number, TowerKind][] = [[3, 'sentry'], [5, 'sentry'], [6, 'sentry'], [7, 'mortar'], [8, 'frost'], [10, 'sentry'], [0, 'sentry'], [2, 'mortar'], [4, 'sentry'], [9, 'sentry'], [11, 'frost'], [1, 'sentry']];
        for (const [pad, kind] of plan) if (!s.towers.some(t => t.padId === pad) && s.materials >= TOWERS[kind].cost) buildTower(s, kind, pad);
        for (let spot = 0; spot < 3; spot++) if (!s.squads.some(t => t.spotId === spot)) recruitSquad(s, spot);
        startNight(s);
      } else if (s.phase === 'upgrade') chooseUpgrade(s, s.upgradeChoices.includes('ammunition') ? 'ammunition' : s.upgradeChoices[0]);
      else {
        for (let i = 0; i < 3000 && s.phase === 'night'; i++) {
          if (s.enemies.length >= 4) usePulse(s);
          tick(s, 0.05);
          if (i % 80 === 0) assert.equal(isGameState(s), true, `种子 ${seed}，第 ${s.day} 天的真实状态应通过存档验证`);
        }
        assert.notEqual(s.phase, 'night', '单夜应在合理时长结束');
      }
    }
    assert.equal(s.phase, 'victory', `种子 ${seed} 应存在可通关策略`);
    assert.equal(s.day, 5);
    assert.equal(s.stats.nightsSurvived, 5);
    assert.equal(isGameState(s), true);
    assert.ok(s.towers.length <= PADS.length);
  }
});
