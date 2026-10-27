import { calculateScore, formatDuration, normalizeNickname, validNickname, SCOPE_NAMES, OUTCOME_NAMES, type BoardType, type RankDifficulty, type ScoreScope, type ScoreSubmission } from '../core/scoring.ts';
import { ApiError, NICKNAME_KEY, PENDING_KEY, apiConfigured, getLeaderboard, loadPending, readLocal, submitScore, writeLocal, type PendingScore } from '../services/leaderboard.ts';
import { rankedRun } from '../services/game-session.ts';
import { DIFFICULTIES } from '../config/difficulty.ts';
import { STAGE_COUNT } from '../config/progression.ts';

/** DOM 只承担表单与滚动表格；打开时通过统一事件暂停 Phaser，关闭后恢复原暂停状态。 */
export class LeaderboardPanel {
  visible = false;
  private overlay = document.createElement('div');
  private content = document.createElement('div');
  private heading = document.createElement('h1');
  private tabs = document.createElement('div');
  private pending: PendingScore | null = loadPending();
  private board: BoardType = 'speed';
  private difficulty: RankDifficulty = rankedRun?.difficulty ?? 'normal';
  private page: 'board' | 'result' | 'end' | 'restart' | 'menu' = 'board';
  private scope: ScoreScope = 'clear';
  private actions: { end: () => void; restart: () => void; menu: () => void } | null = null;
  private dock: HTMLElement;
  private restartButton: HTMLButtonElement;
  private menuButton: HTMLButtonElement;
  private closeButton: HTMLButtonElement;
  private endButton: HTMLButtonElement;
  private generation = 0;
  private sending = false;
  private returnFocus: HTMLElement | null = null;
  private resultButton: HTMLButtonElement;
  constructor() {
    const dock = document.createElement('nav'); this.dock = dock; dock.className = 'online-ui online-dock'; dock.setAttribute('aria-label', '游戏菜单');
    this.menuButton = this.button('主菜单', () => rankedRun.result ? this.actions?.menu() : this.open('menu')); this.menuButton.disabled = true; dock.append(this.menuButton);
    dock.append(this.button('排行榜', () => this.open('board')));
    this.resultButton = this.button('本局成绩', () => this.open('result')); this.resultButton.hidden = !this.pending; dock.append(this.resultButton);
    this.endButton = this.button('结束并结算', () => this.open('end')); this.endButton.disabled = true; dock.append(this.endButton);
    this.restartButton = this.button('重新开始阶段', () => this.open('restart')); this.restartButton.disabled = true; dock.append(this.restartButton); document.body.append(dock);
    this.overlay.className = 'online-ui online-overlay'; this.overlay.hidden = true;
    const dialog = document.createElement('section'); dialog.className = 'online-dialog'; dialog.role = 'dialog'; dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'online-title');
    const top = document.createElement('header'), kicker = document.createElement('p'); kicker.className = 'online-kicker'; kicker.textContent = 'THE LAST LIGHT / 守灯人档案';
    this.heading.id = 'online-title'; this.heading.tabIndex = -1;
    const close = this.button('返回游戏 ×', () => this.close()); this.closeButton = close; close.className = 'online-close'; top.append(kicker, this.heading, close);
    this.tabs.className = 'online-tabs'; this.content.className = 'online-content';
    const foot = document.createElement('footer'); foot.textContent = '各难度独立排名 · 五阶段完整通关 · 总用时榜与综合得分榜';
    dialog.append(top, this.tabs, this.content, foot); this.overlay.append(dialog); document.body.append(this.overlay);
    // Phaser 会把 DOM 按键排队到下一帧再分发；必须在捕获阶段截住，
    // 否则关闭面板后，同一个 Esc/Enter 会再次触发游戏暂停或重试。
    window.addEventListener('keydown', event => {
      if (!this.visible) return;
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      if (event.key === 'Tab') {
        const nodes = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, a[href]')].filter(n => !n.hidden && n.getClientRects().length);
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === this.heading)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }, true);
    // 表单键盘输入不交给 Phaser；Enter 提交也不会重试游戏。
    window.addEventListener('keyup', e => { if (this.visible) e.stopImmediatePropagation(); }, true);
  }
  private button(label: string, action: () => void): HTMLButtonElement {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', action); return b;
  }
  private link(label: string, params: Record<string, string>): HTMLAnchorElement {
    const a = document.createElement('a'), url = new URL(location.href); a.textContent = label;
    url.search = new URLSearchParams({ ...params, intro: '0' }).toString(); a.href = url.toString(); return a;
  }
  setSessionActions(actions: { end: () => void; restart: () => void; menu: () => void } | null): void {
    this.actions = actions; this.endButton.disabled = !actions || !!rankedRun.result; this.restartButton.disabled = !actions; this.menuButton.disabled = !actions;
  }
  setInGame(value: boolean): void { this.dock.hidden = !value; this.closeButton.textContent = value ? '返回游戏 ×' : '返回主菜单 ×'; }
  forgetResult(): void { this.pending = null; this.resultButton.hidden = true; try { localStorage.removeItem(PENDING_KEY); } catch { /* 本页状态已清除。 */ } }
  remember(result: Omit<ScoreSubmission, 'nickname'>, campaignComplete = false): void {
    if (this.pending?.result.runId !== result.runId) this.pending = { result };
    if (campaignComplete) this.pending.campaignComplete = true;
    writeLocal(PENDING_KEY, JSON.stringify(this.pending)); this.resultButton.hidden = false; this.endButton.disabled = true;
  }
  open(page: 'board' | 'result' | 'end' | 'restart' | 'menu' = 'board'): void {
    if (!this.visible) {
      this.returnFocus = document.activeElement as HTMLElement | null; this.visible = true; this.overlay.hidden = false;
      window.dispatchEvent(new CustomEvent('last-light:online', { detail: true }));
    }
    this.page = page; this.render(); this.heading.focus();
  }
  close(): void {
    if (!this.visible) return;
    this.visible = false; this.overlay.hidden = true; this.generation++;
    window.dispatchEvent(new CustomEvent('last-light:online', { detail: false }));
    // 返回游戏时把焦点交还画布，避免 Space/Enter 再次激活底部入口按钮。
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    if (canvas && this.returnFocus?.closest('.online-dock')) { canvas.tabIndex = 0; canvas.focus(); }
    else this.returnFocus?.focus();
  }
  private render(): void {
    this.generation++; this.content.replaceChildren(); this.tabs.replaceChildren();
    if (this.page === 'end' || this.page === 'restart' || this.page === 'menu') {
      const page = this.page;
      this.heading.textContent = page === 'restart' ? '重新开始本阶段？' : page === 'menu' ? '返回主菜单？' : '结束这一局，保留你的成绩。';
      const note = document.createElement('p'); note.textContent = page === 'restart' ? '放弃本阶段的探索收获、建造、击杀和用时，恢复到本阶段起点。之前完成的阶段与奖励保留。' : page === 'menu' ? '本阶段将保留起点存档。之后选择继续游戏，会从本阶段开始时恢复。' : '立即停止计时与战斗，结算当前探索、击杀和已通关阶段。未完成五阶段的成绩进入挑战榜。'; this.content.append(note);
      const confirm = this.button(page === 'restart' ? '确认重新开始本阶段' : page === 'menu' ? '确认返回主菜单' : '确认结束本局', () => { const actions = this.actions; if (page === 'restart') actions?.restart(); else if (page === 'menu') actions?.menu(); else actions?.end(); }); confirm.disabled = !this.actions || page === 'end' && !!rankedRun.result;
      this.content.append(confirm, this.button('继续游玩', () => this.close())); return;
    }
    this.heading.textContent = this.page === 'result' ? '五夜已尽，灯火长明。' : '守灯人排行榜';
    if (this.page === 'result' && this.pending) { this.renderResult(this.pending); return; }
    this.page = 'board';
    for (const [id, name] of [['speed', '极速通关榜'], ['score', '综合得分榜']] as const) {
      const b = this.button(name, () => { this.board = id; this.render(); }); b.disabled = id === 'speed' && this.scope !== 'clear'; b.setAttribute('aria-pressed', String(this.board === id)); this.tabs.append(b);
    }
    const scopeLabel = document.createElement('label'); scopeLabel.textContent = '榜单范围 ';
    const scopeSelect = document.createElement('select'); scopeSelect.setAttribute('aria-label', '榜单范围');
    for (const [id, name] of Object.entries(SCOPE_NAMES)) { const o = document.createElement('option'); o.value = id; o.textContent = name; scopeSelect.append(o); }
    scopeSelect.value = this.scope; scopeSelect.addEventListener('change', () => { this.scope = scopeSelect.value as ScoreScope; if (this.scope !== 'clear') this.board = 'score'; this.render(); }); scopeLabel.append(scopeSelect); this.tabs.append(scopeLabel);
    const label = document.createElement('label'); label.textContent = '游戏难度 ';
    const select = document.createElement('select'); select.setAttribute('aria-label', '游戏难度');
    for (const [id, preset] of Object.entries(DIFFICULTIES)) { const o = document.createElement('option'); o.value = id; o.textContent = preset.name; select.append(o); }
    select.value = this.difficulty; select.addEventListener('change', () => { this.difficulty = select.value as RankDifficulty; this.render(); }); label.append(select); this.tabs.append(label);
    const intro = document.createElement('p'); intro.className = 'online-note'; intro.textContent = '前 20 名 · 总用时包含探索、布防和守夜的游戏内进度；暂停、失焦和结算等待不计时。倍速不减少固定守夜用时。'; this.content.append(intro);
    const status = document.createElement('p'); status.className = 'online-status'; status.role = 'status'; status.textContent = '正在连接灯塔档案…'; this.content.append(status);
    this.content.append(this.button('刷新榜单', () => this.render()));
    const links = document.createElement('div'); links.className = 'online-start';
    const note = document.createElement('p'); note.textContent = '五阶段战役 · 通关用时包含探索、布防与守夜 · 暂停不计时，倍速不降低固定阶段用时'; links.append(note);
    for (const [id, preset] of Object.entries(DIFFICULTIES)) {
      const name = preset.name;
      const a = document.createElement('a'); a.textContent = `开始${name}排名战役 →`; const url = new URL(location.href); url.search = new URLSearchParams({ ranked: '1', difficulty: id, intro: '0' }).toString(); a.href = url.toString(); links.append(a);
    }
    links.append(this.link('前往主菜单 →', {}));
    status.before(links);
    const generation = this.generation;
    if (!apiConfigured) { status.textContent = '尚未配置在线服务。可继续单机游玩，管理员配置 API 后即可联网。'; return; }
    void getLeaderboard(this.board, this.difficulty, this.scope).then(result => {
      if (generation !== this.generation || !this.visible) return;
      if (!Array.isArray(result.entries)) throw new Error('榜单响应格式错误');
      status.textContent = result.entries.length ? `共展示 ${result.entries.length} 条成绩 · 评分版本 ${result.scoreVersion}` : '档案尚空，期待第一位守灯人。';
      if (!result.entries.length) return;
      const wrap = document.createElement('div'); wrap.className = 'online-table-wrap'; const table = document.createElement('table');
      const head = table.createTHead().insertRow(); for (const name of ['排名', '守灯人', '游玩用时', '综合得分', '难度', '结果', '倍速']) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = name; head.append(th); }
      const body = table.createTBody();
      result.entries.forEach((entry, i) => { const row = body.insertRow(); for (const value of [String(i + 1).padStart(2, '0'), entry.nickname, formatDuration(entry.durationMs), entry.score.toLocaleString('zh-CN'), DIFFICULTIES[entry.difficulty].name, OUTCOME_NAMES[entry.outcome ?? 'victory'], `≤×${entry.maxSpeed}`]) row.insertCell().textContent = value; });
      wrap.append(table); status.after(wrap);
    }).catch(error => { if (generation === this.generation && this.visible) status.textContent = error instanceof Error ? error.message : '读取失败，请重试。'; });
  }
  private renderResult(pending: PendingScore): void {
    const r = pending.result, parts = calculateScore(r.stages, r.durationMs, r);
    this.heading.textContent = r.completed || pending.campaignComplete ? '五夜已尽，灯火长明。' : r.outcome === 'defeat' ? '灯火熄灭，本局结束。' : '本局已结算，灯火仍在。';
    const badge = document.createElement('p'); badge.className = 'online-note'; badge.textContent = `${SCOPE_NAMES[r.scope]} · ${OUTCOME_NAMES[r.outcome]} · 已通关 ${r.stages.filter(s => s.cleared !== false).length}/${STAGE_COUNT} 阶段`; this.content.append(badge);
    if (pending.campaignComplete && !r.completed) { const note = document.createElement('p'); note.className = 'online-note'; note.textContent = '战役已通关。本次从旧营地继续，成绩仅记录本次会话，归入挑战榜；新游戏可记录完整五阶段用时。'; this.content.append(note); }
    const stats = document.createElement('div'); stats.className = 'online-stats';
    for (const [label, value] of [['游戏难度', DIFFICULTIES[r.difficulty].name], ['战役总用时', formatDuration(r.durationMs)], ['综合得分', r.score.toLocaleString('zh-CN')]]) {
      const item = document.createElement('div'), small = document.createElement('span'), big = document.createElement('strong'); small.textContent = label; big.textContent = value; item.append(small, big); stats.append(item);
    }
    this.content.append(stats);
    const timing = document.createElement('p'); timing.className = 'online-breakdown'; timing.textContent = `探索 ${formatDuration(r.phaseTimesMs.day)} + 布防 ${formatDuration(r.phaseTimesMs.base)} + 守夜 ${formatDuration(r.phaseTimesMs.night)} · 实际活动 ${formatDuration(r.totalDurationMs)}`; this.content.append(timing);
    const breakdown = document.createElement('p'); breakdown.className = 'online-breakdown'; breakdown.textContent = `阶段/通关 ${parts.victory} + 击杀 ${parts.combat} + Boss ${parts.bosses} + 灯塔 ${parts.lighthouse} + 守卫 ${parts.defenders} + 探索 ${parts.exploration} + 效率 ${parts.efficiency} · 最高 ×${r.maxSpeed}`; this.content.append(breakdown);
    const form = document.createElement('form'), label = document.createElement('label'); label.textContent = '留下你的守灯人昵称';
    const input = document.createElement('input'); input.name = 'nickname'; input.setAttribute('aria-label', '玩家昵称'); input.setAttribute('autocomplete', 'nickname'); input.maxLength = 16; input.placeholder = '2–16个中英文字或数字'; input.value = pending.payload?.nickname ?? readLocal(NICKNAME_KEY); input.disabled = Boolean(pending.payload); label.append(input);
    const status = document.createElement('p'); status.className = 'online-status'; status.role = 'status'; status.textContent = pending.submitted ? `成绩已收录${pending.ranks ? ` · ${SCOPE_NAMES[r.scope]}综合得分第 ${pending.ranks.score} 名${pending.ranks.speed ? ` · 极速第 ${pending.ranks.speed} 名` : ''}` : ''}。` : pending.payload ? '已保留原提交；重试使用同一战役 ID 和内容。' : '本局已结束。提交后显示真实名次；昵称可重复，不作为账号。';
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = pending.submitted ? '已提交 ✓' : this.sending ? '正在提交…' : pending.payload ? '重试提交' : '提交成绩'; submit.disabled = Boolean(pending.submitted) || this.sending;
    const edit = this.button('修改昵称', () => { input.disabled = false; input.focus(); }); edit.hidden = Boolean(pending.payload);
    const view = this.button('查看排行榜 →', () => { this.page = 'board'; this.scope = r.scope; this.board = 'score'; this.difficulty = r.difficulty; this.render(); });
    form.append(label, status, submit, edit, view); this.content.append(form);
    const next = document.createElement('div'); next.className = 'online-start'; next.append(this.link('开始新游戏 →', {}));
    if (this.actions) next.append(this.button('重新开始本阶段', () => this.open('restart')), this.button('返回主菜单', () => this.actions?.menu())); this.content.append(next);
    this.resultStandings(r);
    form.addEventListener('submit', event => {
      event.preventDefault(); if (this.sending || pending.submitted) return;
      if (!apiConfigured) { status.textContent = '尚未配置在线服务。成绩已保留，请等待管理员配置 API。'; return; }
      const nickname = normalizeNickname(input.value);
      if (!validNickname(nickname)) { status.textContent = '昵称需为2–16个中英文字、数字、单空格、_、-或·。'; input.focus(); return; }
      pending.payload ??= { ...r, nickname }; // 第一次发出后固定载荷；超时后不能变更昵称造成不确定写入。
      input.value = pending.payload.nickname; input.disabled = true; edit.hidden = true;
      writeLocal(NICKNAME_KEY, pending.payload.nickname);
      const saved = writeLocal(PENDING_KEY, JSON.stringify(pending));
      this.sending = true; submit.disabled = true; submit.textContent = '正在提交…'; status.textContent = saved ? '正在发送，网络失败后可安全重试。' : '浏览器存储不可用；请保留本页以便重试。';
      void submitScore(pending.payload).then(response => {
        pending.submitted = true; pending.ranks = response.ranks; writeLocal(PENDING_KEY, JSON.stringify(pending)); status.textContent = `成绩已收录${response.ranks ? ` · 综合得分第 ${response.ranks.score} 名` : ''}。`;
      }).catch(error => {
        status.textContent = error instanceof ApiError ? error.message : '提交失败，请重试。';
      }).finally(() => {
        this.sending = false; submit.disabled = Boolean(pending.submitted); submit.textContent = pending.submitted ? '已提交 ✓' : '重试提交';
        if (this.visible && this.page === 'result' && (pending.submitted || !form.isConnected)) this.render();
      });
    });
  }
  private resultStandings(result: Omit<ScoreSubmission, 'nickname'>): void {
    const section = document.createElement('section'), title = document.createElement('p'), list = document.createElement('ol');
    section.className = 'online-result-board'; title.textContent = `${SCOPE_NAMES[result.scope]} · 当前前 5 名`; section.append(title, list); this.content.append(section);
    if (!apiConfigured) { list.textContent = '在线服务尚未配置，本局成绩已保留。'; return; }
    const generation = this.generation;
    void getLeaderboard('score', result.difficulty, result.scope).then(board => {
      if (generation !== this.generation || !section.isConnected) return;
      if (!board.entries.length) { list.textContent = '当前暂无记录，提交后即可获得名次。'; return; }
      board.entries.slice(0, 5).forEach(entry => { const li = document.createElement('li'); li.textContent = `${entry.nickname} · ${entry.score.toLocaleString('zh-CN')} 分 · ${formatDuration(entry.durationMs)}`; list.append(li); });
    }).catch(() => { if (section.isConnected) list.textContent = '榜单暂时不可用，可稍后重试。'; });
  }
}
export const onlinePanel = new LeaderboardPanel();
export function bindOnlinePanel(getPaused: () => boolean, setPaused: (paused: boolean) => void): () => void {
  let previous = getPaused();
  const change = (event: Event) => {
    if ((event as CustomEvent<boolean>).detail) { previous = getPaused(); setPaused(true); }
    else setPaused(previous || document.hidden);
  };
  const blur = () => { if (onlinePanel.visible) previous = true; };
  window.addEventListener('last-light:online', change); window.addEventListener('blur', blur);
  if (onlinePanel.visible) setPaused(true);
  return () => { window.removeEventListener('last-light:online', change); window.removeEventListener('blur', blur); };
}
