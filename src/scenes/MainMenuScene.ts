import Phaser from 'phaser';
import { GAME_VERSION } from '../core/scoring.ts';
import { DIFFICULTIES, difficultyFrom, type Difficulty } from '../config/difficulty.ts';
import { STAGES, STAGE_COUNT } from '../config/progression.ts';
import { STORY_CHAPTERS, hasSeenStory } from '../config/story.ts';
import { canContinue, difficulty, loadContinue, savedStage, startNewGame, updateRun } from '../services/game-session.ts';
import { onlinePanel } from '../view/LeaderboardPanel.ts';
import { HERO_IDS, SURVIVOR_PROFILES } from '../config/survivors.ts';

/** 游戏入口与辅助阅读使用 DOM，保留键盘焦点和小屏滚动。游戏模拟只在开始后创建。 */
export class MainMenuScene extends Phaser.Scene {
  private root!: HTMLElement;
  private dialog: HTMLElement | null = null;
  constructor() { super('MainMenu'); }
  create(): void {
    updateRun(false); onlinePanel.setInGame(false); document.body.classList.add('menu-open');
    const menuUrl = new URL(location.href); menuUrl.search = new URLSearchParams(location.search).get('test') === '1' ? '?test=1' : ''; history.replaceState(null, '', menuUrl);
    this.root = document.createElement('main'); this.root.className = 'main-menu'; this.root.setAttribute('aria-label', '主菜单');
    const shell = document.createElement('div'); shell.className = 'menu-shell';
    const mast = document.createElement('header'); mast.className = 'menu-mast'; mast.innerHTML = '<span>北境守备档案 / 05</span><span>探索 · 建设 · 守夜</span>'; shell.append(mast);
    const hero = document.createElement('section'); hero.className = 'menu-hero';
    const intro = document.createElement('div'); intro.className = 'menu-intro';
    const kicker = document.createElement('p'); kicker.className = 'menu-kicker'; kicker.textContent = 'THE LAST LIGHT';
    const title = document.createElement('h1'); title.textContent = '最后一盏灯';
    const lead = document.createElement('p'); lead.className = 'menu-lead'; lead.textContent = '黑雾吞没旧城。你带回的每一份物资，\n都将成为下一个黎明的希望。';
    const selectLabel = document.createElement('label'); selectLabel.className = 'menu-difficulty'; selectLabel.textContent = '战役难度';
    const select = document.createElement('select'); select.setAttribute('aria-label', '游戏难度');
    for (const [id, preset] of Object.entries(DIFFICULTIES)) { const o = document.createElement('option'); o.value = id; o.textContent = preset.name; select.append(o); }
    select.value = difficulty; selectLabel.append(select);
    const detail = document.createElement('p'); detail.className = 'menu-difficulty-detail';
    const describe = () => { const d = DIFFICULTIES[difficultyFrom(select.value)]; detail.textContent = `${d.description} 敌人生命 ×${d.health.toFixed(2)} / 数量 ×${d.count.toFixed(2)}`; }; describe(); select.addEventListener('change', describe);
    const actions = document.createElement('div'); actions.className = 'menu-actions';
    const start = this.button('开始新游戏', () => {
      const launch = () => this.start(difficultyFrom(select.value));
      if (canContinue()) this.showDialog('开始新的战役？', ['当前营地和阶段进度将由新战役替代，排行榜上已经提交的成绩保留。'], [this.button('确认开始新游戏', launch)]);
      else launch();
    }); start.className = 'menu-primary'; actions.append(start);
    const next = savedStage();
    if (canContinue()) actions.append(this.button('继续游戏', () => {
      const checkpoint = loadContinue(); if (!checkpoint) return;
      onlinePanel.forgetResult(); onlinePanel.close();
      this.setPlayUrl(checkpoint.difficulty);
      this.scene.start(checkpoint.phase === 'day' ? 'Combat' : 'Base', { campaign: checkpoint.campaign, seed: checkpoint.seed, fresh: checkpoint.phase === 'base', battle: checkpoint.phase === 'night' });
    }));
    const save = document.createElement('p'); save.className = 'menu-save-note'; save.textContent = canContinue() ? `继续游戏将从阶段 ${next?.stage ?? '已保存营地'} 的起点恢复，保留之前已完成阶段。` : '五个阶段，五次黎明。准备好后，提灯出发。';
    intro.append(kicker, title, lead, selectLabel, detail, actions, save);
    const art = document.createElement('div'); art.className = 'menu-art'; art.setAttribute('aria-hidden', 'true');
    const beam = document.createElement('div'); beam.className = 'menu-beam';
    const lamp = document.createElement('img'); lamp.src = import.meta.env.BASE_URL + 'assets/weapons/lighthouse.svg'; lamp.alt = ''; lamp.className = 'menu-lighthouse';
    const caption = document.createElement('p'); caption.textContent = '守住灯火，等到黎明。'; art.append(beam, lamp, caption); hero.append(intro, art); shell.append(hero);
    const nav = document.createElement('nav'); nav.className = 'menu-links'; nav.setAttribute('aria-label', '游戏功能');
    nav.append(this.card('01', '排行榜', '通关总用时 · 综合得分', () => onlinePanel.open('board')),
      this.card('02', '游戏背景', '旧城、黑雾与守灯人的故事', () => this.showDialog('游戏背景', STORY_CHAPTERS.map(c => `${c.title}\n${c.text}`), [this.button('观看开场', () => this.scene.start('Prologue', { returnToMenu: true }))])),
      this.card('03', '操作指南', '探索、布防、守夜与阶段重开', () => this.showGuide())); shell.append(nav);
    const progress = document.createElement('section'); progress.className = 'menu-campaign';
    const ptitle = document.createElement('h2'); ptitle.textContent = '五夜战役'; progress.append(ptitle);
    const list = document.createElement('ol');
    for (const [id, stage] of Object.entries(STAGES)) { const li = document.createElement('li'); li.innerHTML = `<span>${id.padStart(2, '0')}</span><strong>${stage.name}</strong>`; list.append(li); }
    progress.append(list); shell.append(progress);
    const heroes = document.createElement('section'); heroes.className = 'menu-heroes'; const heroTitle = document.createElement('h2'); heroTitle.textContent = '搜救英雄 · 第2—5阶段逐一开放'; heroes.append(heroTitle);
    const heroList = document.createElement('div'); heroList.className = 'menu-hero-list';
    for (const id of HERO_IDS) { const p = SURVIVOR_PROFILES[id], card = document.createElement('div'); card.title = p.ability; const art = document.createElement('span'); art.className = 'menu-hero-portrait'; art.style.backgroundImage = `url("${import.meta.env.BASE_URL}assets/heroes/${id}.svg")`; art.setAttribute('aria-hidden', 'true'); const name = document.createElement('strong'), role = document.createElement('small'); name.textContent = p.name; role.textContent = `阶段${p.stage} · ${p.role.replace('英雄·', '')}`; card.append(art, name, role); heroList.append(card); }
    heroes.append(heroList); shell.append(heroes);
    const footer = document.createElement('footer'); footer.className = 'menu-footer'; footer.textContent = `v${GAME_VERSION} · 完成 ${STAGE_COUNT} 个阶段即通关 · 进度保存在当前浏览器`; shell.append(footer);
    this.root.append(shell); document.body.append(this.root);
    const key = (event: KeyboardEvent) => { if (onlinePanel.visible) return; event.stopImmediatePropagation(); if (event.key === 'Escape') { event.preventDefault(); this.closeDialog(); } };
    window.addEventListener('keydown', key, true);
    this.events.once('shutdown', () => { window.removeEventListener('keydown', key, true); this.root.remove(); document.body.classList.remove('menu-open'); onlinePanel.setInGame(true); });
    document.getElementById('loading')?.remove();
  }
  private button(label: string, action: () => void): HTMLButtonElement { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', action); return b; }
  private card(number: string, title: string, subtitle: string, action: () => void): HTMLButtonElement {
    const b = this.button('', action); b.className = 'menu-card'; b.setAttribute('aria-label', title);
    const n = document.createElement('span'), t = document.createElement('strong'), s = document.createElement('small'); n.textContent = number; t.textContent = title; s.textContent = subtitle; b.append(n, t, s); return b;
  }
  private setPlayUrl(selected: Difficulty): void { const url = new URL(location.href); url.search = new URLSearchParams({ play: '1', difficulty: selected, intro: '0', ...(new URLSearchParams(location.search).get('test') === '1' ? { test: '1' } : {}) }).toString(); history.replaceState(null, '', url); }
  private start(selected: Difficulty): void {
    this.setPlayUrl(selected); const campaign = startNewGame(selected); onlinePanel.forgetResult(); onlinePanel.close();
    this.scene.start(hasSeenStory() ? 'Combat' : 'Prologue', { campaign });
  }
  private closeDialog(): void { this.dialog?.remove(); this.dialog = null; }
  private showDialog(title: string, paragraphs: readonly string[], actions: HTMLElement[] = []): void {
    this.closeDialog(); const shade = document.createElement('div'); shade.className = 'menu-modal';
    const box = document.createElement('section'); box.role = 'dialog'; box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', title);
    const h = document.createElement('h2'); h.textContent = title; box.append(h);
    for (const value of paragraphs) { const p = document.createElement('p'); p.textContent = value; box.append(p); }
    const row = document.createElement('div'); row.className = 'menu-modal-actions'; row.append(...actions, this.button('返回主菜单', () => this.closeDialog())); box.append(row); shade.append(box); this.root.append(shade); this.dialog = shade;
    row.querySelector('button')?.focus();
  }
  private showGuide(): void {
    this.showDialog('操作指南', [
      '白天探索\nWASD移动，Shift冲刺；鼠标瞄准、左键射击。E搜刮/营救/回营，R换弹，1–4切武器，H使用急救包，Tab背包。探索最多90秒，可提前返营；普通搜救人员每趟换位刷新，英雄唯一；已搜箱子保持搬空。背包与补给逐阶段成长。',
      '黄昏布防\n数字1–9与0选设施，左键建设；5可拖动铺墙。框选/Space全选守卫，右键移动，G驻守，R旋转沙袋，U改装，X拆除。0防空火炮（阶段2）、J震地锤（阶段3）、9重型狙击塔与K灼光塔（阶段4）、H苍穹重炮（阶段5）。金线随阶段向四周扩张；不限时，点击完成布防或Enter才入夜。',
      '夜晚守灯\n守军自动攻击，调动队形、按F选择支援落点。守住120秒进入下一阶段；前四夜可直接布防或选择回城探索，第五夜胜利后通关结算。',
      '镜头与进度\n灯塔默认居中。WASD或小地图可临时浏览，C锁回灯塔，滚轮缩放。P/Esc暂停、F1指南、T倍速、M静音、L配乐、V减少动态。底部可重开本阶段、主动结算或返回主菜单。',
      '榜单规则\n通关用时包含探索、布防与守夜的游戏内活动时间；暂停不计，倍速不减少同一守夜的计入时长。总用时与综合得分分别排行，各难度独立。布防按实际活动时间计入总用时和效率评分，暂停不计、倍速不加快布防计时。重新开始阶段会放弃本阶段物资、建设、击杀和用时，保留已过阶段。',
    ]);
  }
}
