import { ENEMIES, LAST_DAY, LIGHTS, LOCATIONS, PADS, PATH_LENGTH, SQUAD_COST, SQUAD_SPOTS, SURVIVORS, TOWERS, UPGRADES, WEAPONS, positionAt } from './data.ts';
import type { CommandResult, EnemyKind, GameState, LightLevel, LocationId, SurvivorId, TowerKind, UpgradeId, WeaponId } from './types.ts';

const result = (ok: boolean, message: string): CommandResult => ({ ok, message });
export function log(state: GameState, text: string, kind: 'info' | 'good' | 'warn' = 'info'): void {
  state.logs.unshift({ text, kind });
  state.logs = state.logs.slice(0, 12);
}
export function createGame(seed = (Date.now() >>> 0) || 1): GameState {
  return {
    version: 1, seed: (seed >>> 0) || 1, nextId: 1, day: 1, phase: 'preparation',
    health: 100, materials: 100, energy: 75, light: 'normal', explored: false,
    towers: [], enemies: [], squads: [], survivors: [], weapons: { molotov: 0, emp: 0 },
    battle: { elapsed: 0, spawned: 0, total: 0, spawnTimer: 0, pulseCooldown: 0, pulseFlash: 0, fireUntil: 0, weaponFlash: 0 },
    modifiers: { damage: 1, range: 0, efficiency: 1, exploration: 1, maxHealth: 100 },
    stats: { kills: 0, explorations: 0, built: 0, nightsSurvived: 0, score: 0 },
    upgradeChoices: [], logs: [{ text: '灯塔已点亮。探索补给，部署第一道防线。', kind: 'info' }],
  };
}
function random(state: GameState): number {
  let x = state.seed;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.seed = x >>> 0;
  return state.seed / 4294967296;
}
export function effectiveLight(state: GameState): LightLevel { return state.energy > 0 ? state.light : 'low'; }
export function towerRange(state: GameState, kind: TowerKind): number {
  return (TOWERS[kind].range + state.modifiers.range) * LIGHTS[effectiveLight(state)].range;
}
function consumeEnergy(state: GameState, amount: number): void {
  const before = state.energy;
  state.energy = Math.max(0, before - amount);
  if (before > 0 && state.energy === 0) {
    state.light = 'low';
    log(state, '能源耗尽，灯塔回落至微光。设施仍可继续作战。', 'warn');
  }
}
export function explore(state: GameState, locationId: LocationId): CommandResult {
  if (state.phase !== 'preparation') return result(false, '只有白天可以外出探索。');
  if (state.explored) return result(false, '今天的探索已经完成，明天再出发。');
  if (!Object.hasOwn(LOCATIONS, locationId)) return result(false, '未知的探索地点。');
  const location = LOCATIONS[locationId];
  const multiplier = LIGHTS[effectiveLight(state)].reward * state.modifiers.exploration;
  const materials = Math.round((location.materials + Math.floor(random(state) * 11)) * multiplier) + (state.survivors.includes('engineer') ? 8 : 0);
  const energy = Math.round((location.energy + Math.floor(random(state) * 11)) * multiplier);
  const ambush = random(state) < location.risk;
  state.materials += materials;
  state.energy += energy;
  // 探索只会受伤，不能在非战斗阶段突然终局。
  const injury = ambush ? Math.min(8, state.health - 1) : 0;
  state.health -= injury;
  state.explored = true;
  state.stats.explorations++;
  const message = `探索${location.name}：材料 +${materials}，能源 +${energy}${ambush ? `；遭遇迷雾伏击，耐久 −${injury}` : '；平安归来'}。`;
  log(state, message, ambush ? 'warn' : 'good');
  const extras: string[] = [];
  if (state.stats.explorations === 1 || random(state) < 0.65) {
    const weapon: WeaponId = state.stats.explorations === 1 || random(state) < 0.5 ? 'molotov' : 'emp';
    state.weapons[weapon]++;
    extras.push(`发现${WEAPONS[weapon].name} ×1`);
  }
  const remaining = (Object.keys(SURVIVORS) as SurvivorId[]).filter(id => !state.survivors.includes(id));
  if (remaining.length && (state.stats.explorations === 1 || random(state) < 0.6)) {
    const rescued = state.stats.explorations === 1 ? 'engineer' : remaining[Math.floor(random(state) * remaining.length)];
    state.survivors.push(rescued);
    extras.push(`救援${SURVIVORS[rescued].role}「${SURVIVORS[rescued].name}」`);
  }
  if (extras.length) log(state, extras.join('；') + '。', 'good');
  return result(true, message + extras.join('；'));
}
export function recruitSquad(state: GameState, spotId: number): CommandResult {
  if (state.phase !== 'preparation') return result(false, '只有白天可以部署守备小队。');
  if (!Number.isInteger(spotId) || !SQUAD_SPOTS[spotId]) return result(false, '请选择有效防区。');
  if (state.squads.some(s => s.spotId === spotId)) return result(false, '这个防区已有守备小队。');
  if (state.materials < SQUAD_COST) return result(false, `部署小队需要 ${SQUAD_COST} 材料。`);
  state.materials -= SQUAD_COST;
  state.squads.push({ id: state.nextId++, spotId, cooldown: 0, flash: 0, aim: null });
  log(state, `守备小队已部署到 ${spotId + 1} 号防区，三名队员准备就绪。`, 'good');
  return result(true, '守备小队已部署。夜间将自动射击。');
}
export function buildTower(state: GameState, kind: TowerKind, padId: number): CommandResult {
  if (state.phase !== 'preparation') return result(false, '夜间无法施工，请等到白天。');
  if (!Number.isInteger(padId) || !PADS[padId] || !Object.hasOwn(TOWERS, kind)) return result(false, '请选择有效的设施与建造点。');
  if (state.towers.some(t => t.padId === padId)) return result(false, '这里已有设施。可选择其他建造点。');
  const config = TOWERS[kind];
  if (state.materials < config.cost) return result(false, `材料不足，需要 ${config.cost} 材料。`);
  state.materials -= config.cost;
  state.towers.push({ id: state.nextId++, padId, kind, cooldown: 0, flash: 0, aim: null });
  state.stats.built++;
  log(state, `在 ${String(padId + 1).padStart(2, '0')} 号点部署${config.name}。`, 'good');
  return result(true, `${config.name}部署完成。`);
}
export function sellTower(state: GameState, padId: number): CommandResult {
  if (state.phase !== 'preparation') return result(false, '只有白天可以拆除设施。');
  const tower = state.towers.find(t => t.padId === padId);
  if (!tower) return result(false, '这里没有可拆除的设施。');
  const refund = Math.floor(TOWERS[tower.kind].cost * 0.6);
  state.materials += refund;
  state.towers = state.towers.filter(t => t.id !== tower.id);
  log(state, `拆除${TOWERS[tower.kind].name}，回收 ${refund} 材料。`);
  return result(true, `设施已拆除，材料 +${refund}。`);
}
export function repairBeacon(state: GameState): CommandResult {
  if (state.phase !== 'preparation') return result(false, '只有白天可以维修灯塔。');
  if (state.health >= state.modifiers.maxHealth) return result(false, '灯塔状态完好，无需维修。');
  if (state.materials < 20) return result(false, '维修需要 20 材料。');
  const amount = Math.min(25, state.modifiers.maxHealth - state.health);
  state.materials -= 20;
  state.health += amount;
  log(state, `维修完成，灯塔耐久 +${amount}。`, 'good');
  return result(true, `灯塔耐久 +${amount}。`);
}
export function setLight(state: GameState, level: LightLevel): CommandResult {
  if (!['preparation', 'night'].includes(state.phase) || !Object.hasOwn(LIGHTS, level)) return result(false, '当前无法调节灯光。');
  if (state.energy <= 0 && level !== 'low') return result(false, '能源耗尽，目前只能维持微光。');
  state.light = level;
  return result(true, `灯光已调至${LIGHTS[level].name}。敌人数在开战时确定。`);
}
export function nightEnemyCount(day: number, light: LightLevel): number { return 8 + day * 3 + LIGHTS[light].attraction; }
export function startNight(state: GameState): CommandResult {
  if (state.phase !== 'preparation') return result(false, '当前不在准备阶段。');
  state.phase = 'night';
  state.battle = { elapsed: 0, spawned: 0, total: nightEnemyCount(state.day, effectiveLight(state)), spawnTimer: 1, pulseCooldown: 0, pulseFlash: 0, fireUntil: 0, weaponFlash: 0 };
  state.enemies = [];
  for (const tower of state.towers) { tower.cooldown = 0; tower.flash = 0; tower.aim = null; }
  for (const squad of state.squads) { squad.cooldown = 0; squad.flash = 0; squad.aim = null; }
  log(state, `第 ${state.day} 夜来临，${state.battle.total} 个敌人正在接近。`, 'warn');
  return result(true, '守住灯塔，直到最后一个敌人离开迷雾。');
}
function removeDead(state: GameState): void {
  for (const enemy of state.enemies) {
    if (enemy.health > 0) continue;
    const reward = ENEMIES[enemy.kind].reward;
    state.materials += reward;
    state.stats.kills++;
    state.stats.score += reward * 10;
  }
  state.enemies = state.enemies.filter(e => e.health > 0);
}
export function usePulse(state: GameState): CommandResult {
  if (state.phase !== 'night') return result(false, '灯塔脉冲只能在夜间使用。');
  if (state.battle.pulseCooldown > 0) return result(false, '脉冲正在充能。');
  if (state.energy < 12) return result(false, '释放脉冲需要 12 能源。');
  if (!state.enemies.length) return result(false, '当前没有敌人，无需消耗能源。');
  consumeEnergy(state, 12);
  state.battle.pulseCooldown = 18;
  state.battle.pulseFlash = 0.7;
  for (const enemy of state.enemies) { enemy.health -= 45 * state.modifiers.damage; enemy.flash = 0.2; }
  removeDead(state);
  log(state, '灯塔脉冲释放，扫清迷雾中的威胁。', 'good');
  return result(true, '脉冲已释放，对全场敌人造成伤害。');
}
export function useWeapon(state: GameState, weapon: WeaponId): CommandResult {
  if (state.phase !== 'night') return result(false, '特殊武器只能在夜间使用。');
  if (!Object.hasOwn(WEAPONS, weapon) || state.weapons[weapon] <= 0) return result(false, '没有这件特殊武器，白天探索有机会获得。');
  if (!state.enemies.length) return result(false, '当前没有感染者，无需消耗武器。');
  state.weapons[weapon]--;
  state.battle.weaponFlash = 0.8;
  if (weapon === 'molotov') state.battle.fireUntil = state.battle.elapsed + 4;
  for (const enemy of state.enemies) {
    enemy.health -= weapon === 'molotov' ? 20 : 15;
    enemy.flash = 0.2;
    if (weapon === 'emp') enemy.slowUntil = Math.max(enemy.slowUntil, state.battle.elapsed + 5);
  }
  removeDead(state);
  log(state, `使用${WEAPONS[weapon].name}。${WEAPONS[weapon].description}`, 'good');
  return result(true, `${WEAPONS[weapon].name}已使用。`);
}
function clearBattleEffects(state: GameState): void {
  for (const tower of state.towers) tower.flash = 0;
  for (const squad of state.squads) squad.flash = 0;
  for (const enemy of state.enemies) enemy.flash = 0;
  state.battle.pulseFlash = 0;
  state.battle.weaponFlash = 0;
  state.battle.fireUntil = 0;
}
function finishNight(state: GameState): void {
  clearBattleEffects(state);
  state.stats.nightsSurvived = state.day;
  state.stats.score += 150 + Math.round(state.health);
  state.materials += 28 + state.day * 3;
  state.energy += 18;
  if (state.survivors.includes('medic')) {
    const healed = Math.min(12, state.modifiers.maxHealth - state.health);
    state.health += healed;
    if (healed > 0) log(state, `战地医生组织修复，灯塔耐久 +${healed}。`, 'good');
  }
  if (state.day === LAST_DAY) {
    state.phase = 'victory';
    state.stats.score += 500;
    log(state, '第五夜结束。远方传来回应，你守住了最后的光。', 'good');
  } else {
    state.phase = 'upgrade';
    const pool = Object.keys(UPGRADES) as UpgradeId[];
    state.upgradeChoices = [];
    while (state.upgradeChoices.length < 3) {
      const i = Math.floor(random(state) * pool.length);
      state.upgradeChoices.push(pool.splice(i, 1)[0]);
    }
    log(state, `守过第 ${state.day} 夜。补给：材料 +${28 + state.day * 3}、能源 +18。选择一项黎明强化。`, 'good');
  }
}
export function chooseUpgrade(state: GameState, id: UpgradeId): CommandResult {
  if (state.phase !== 'upgrade' || !state.upgradeChoices.includes(id)) return result(false, '请选择当前提供的一项强化。');
  switch (id) {
    case 'ammunition': state.modifiers.damage += 0.2; break;
    case 'optics': state.modifiers.range += 0.35; break;
    case 'capacitor': state.modifiers.efficiency *= 0.8; state.energy += 15; break;
    case 'scavenger': state.modifiers.exploration += 0.2; state.materials += 15; break;
    case 'fortify': state.modifiers.maxHealth += 20; state.health = Math.min(state.modifiers.maxHealth, state.health + 30); break;
    case 'supply': state.materials += 40; state.energy += 20; break;
  }
  log(state, `获得「${UPGRADES[id].name}」。第 ${state.day + 1} 天，继续守护。`, 'good');
  state.day++;
  state.phase = 'preparation';
  state.explored = false;
  state.upgradeChoices = [];
  return result(true, `强化已生效，新的一天开始了。`);
}

/** 唯一的模拟入口。调用方固定 0.05 秒步长，不使用真实时钟。 */
export function tick(state: GameState, dt: number): void {
  if (state.phase !== 'night' || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.05);
  const battle = state.battle;
  const previousElapsed = battle.elapsed;
  battle.elapsed += dt;
  battle.pulseCooldown = Math.max(0, battle.pulseCooldown - dt);
  battle.pulseFlash = Math.max(0, battle.pulseFlash - dt);
  battle.weaponFlash = Math.max(0, battle.weaponFlash - dt);
  consumeEnergy(state, LIGHTS[effectiveLight(state)].drain * state.modifiers.efficiency * dt);

  battle.spawnTimer = battle.spawned < battle.total ? Math.max(0, battle.spawnTimer - dt) : 0;
  if (battle.spawned < battle.total && battle.spawnTimer <= 0) {
    const index = battle.spawned;
    const kind: EnemyKind = state.day >= 2 && index % 6 === 5 ? 'brute' : index % 3 === 2 ? 'runner' : 'drifter';
    const maxHealth = ENEMIES[kind].health + state.day * (kind === 'brute' ? 12 : 5);
    state.enemies.push({ id: state.nextId++, kind, distance: 0, health: maxHealth, maxHealth, slowUntil: 0, flash: 0 });
    battle.spawned++;
    battle.spawnTimer = Math.max(0.65, 1.2 - state.day * 0.06);
  }
  for (const enemy of state.enemies) enemy.flash = Math.max(0, enemy.flash - dt);
  const burningDuration = Math.max(0, Math.min(dt, battle.fireUntil - previousElapsed));
  if (burningDuration > 0) for (const enemy of state.enemies) enemy.health -= 12 * burningDuration;
  for (const tower of state.towers) {
    tower.flash = Math.max(0, tower.flash - dt);
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    if (tower.cooldown > 0) continue;
    const center = PADS[tower.padId], range = towerRange(state, tower.kind);
    const target = state.enemies.filter(e => e.health > 0 && Math.hypot(positionAt(e.distance).x - center.x, positionAt(e.distance).y - center.y) <= range)
      .sort((a, b) => b.distance - a.distance)[0];
    if (!target) continue;
    const config = TOWERS[tower.kind], location = positionAt(target.distance);
    tower.cooldown = config.interval;
    tower.flash = 0.15;
    tower.aim = location;
    const damage = config.damage * state.modifiers.damage;
    if (tower.kind === 'mortar') {
      for (const enemy of state.enemies) {
        const p = positionAt(enemy.distance);
        if (Math.hypot(p.x - location.x, p.y - location.y) <= 1.1) { enemy.health -= damage; enemy.flash = 0.15; }
      }
    } else {
      target.health -= damage;
      target.flash = 0.15;
      if (tower.kind === 'frost') target.slowUntil = Math.max(target.slowUntil, battle.elapsed + 2);
    }
  }
  for (const squad of state.squads) {
    squad.flash = Math.max(0, squad.flash - dt);
    squad.cooldown = Math.max(0, squad.cooldown - dt);
    if (squad.cooldown > 0) continue;
    const center = SQUAD_SPOTS[squad.spotId];
    const target = state.enemies.filter(e => e.health > 0 && Math.hypot(positionAt(e.distance).x - center.x, positionAt(e.distance).y - center.y) <= 2.5)
      .sort((a, b) => b.distance - a.distance)[0];
    if (!target) continue;
    squad.cooldown = 0.65; squad.flash = 0.12; squad.aim = positionAt(target.distance);
    target.health -= 12 * state.modifiers.damage * (state.survivors.includes('captain') ? 1.25 : 1);
    target.flash = 0.15;
  }
  removeDead(state);
  for (const enemy of state.enemies) {
    enemy.distance += ENEMIES[enemy.kind].speed * (enemy.slowUntil > battle.elapsed ? 0.45 : 1) * dt;
    if (enemy.distance >= PATH_LENGTH) {
      state.health = Math.max(0, state.health - ENEMIES[enemy.kind].damage);
      log(state, `${ENEMIES[enemy.kind].name}突破防线，灯塔耐久 −${ENEMIES[enemy.kind].damage}。`, 'warn');
    }
  }
  state.enemies = state.enemies.filter(e => e.distance < PATH_LENGTH);
  if (state.health <= 0) { state.phase = 'defeat'; clearBattleEffects(state); log(state, '灯塔熄灭了。带着这次经验，再试一次。', 'warn'); }
  else if (battle.spawned === battle.total && state.enemies.length === 0) finishNight(state);
}
