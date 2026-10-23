import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTower, createGame, explore, recruitSquad, startNight, tick } from '../src/game/engine.ts';
import { DEFAULT_SETTINGS, SAVE_KEY, isGameState, loadGame, saveGame } from '../src/game/storage.ts';

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } };
}
test('真实战斗状态包含人物、小队与武器，序列化后无损恢复', () => {
  const storage = memoryStorage(), s = createGame(2026);
  explore(s, 'warehouse'); buildTower(s, 'sentry', 3); recruitSquad(s, 0); startNight(s);
  for (let i = 0; i < 80; i++) tick(s, 0.05);
  assert.equal(isGameState(s), true);
  assert.equal(saveGame(s, DEFAULT_SETTINGS, storage).ok, true);
  assert.deepEqual(loadGame(storage).state, s);
});
test('坏 JSON、未知版本、缺失字段与超大存档安全降级', () => {
  for (const raw of ['{broken', JSON.stringify({ version: 2, state: createGame(1) }), JSON.stringify({ version: 1, state: {} }), ' '.repeat(400001)]) {
    const storage = memoryStorage(); storage.setItem(SAVE_KEY, raw);
    const loaded = loadGame(storage);
    assert.equal(loaded.state, null); assert.ok(loaded.message.length > 0);
  }
});
test('非法数值、ID 冲突、占用冲突、阶段矛盾与未知类型无法载入', () => {
  const cases = [
    (s: ReturnType<typeof createGame>) => { s.energy = NaN; },
    (s: ReturnType<typeof createGame>) => { s.materials = -1; },
    (s: ReturnType<typeof createGame>) => { s.day = 6; },
    (s: ReturnType<typeof createGame>) => { s.phase = 'victory'; },
    (s: ReturnType<typeof createGame>) => { s.health = 0; },
    (s: ReturnType<typeof createGame>) => { s.towers.push({ id: 1, padId: 40, kind: 'sentry', flash: 0, cooldown: 0, aim: null }); },
    (s: ReturnType<typeof createGame>) => { buildTower(s, 'sentry', 0); s.towers.push({ ...s.towers[0] }); },
    (s: ReturnType<typeof createGame>) => { s.survivors.push('engineer', 'engineer'); },
    (s: ReturnType<typeof createGame>) => { s.weapons.emp = -1; },
    (s: ReturnType<typeof createGame>) => { s.upgradeChoices.push('fortify'); },
    (s: ReturnType<typeof createGame>) => { s.seed = 0; },
  ];
  for (const mutate of cases) { const s = createGame(1); mutate(s); assert.equal(isGameState(s), false); }
});
test('浏览器拒绝存储时不抛异常，游戏调用方得到清晰提示', () => {
  const blocked = { getItem(): never { throw new Error('blocked'); }, setItem(): never { throw new Error('quota'); } };
  const saved = saveGame(createGame(1), DEFAULT_SETTINGS, blocked);
  assert.equal(saved.ok, false); assert.match(saved.message, /无法保存/);
  assert.equal(loadGame(blocked).state, null);
  assert.match(loadGame(blocked).message, /无法读取/);
});

test('旧版零能源存档恢复时统一回落微光，不把耗尽前的亮度带到次日', () => {
  const storage = memoryStorage(), s = createGame(1);
  s.energy = 0; s.light = 'high';
  saveGame(s, DEFAULT_SETTINGS, storage);
  const loaded = loadGame(storage);
  assert.ok(loaded.state);
  assert.equal(loaded.state.light, 'low');
  assert.equal(loaded.state.energy, 0);
});
