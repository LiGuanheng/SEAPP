import './style.css';
import { LAST_DAY, LIGHTS, LOCATIONS, PADS, SQUAD_COST, SQUAD_SPOTS, SURVIVORS, TOWERS, UPGRADES, WEAPONS } from './game/data.ts';
import { buildTower, chooseUpgrade, createGame, effectiveLight, explore, nightEnemyCount, recruitSquad, repairBeacon, sellTower, setLight, startNight, tick, usePulse, useWeapon } from './game/engine.ts';
import { loadGame, saveGame } from './game/storage.ts';
import type { CommandResult, LightLevel, LocationId, TowerKind, UpgradeId, WeaponId } from './game/types.ts';
import { GameAudio } from './ui/audio.ts';
import { icon } from './ui/icons.ts';
import { patchHTML } from './ui/dom.ts';
import { MapRenderer } from './ui/renderer.ts';

const loaded = loadGame();
let state = loaded.state ?? createGame();
const settings = loaded.settings;
let selectedKind: TowerKind = 'sentry', selectedPad: number | null = null, hoverPad: number | null = null;
let userPaused = state.phase === 'night', speed = 1, saveFailed = false;
let lastTime = 0, accumulator = 0, uiElapsed = 0, saveElapsed = 0, visualTime = 0;
let toastTimer: ReturnType<typeof setTimeout>;
const audio = new GameAudio();
const app = document.querySelector<HTMLDivElement>('#app')!;
const escape = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const disabled = (value: boolean): string => value ? 'disabled' : '';
app.innerHTML = `
  <header class="site-header"><a class="brand" href="./" aria-label="最后一盏灯首页"><span class="brand-mark">${icon('beacon')}</span><span>最后一盏灯<small>THE LAST LIGHT</small></span></a>
    <div class="header-right"><span class="version">生存策略 · v0.1</span><button class="quiet-button" data-action="help">${icon('help')}<span>作战指南</span></button><button class="icon-button" data-action="settings" aria-label="设置">${icon('settings')}</button></div>
  </header>
  <main class="shell">
    <section class="intro"><div><p class="eyebrow"><span class="status-dot"></span> 北境幸存者计划 / THE NORTHERN OUTPOST</p><h1>长夜将至，<em>灯火不熄。</em></h1><p class="intro-copy">搜寻物资，集结幸存者。守住迷雾中最后的希望。</p></div><div id="campaign" class="campaign"></div></section>
    <section class="resource-bar" aria-label="据点资源">
      <div class="resource">${icon('heart')}<div><span>灯塔耐久</span><strong id="health-value"></strong></div><div class="resource-meter"><i id="health-meter"></i></div></div>
      <div class="resource">${icon('box')}<div><span>储备材料</span><strong id="materials-value"></strong></div><small>探索 / 建设</small></div>
      <div class="resource">${icon('energy')}<div><span>剩余能源</span><strong id="energy-value"></strong></div><small id="energy-note"></small></div>
      <div class="resource">${icon('people')}<div><span>据点人口</span><strong id="population-value"></strong></div><small id="population-note"></small></div>
    </section>
    <div class="game-layout">
      <section class="field-column" aria-label="防守地图与战术控制">
        <div class="map-panel"><div class="panel-heading"><div class="panel-title">${icon('compass')}<h2>北境前哨</h2><span class="subtle">防御部署图</span></div><span id="phase-badge" class="phase-badge"></span></div>
          <div class="map-wrap"><canvas id="map" role="img" aria-label="北境前哨防御地图，包含感染者路线、12 个建造点、3 个小队防区与灯塔。请使用下方按钮部署。" width="1120" height="720"></canvas><div class="map-corner"><span class="map-live-dot"></span><span id="map-mode"></span></div></div>
          <div class="map-bottom"><span><i class="legend-dot amber"></i>灯塔</span><span><i class="legend-dot mint"></i>防御设施</span><span><i class="legend-dot red"></i>感染者路线</span><span class="map-coordinate">07° N · 42° E</span></div>
        </div>
        <div id="battle-strip" class="battle-strip"></div>
        <section class="control-panel"><div class="control-heading"><div><h2>${icon('beacon')}灯光控制</h2><p>光能指引归途，也会引来黑暗中的目光。</p></div><span id="drain-value" class="tiny-tag"></span></div><div id="light-controls" class="light-controls"></div><p class="control-footnote">探索收益：微光 −15% / 标准 / 强光 +20%；尸潮数量在开战时确定。</p></section>
        <section class="deployment-panel"><div class="section-line"><h2>战术部署</h2><span id="deployment-note"></span></div><div id="pad-controls" class="pad-controls" aria-label="选择建造点"></div><div id="selection-details" class="selection-details"></div><div id="squad-controls" class="squad-controls"></div></section>
        <section class="log-panel"><div class="section-line"><h2>${icon('flag')}前哨日志</h2><span>最新动态</span></div><ol id="logs"></ol></section>
      </section>
      <aside class="operations"><section id="mission" class="mission-card"></section><section class="build-panel"><div class="section-line"><h2>防线工坊</h2><span id="tower-count"></span></div><p class="panel-description">选择设施，再点击地图上的 ＋ 部署。</p><div id="tower-controls" class="tower-controls"></div><button id="repair-button" class="secondary-button full-width" data-action="repair">${icon('cross')}维修灯塔<span>20 材料 / +25 耐久</span></button></section><section id="camp" class="camp-panel"></section></aside>
    </div>
    <footer class="footer"><span>${icon('beacon')}每一束光，都值得守护。</span><span id="save-status" role="status"></span><button class="text-button" data-action="restart">重新开始</button></footer>
  </main><div id="toast" class="toast" role="status" aria-live="polite"></div><dialog id="dialog" aria-labelledby="dialog-title"></dialog>`;

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const dialog = byId<HTMLDialogElement>('dialog');
const canvas = byId<HTMLCanvasElement>('map');
let renderer: MapRenderer | null = null;
try { renderer = new MapRenderer(canvas); } catch (error) { toast(error instanceof Error ? error.message : '地图初始化失败。'); }
const htmlCache = new Map<string, string>();
function setHTML(id: string, html: string): void {
  if (htmlCache.get(id) !== html) { patchHTML(byId(id), html); htmlCache.set(id, html); }
}
function text(id: string, value: string): void { if (byId(id).textContent !== value) byId(id).textContent = value; }
function isPaused(): boolean { return userPaused || dialog.open || document.hidden; }
function toast(message: string): void {
  const element = byId('toast');
  element.textContent = message; element.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('visible'), 5500);
}
function persist(): void {
  const saved = saveGame(state, settings);
  if (!saved.ok && !saveFailed) toast(saved.message);
  saveFailed = !saved.ok;
  text('save-status', saved.ok ? '● 本机进度已保存' : '⚠ 进度仅本次有效');
}
function command(outcome: CommandResult, sound: 'click' | 'build' | 'pulse' = 'click'): void {
  toast(outcome.message);
  if (outcome.ok) { audio.play(sound, settings); persist(); }
  renderUI();
}
function renderUI(): void {
  const preparation = state.phase === 'preparation', night = state.phase === 'night', light = effectiveLight(state);
  const ended = state.phase === 'victory' || state.phase === 'defeat';
  text('health-value', `${Math.ceil(state.health)} / ${state.modifiers.maxHealth}`);
  byId('health-meter').style.width = `${state.health / state.modifiers.maxHealth * 100}%`;
  byId('health-meter').classList.toggle('danger', state.health < 30);
  text('materials-value', String(state.materials));
  text('energy-value', state.energy > 0 && state.energy < 1 ? '<1' : String(Math.floor(state.energy)));
  text('energy-note', night ? `−${(LIGHTS[light].drain * state.modifiers.efficiency).toFixed(2)} / 秒` : '夜间维持灯光');
  text('population-value', String(1 + state.survivors.length + state.squads.length * 3));
  text('population-note', `${state.survivors.length} 位专家 · ${state.squads.length} 支小队`);
  setHTML('campaign', `<span class="campaign-caption">五夜守望 / SURVIVE THE NIGHT</span><div class="campaign-day">DAY <strong>${String(state.day).padStart(2, '0')}</strong><span>/ 0${LAST_DAY}</span></div><div class="campaign-dots">${Array.from({ length: 5 }, (_, i) => `<i class="${i < state.stats.nightsSurvived ? 'complete' : i + 1 === state.day ? 'current' : ''}"></i>`).join('')}</div>`);
  const phaseName = { preparation: '白昼 · 准备', night: isPaused() ? '守夜 · 已暂停' : '夜幕 · 尸潮', upgrade: '黎明 · 强化', victory: '胜利 · 黎明已至', defeat: '灯塔已熄灭' }[state.phase];
  setHTML('phase-badge', `${icon(night ? 'moon' : 'sun')}${phaseName}`);
  byId('phase-badge').classList.toggle('night', night);
  text('map-mode', night ? `${state.enemies.length} 个目标 · ${isPaused() ? '模拟暂停' : '防线交战中'}` : preparation ? '点击建造点部署防线' : ended ? '本次守望结束' : '等待强化选择');
  text('deployment-note', preparation ? '可部署 / 调整' : '夜间及结算阶段不可施工');
  text('tower-count', `${state.towers.length} / ${PADS.length}`);
  text('drain-value', `耗能 ${(LIGHTS[light].drain * state.modifiers.efficiency).toFixed(2)} / 秒`);
  setHTML('light-controls', (Object.keys(LIGHTS) as LightLevel[]).map(id => `<button class="light-button ${light === id ? 'active' : ''}" data-action="light" data-value="${id}" aria-pressed="${light === id}" ${disabled(!preparation && !night || state.energy <= 0 && id !== 'low')}><span class="light-orb ${id}"></span><strong>${LIGHTS[id].name}</strong><small>${LIGHTS[id].subtitle}</small></button>`).join(''));
  setHTML('tower-controls', (Object.keys(TOWERS) as TowerKind[]).map(id => `<button class="tower-card ${selectedKind === id ? 'selected' : ''}" data-action="tower" data-value="${id}" aria-pressed="${selectedKind === id}" ${disabled(!preparation)}><span class="tower-symbol ${id}">${icon(id === 'frost' ? 'energy' : id === 'mortar' ? 'target' : 'shield')}</span><span class="tower-copy"><strong>${TOWERS[id].name}</strong><small>${TOWERS[id].description}</small></span><span class="price">${TOWERS[id].cost}<small>材料</small></span></button>`).join(''));
  byId<HTMLButtonElement>('repair-button').disabled = !preparation || state.health >= state.modifiers.maxHealth || state.materials < 20;
  setHTML('pad-controls', PADS.map((_, i) => {
    const tower = state.towers.find(t => t.padId === i);
    return `<button data-action="pad" data-value="${i}" class="pad-button ${tower ? 'occupied' : ''} ${selectedPad === i ? 'active' : ''}" aria-label="${tower ? `查看 ${String(i + 1).padStart(2, '0')} 号点${TOWERS[tower.kind].name}` : `在 ${String(i + 1).padStart(2, '0')} 号点建造${TOWERS[selectedKind].name}`}" aria-pressed="${selectedPad === i}" ${disabled(!preparation && !tower)}>${String(i + 1).padStart(2, '0')}${tower ? icon('shield') : '<span>＋</span>'}</button>`;
  }).join(''));
  const selectedTower = state.towers.find(t => t.padId === selectedPad);
  setHTML('selection-details', selectedTower ? `<span>${String(selectedTower.padId + 1).padStart(2, '0')} 号点 · ${TOWERS[selectedTower.kind].name}</span><button class="text-button" data-action="sell" ${disabled(!preparation)}>${icon('trash')}拆除 / 回收 ${Math.floor(TOWERS[selectedTower.kind].cost * 0.6)} 材料</button>` : `<span>${icon('target')}已选择${TOWERS[selectedKind].name}，部署需要 ${TOWERS[selectedKind].cost} 材料。</span>`);
  setHTML('squad-controls', `<div class="squad-label">${icon('people')}守备小队 <span>每队 3 人 · ${SQUAD_COST} 材料</span></div><div class="squad-buttons">${SQUAD_SPOTS.map((_, i) => {
    const deployed = state.squads.some(s => s.spotId === i);
    return `<button class="squad-button ${deployed ? 'deployed' : ''}" data-action="squad" data-value="${i}" ${disabled(!preparation || deployed || state.materials < SQUAD_COST)}>${icon(deployed ? 'check' : 'cross')}防区 ${['Ⅰ', 'Ⅱ', 'Ⅲ'][i]}<small>${deployed ? '已驻守' : '部署小队'}</small></button>`;
  }).join('')}</div>`);
  renderMission();
  setHTML('battle-strip', night ? `<div class="wave-info"><span class="live-indicator"></span><strong>第 ${state.day} 夜尸潮</strong><span>已抵御 ${state.battle.spawned - state.enemies.length} / ${state.battle.total}</span><div class="wave-bar"><i style="width:${(state.battle.spawned - state.enemies.length) / state.battle.total * 100}%"></i></div></div><div class="battle-buttons"><button class="quiet-button" data-action="speed" aria-label="切换战斗速度">${speed}×</button><button class="secondary-button" data-action="pause">${icon(userPaused ? 'play' : 'pause')}${userPaused ? '继续守夜' : '暂停'}</button></div>` : `<div class="field-tip">${icon('shield')}<span>${preparation ? '建议先探索，再部署 3 座设施或搭配守备小队。防线准备好后再入夜。' : state.phase === 'upgrade' ? '黎明带来片刻安宁。选择强化后，开启新一天的探索。' : state.phase === 'victory' ? '五个长夜，你守住了希望。' : '一次失守不意味着结束。调整火力与灯光，再试一次。'}</span></div>`);
  setHTML('camp', `<div class="section-line"><h2>${icon('people')}幸存者据点</h2><span>${state.survivors.length} / 3</span></div>${state.survivors.length ? state.survivors.map(id => `<div class="survivor"><span class="avatar ${id}">${SURVIVORS[id].name.slice(0, 1)}</span><div><strong>${SURVIVORS[id].name}<small>${SURVIVORS[id].role}</small></strong><p>${SURVIVORS[id].description}</p></div></div>`).join('') : '<p class="empty-camp">远处还有人等待救援。<br>白天探索，有机会带他们回家。</p>'}<div class="inventory"><span>特殊武器储备</span><div>${(Object.keys(WEAPONS) as WeaponId[]).map(id => `<span title="${WEAPONS[id].description}">${icon(id === 'molotov' ? 'fire' : 'target')}${WEAPONS[id].name}<b>×${state.weapons[id]}</b></span>`).join('')}</div></div>`);
  setHTML('logs', state.logs.slice(0, 5).map((entry, i) => `<li class="log-${entry.kind}"><span class="log-index">${i === 0 ? '最新' : '记录'}</span><p>${escape(entry.text)}</p></li>`).join(''));
}

function renderMission(): void {
  const phase = state.phase;
  let content = '';
  if (phase === 'preparation') {
    content = `<div class="mission-eyebrow">${icon('sun')}白昼行动</div><h2>${state.explored ? '物资已归，准备迎战。' : '天黑前，带希望回来。'}</h2><p class="mission-description">${state.explored ? '今天的探索已完成。利用补给部署防线，救援人员的能力将持续生效。' : '每天可探索一次。搜寻物资、特殊武器，也可能救回拥有独特能力的幸存者。'}</p><div class="expedition-list">${(Object.keys(LOCATIONS) as LocationId[]).map(id => `<button class="expedition-card" data-action="explore" data-value="${id}" ${disabled(state.explored)}><span class="expedition-icon">${icon(LOCATIONS[id].icon)}</span><span><strong>${LOCATIONS[id].name}<small>${LOCATIONS[id].subtitle}</small></strong><small>${LOCATIONS[id].description}</small></span>${icon(state.explored ? 'check' : 'arrow')}</button>`).join('')}</div><div class="mission-divider"></div><div class="night-forecast">${icon('moon')}预计本夜尸潮<strong>${nightEnemyCount(state.day, effectiveLight(state))} 只</strong></div><button class="primary-button full-width" data-action="start">${icon('moon')}迎接黑夜${icon('arrow')}</button><p class="small-note">开战前请部署设施或小队，夜间无法施工。</p>`;
  } else if (phase === 'night') {
    const cooldown = Math.ceil(state.battle.pulseCooldown);
    content = `<div class="mission-eyebrow danger-text">${icon('moon')}夜间防守</div><h2>让它们止步于光前。</h2><p class="mission-description">设施与守备小队正在自动交战。把握时机释放脉冲与特殊武器。</p><div class="night-stats"><div><strong>${state.enemies.length}</strong><span>在场感染者</span></div><div><strong>${state.battle.total - state.battle.spawned}</strong><span>仍在迷雾中</span></div><div><strong>${Math.floor(state.battle.elapsed)}<small>s</small></strong><span>已坚持</span></div></div><div class="zombie-types"><span><i class="legend-dot mint"></i>普通感染者</span><span><i class="legend-dot amber"></i>疾奔感染者</span>${state.day >= 2 ? '<span><i class="legend-dot purple"></i>重型变异体</span>' : ''}</div><button class="primary-button full-width pulse-button" data-action="pulse" ${disabled(isPaused() || state.energy < 12 || cooldown > 0 || !state.enemies.length)}>${icon('energy')}${cooldown > 0 ? `脉冲充能 ${cooldown}s` : '释放灯塔脉冲'}<small>12 能源</small></button><p class="small-note">全场伤害 45 × 火力倍率 · 冷却 18 秒</p><div class="weapon-buttons">${(Object.keys(WEAPONS) as WeaponId[]).map(id => `<button class="weapon-button" data-action="weapon" data-value="${id}" title="${WEAPONS[id].description}" ${disabled(isPaused() || state.weapons[id] === 0 || !state.enemies.length)}>${icon(id === 'molotov' ? 'fire' : 'target')}<strong>${WEAPONS[id].name}</strong><span>×${state.weapons[id]}</span></button>`).join('')}</div><p class="small-note">燃烧瓶：持续群伤 / 震荡弹：群体减速</p>`;
  } else if (phase === 'upgrade') {
    content = `<div class="mission-eyebrow">${icon('sun')}黎明奖励</div><h2>又一个黎明，新的希望。</h2><p class="mission-description">守过第 ${state.day} 夜，补给已到账。选择一项强化，进入明天。</p><div class="upgrade-list">${state.upgradeChoices.map(id => `<button class="upgrade-card" data-action="upgrade" data-value="${id}"><span class="tiny-tag">${UPGRADES[id].tag}</span><strong>${UPGRADES[id].name}</strong><p>${UPGRADES[id].description}</p><span class="upgrade-select">选择强化 ${icon('arrow')}</span></button>`).join('')}</div>`;
  } else {
    const victory = phase === 'victory';
    content = `<div class="mission-eyebrow">${icon(victory ? 'sun' : 'moon')}${victory ? '战役胜利' : '本局结束'}</div><div class="ending-symbol">${icon(victory ? 'beacon' : 'shield')}</div><h2>${victory ? '你守住了最后的光。' : '灯火暂熄，希望仍在。'}</h2><p class="mission-description">${victory ? '第五个黎明，远方终于传来回应。幸存者们会记住这束光。' : '带着经验重新部署，试着在弯道集中火力，善用小队、减速与特殊武器。'}</p><div class="ending-stats"><span>守住夜晚<strong>${state.stats.nightsSurvived} / 5</strong></span><span>击败感染者<strong>${state.stats.kills}</strong></span><span>营救专家<strong>${state.survivors.length}</strong></span><span>本局得分<strong>${state.stats.score}</strong></span></div><button class="primary-button full-width" data-action="restart">再守一次${icon('arrow')}</button>`;
  }
  setHTML('mission', content);
}

function selectPad(index: number): void {
  selectedPad = index;
  if (!state.towers.some(t => t.padId === index)) command(buildTower(state, selectedKind, index), 'build');
  else renderUI();
}
function openDialog(kind: 'help' | 'settings' | 'restart'): void {
  let title = '', body = '';
  if (kind === 'help') {
    title = '前哨作战指南';
    body = `<p class="dialog-intro">你是灯塔守护者。带领幸存者抵御五夜尸潮，等到救援的信号。</p><ol class="help-steps"><li><span>01</span><div><h3>白天 / 搜寻与救援</h3><p>每天最多探索一处地点，获取材料、能源与特殊武器，有机会救回工程师、医生或队长。首次探索保证救援一人并找到燃烧瓶。</p></div></li><li><span>02</span><div><h3>黄昏 / 部署防线</h3><p>选择设施，再点击地图的 ＋ 或下方编号按钮建造。弯道附近覆盖更长路线。可花 45 材料部署三人守备小队，白天可拆塔或维修。</p></div></li><li><span>03</span><div><h3>夜间 / 抵抗尸潮</h3><p>设施和小队自动攻击，感染者到达灯塔会扣耐久。脉冲消耗 12 能源，冷却 18 秒；特殊武器按次消耗。重型变异体从第二夜出现。</p></div></li><li><span>04</span><div><h3>黎明 / 选择强化</h3><p>清空当夜所有敌人并存活，获得补给和三选一强化。第五夜守住即获胜。灯光越强，射程与探索收益越高，耗能与开战时的尸潮数量也更多。</p></div></li></ol><div class="dialog-callout">空格：暂停 / 继续（夜间）。后台标签页自动暂停；进度每 3 秒保存在本机浏览器。战斗载入后需主动继续。</div><button class="primary-button full-width" data-action="close">明白了，守住灯火${icon('arrow')}</button>`;
  } else if (kind === 'settings') {
    title = '前哨设置';
    body = `<p class="dialog-intro">打开设置时，夜间战斗会暂停。</p><label class="setting-row"><span>开启音效<small>合成操作提示音，无背景音乐</small></span><input id="sound-enabled" type="checkbox" ${settings.muted ? '' : 'checked'} /></label><label class="volume-label" for="volume">音效音量 <span id="volume-label">${Math.round(settings.volume * 100)}%</span></label><input id="volume" type="range" min="0" max="100" value="${Math.round(settings.volume * 100)}" /><div class="dialog-callout">存档仅保存在当前浏览器。更换设备、清理站点数据或使用无痕模式可能导致进度丢失。</div><button class="primary-button full-width" data-action="close">保存并返回</button>`;
  } else {
    title = '重新点亮灯塔？';
    body = '<p class="dialog-intro">这会覆盖本机当前游戏进度，从第一天重新开始。音效设置会保留。</p><div class="dialog-actions"><button class="secondary-button" data-action="close">继续当前游戏</button><button class="primary-button" data-action="confirm-restart">确认重新开始</button></div>';
  }
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${title}</h2><button class="icon-button" data-action="close" aria-label="关闭弹窗">${icon('close')}</button></div>${body}`;
  dialog.showModal(); accumulator = 0; renderUI();
}
app.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
  if (!button || button.disabled) return;
  const value = button.dataset.value!;
  switch (button.dataset.action) {
    case 'help': openDialog('help'); break;
    case 'settings': openDialog('settings'); break;
    case 'close': dialog.close(); break;
    case 'restart': openDialog('restart'); break;
    case 'confirm-restart': state = createGame(); selectedPad = null; userPaused = false; speed = 1; accumulator = 0; dialog.close(); persist(); toast('新的守望开始了。'); renderUI(); break;
    case 'explore': command(explore(state, value as LocationId)); break;
    case 'tower': selectedKind = value as TowerKind; selectedPad = null; renderUI(); break;
    case 'pad': selectPad(Number(value)); break;
    case 'sell': if (selectedPad !== null) command(sellTower(state, selectedPad)); break;
    case 'repair': command(repairBeacon(state)); break;
    case 'squad': command(recruitSquad(state, Number(value)), 'build'); break;
    case 'light': command(setLight(state, value as LightLevel)); break;
    case 'start': userPaused = false; accumulator = 0; command(startNight(state)); break;
    case 'pulse': if (!isPaused()) command(usePulse(state), 'pulse'); break;
    case 'weapon': if (!isPaused()) command(useWeapon(state, value as WeaponId), 'pulse'); break;
    case 'upgrade': command(chooseUpgrade(state, value as UpgradeId)); break;
    case 'pause': userPaused = !userPaused; accumulator = 0; renderUI(); break;
    case 'speed': speed = speed === 1 ? 2 : 1; renderUI(); break;
  }
});
app.addEventListener('input', event => {
  const input = event.target as HTMLInputElement;
  if (input.id === 'volume') { settings.volume = Number(input.value) / 100; text('volume-label', `${input.value}%`); persist(); }
});
app.addEventListener('change', event => {
  const input = event.target as HTMLInputElement;
  if (input.id === 'sound-enabled') { settings.muted = !input.checked; audio.play('click', settings); persist(); }
});
dialog.addEventListener('close', () => { accumulator = 0; renderUI(); });
canvas.addEventListener('click', event => { const pad = renderer?.padAt(event.clientX, event.clientY); if (pad !== null && pad !== undefined) selectPad(pad); });
canvas.addEventListener('pointermove', event => { hoverPad = renderer?.padAt(event.clientX, event.clientY) ?? null; canvas.style.cursor = hoverPad !== null ? 'pointer' : 'default'; });
canvas.addEventListener('pointerleave', () => { hoverPad = null; });
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.repeat || dialog.open || state.phase !== 'night' || (event.target as Element).closest('button, input, a, select, textarea')) return;
  event.preventDefault(); userPaused = !userPaused; accumulator = 0; renderUI();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.phase === 'night') { userPaused = true; accumulator = 0; persist(); renderUI(); }
});
window.addEventListener('pagehide', persist);
function advanceSimulation(): void {
  const previousPhase = state.phase;
  tick(state, 0.05);
  if (state.phase !== previousPhase) {
    persist(); renderUI();
    if (state.phase === 'victory') audio.play('win', settings);
  }
}
function frame(time: number): void {
  const elapsed = lastTime ? Math.min((time - lastTime) / 1000, 0.2) : 0;
  lastTime = time;
  if (!isPaused()) {
    visualTime += elapsed;
    if (state.phase === 'night') {
      accumulator += elapsed * speed;
      while (accumulator >= 0.05 && state.phase === 'night') {
        advanceSimulation(); accumulator -= 0.05;
      }
    } else accumulator = 0;
  }
  renderer?.draw(state, hoverPad ?? selectedPad, selectedKind, visualTime, isPaused());
  uiElapsed += elapsed; saveElapsed += elapsed;
  if (uiElapsed >= 0.15) { renderUI(); uiElapsed = 0; }
  if (saveElapsed >= 3 && state.phase === 'night' && !isPaused()) { persist(); saveElapsed = 0; }
  requestAnimationFrame(frame);
}
renderUI();
persist();
if (loaded.message) toast(loaded.message + (userPaused ? '点击“继续守夜”恢复战斗。' : ''));
requestAnimationFrame(frame);
