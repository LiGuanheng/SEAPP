import { COLS, ENEMIES, PADS, PATH, ROWS, SQUAD_SPOTS, TOWERS, positionAt } from '../game/data.ts';
import { effectiveLight, towerRange } from '../game/engine.ts';
import type { GameState, TowerKind } from '../game/types.ts';

const CELL = 80, WIDTH = COLS * CELL, HEIGHT = ROWS * CELL;
export class MapRenderer {
  private ctx: CanvasRenderingContext2D;
  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('此浏览器不支持 Canvas 2D，请使用现代浏览器。');
    this.ctx = ctx;
  }
  padAt(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width * COLS - 0.5;
    const y = (clientY - rect.top) / rect.height * ROWS - 0.5;
    const index = PADS.findIndex(p => Math.hypot(x - p.x, y - p.y) < 0.48);
    return index === -1 ? null : index;
  }
  draw(state: GameState, selection: number | null, buildKind: TowerKind, time: number, paused: boolean): void {
    const ctx = this.ctx, rect = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.round(width * HEIGHT / WIDTH);
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    ctx.setTransform(width / WIDTH, 0, 0, height / HEIGHT, 0, 0);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const night = state.phase === 'night';
    ctx.fillStyle = night ? '#101c24' : '#18272d'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const background = ctx.createRadialGradient(850, 350, 20, 560, 360, 700);
    background.addColorStop(0, night ? '#27302b' : '#2b3934'); background.addColorStop(1, '#142329');
    ctx.fillStyle = background; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // 确定性地表装饰，无外部素材，也不消耗游戏随机数。
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const hash = ((x * 37 + y * 71 + x * y * 11) % 19);
      const px = (x + 0.5) * CELL, py = (y + 0.5) * CELL;
      ctx.strokeStyle = '#ffffff04'; ctx.strokeRect(x * CELL, y * CELL, CELL, CELL);
      if (hash < 6 && !PADS.some(p => p.x === x && p.y === y) && !this.onRoad(x, y)) {
        ctx.fillStyle = '#26383a';
        ctx.beginPath(); ctx.ellipse(px - 10, py + 9, 21 + hash, 9, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#324345';
        ctx.beginPath(); ctx.moveTo(px - 27, py + 5); ctx.lineTo(px - 13, py - 16 - hash); ctx.lineTo(px + 9, py - 11); ctx.lineTo(px + 17, py + 8); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#49605a55'; ctx.beginPath(); ctx.moveTo(px - 13, py - 16 - hash); ctx.lineTo(px - 5, py + 5); ctx.stroke();
      } else if (hash > 13 && !this.onRoad(x, y)) {
        ctx.strokeStyle = '#54634c55'; ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(px + i * 5, py + 5); ctx.lineTo(px + i * 5 - 4, py - 4 - i * 3); ctx.stroke(); }
      }
    }
    this.road();
    // 地图边缘方向标记。
    ctx.font = '11px monospace'; ctx.fillStyle = '#79908b'; ctx.textAlign = 'left';
    ctx.fillText('SECTOR 07 / 北境前哨', 28, 34);
    ctx.fillStyle = '#a58b79'; ctx.fillText('迷雾入口 →', 22, 4.5 * CELL + 49);
    ctx.fillStyle = '#7c9086'; ctx.fillText('N', WIDTH - 43, 40); ctx.strokeStyle = '#7c9086'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(WIDTH - 40, 55); ctx.lineTo(WIDTH - 40, 80); ctx.moveTo(WIDTH - 45, 62); ctx.lineTo(WIDTH - 40, 54); ctx.lineTo(WIDTH - 35, 62); ctx.stroke();
    for (let i = 0; i < PADS.length; i++) {
      const p = PADS[i], px = (p.x + 0.5) * CELL, py = (p.y + 0.5) * CELL;
      const tower = state.towers.find(t => t.padId === i), selected = selection === i;
      if (selected) {
        const kind = tower?.kind ?? buildKind;
        ctx.fillStyle = TOWERS[kind].color + '0c'; ctx.strokeStyle = TOWERS[kind].color + '55'; ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(px, py, towerRange(state, kind) * CELL, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = selected ? '#e8bf711b' : '#ffffff04';
      ctx.strokeStyle = selected ? '#e9bf76' : tower ? '#687f75' : '#647c6977'; ctx.lineWidth = selected ? 2 : 1.5;
      ctx.beginPath(); ctx.roundRect(px - 24, py - 24, 48, 48, 8); ctx.fill(); ctx.stroke();
      if (!tower) {
        ctx.strokeStyle = selected ? '#e9bf76' : '#758878'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px - 6, py); ctx.lineTo(px + 6, py); ctx.moveTo(px, py - 6); ctx.lineTo(px, py + 6); ctx.stroke();
      } else {
        const color = TOWERS[tower.kind].color;
        ctx.fillStyle = '#0e1c22'; ctx.beginPath(); ctx.ellipse(px, py + 17, 22, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#35484b'; ctx.fillRect(px - 15, py - 2, 30, 21);
        ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 5;
        if (tower.kind === 'frost') {
          ctx.beginPath(); ctx.moveTo(px, py - 22); ctx.lineTo(px + 13, py - 4); ctx.lineTo(px, py + 8); ctx.lineTo(px - 13, py - 4); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#ffffff99'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py - 19); ctx.lineTo(px, py + 4); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(px, py - 4, tower.kind === 'mortar' ? 15 : 12, 0, Math.PI * 2); ctx.fill();
          const angle = tower.aim ? Math.atan2(tower.aim.y - p.y, tower.aim.x - p.x) : -Math.PI / 2;
          ctx.lineWidth = tower.kind === 'mortar' ? 10 : 6;
          ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo(px + Math.cos(angle) * 25, py - 4 + Math.sin(angle) * 25); ctx.stroke();
        }
        if (tower.flash > 0 && tower.aim) {
          ctx.globalAlpha = tower.flash / 0.15;
          ctx.strokeStyle = color; ctx.lineWidth = tower.kind === 'mortar' ? 3 : 1.5;
          ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo((tower.aim.x + 0.5) * CELL, (tower.aim.y + 0.5) * CELL); ctx.stroke();
          if (tower.kind === 'mortar') {
            ctx.fillStyle = '#e2ae6b44'; ctx.strokeStyle = '#eec683'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc((tower.aim.x + 0.5) * CELL, (tower.aim.y + 0.5) * CELL, (1 - tower.flash / 0.15) * 50 + 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      }
      ctx.font = '10px monospace'; ctx.fillStyle = selected ? '#f0c881' : '#829088'; ctx.textAlign = 'center';
      ctx.fillText(String(i + 1).padStart(2, '0'), px, py + 39);
    }
    for (let i = 0; i < SQUAD_SPOTS.length; i++) {
      const spot = SQUAD_SPOTS[i], x = (spot.x + 0.5) * CELL, y = (spot.y + 0.5) * CELL;
      const squad = state.squads.find(s => s.spotId === i);
      ctx.strokeStyle = squad ? '#9ab6a077' : '#71826c44'; ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.ellipse(x, y + 6, 34, 22, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      if (squad) {
        for (let member = 0; member < 3; member++) {
          const sx = x + (member - 1) * 21, sy = y + (member === 1 ? -7 : 4);
          ctx.fillStyle = '#0d1a1c'; ctx.beginPath(); ctx.ellipse(sx, sy + 12, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#788b7d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx - 3, sy + 5); ctx.lineTo(sx - 5, sy + 12); ctx.moveTo(sx + 3, sy + 5); ctx.lineTo(sx + 5, sy + 12); ctx.stroke();
          ctx.fillStyle = '#9aa88e'; ctx.fillRect(sx - 5, sy - 5, 10, 11);
          ctx.fillStyle = '#d3b997'; ctx.beginPath(); ctx.arc(sx, sy - 10, 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#6d8879'; ctx.beginPath(); ctx.ellipse(sx, sy - 13, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
          const angle = squad.aim ? Math.atan2(squad.aim.y - spot.y, squad.aim.x - spot.x) : -Math.PI / 2;
          ctx.strokeStyle = '#bec4a1'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx, sy - 2); ctx.lineTo(sx + Math.cos(angle) * 14, sy - 2 + Math.sin(angle) * 14); ctx.stroke();
          if (squad.flash > 0 && squad.aim) {
            ctx.globalAlpha = squad.flash / 0.12; ctx.strokeStyle = '#ffe2a2'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(sx, sy - 2); ctx.lineTo((squad.aim.x + 0.5) * CELL + (member - 1) * 4, (squad.aim.y + 0.5) * CELL); ctx.stroke(); ctx.globalAlpha = 1;
          }
        }
      }
      ctx.fillStyle = squad ? '#afc2a4' : '#7a8d7c'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`守备防区 ${['Ⅰ', 'Ⅱ', 'Ⅲ'][i]}`, x, y + 39);
    }
    for (const enemy of state.enemies) {
      const p = positionAt(enemy.distance), px = (p.x + 0.5) * CELL, py = (p.y + 0.5) * CELL;
      const config = ENEMIES[enemy.kind], radius = enemy.kind === 'brute' ? 16 : enemy.kind === 'runner' ? 10 : 12;
      ctx.fillStyle = '#00000044'; ctx.beginPath(); ctx.ellipse(px, py + 13, radius + 3, 6, 0, 0, Math.PI * 2); ctx.fill();
      const wobble = Math.sin(time * (enemy.kind === 'runner' ? 16 : 8) + enemy.id) * 3;
      ctx.strokeStyle = enemy.flash > 0 ? '#f2e9ce' : enemy.kind === 'brute' ? '#755d75' : '#617263';
      ctx.lineWidth = enemy.kind === 'brute' ? 8 : 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px - 5, py + 4); ctx.lineTo(px - 7 - wobble, py + radius + 3); ctx.moveTo(px + 5, py + 4); ctx.lineTo(px + 7 + wobble, py + radius + 3); ctx.stroke();
      ctx.fillStyle = enemy.flash > 0 ? '#f2e9ce' : enemy.kind === 'runner' ? '#7f7861' : enemy.kind === 'brute' ? '#795f74' : '#627765';
      ctx.beginPath(); ctx.roundRect(px - radius, py - radius / 2, radius * 2, radius * 1.1, enemy.kind === 'brute' ? 4 : 6); ctx.fill();
      ctx.strokeStyle = enemy.flash > 0 ? '#f2e9ce' : config.color; ctx.lineWidth = enemy.kind === 'brute' ? 7 : 4;
      ctx.beginPath(); ctx.moveTo(px - radius + 2, py - 1); ctx.lineTo(px - radius - 7, py - 8 + wobble); ctx.moveTo(px + radius - 2, py - 1); ctx.lineTo(px + radius + 7, py - 7 - wobble); ctx.stroke();
      ctx.fillStyle = enemy.flash > 0 ? '#f2e9ce' : config.color;
      ctx.beginPath(); ctx.arc(px, py - radius + 1, radius * 0.58, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d9ca91'; ctx.fillRect(px - 4, py - radius - 1, 2, 2); ctx.fillRect(px + 2, py - radius - 1, 2, 2);
      if (enemy.slowUntil > state.battle.elapsed) { ctx.strokeStyle = '#9dd0e0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, radius + 4, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#0e1920'; ctx.fillRect(px - 16, py - radius - 10, 32, 3);
      ctx.fillStyle = config.color; ctx.fillRect(px - 16, py - radius - 10, 32 * enemy.health / enemy.maxHealth, 3);
      if (state.battle.fireUntil > state.battle.elapsed) {
        ctx.fillStyle = '#e8a15b88'; ctx.beginPath(); ctx.moveTo(px - 10, py + 9); ctx.quadraticCurveTo(px - 18, py - 5, px - 7, py - 19 - wobble); ctx.quadraticCurveTo(px - 9, py + 2, px + 3, py - 9); ctx.quadraticCurveTo(px + 19, py + 7, px + 10, py + 10); ctx.closePath(); ctx.fill();
      }
    }
    this.beacon(state, time);
    if (night) {
      const edge = ctx.createLinearGradient(0, 0, WIDTH, 0);
      edge.addColorStop(0, '#080f1677'); edge.addColorStop(0.2, '#080f1600'); edge.addColorStop(0.8, '#080f1600'); edge.addColorStop(1, '#080f1633');
      ctx.fillStyle = edge; ctx.fillRect(0, 0, WIDTH, HEIGHT);
      for (let i = 0; i < 20; i++) {
        const px = (i * 179 + time * (i % 3 + 2) * 4) % WIDTH, py = (i * 97 - time * 12 + HEIGHT * 100) % HEIGHT;
        ctx.globalAlpha = 0.25 + Math.sin(time * 2 + i) * 0.2; ctx.fillStyle = '#e4b96c'; ctx.fillRect(px, py, i % 3 === 0 ? 2 : 1, 2);
      }
      ctx.globalAlpha = 1;
    }
    if (state.battle.pulseFlash > 0) {
      ctx.strokeStyle = `rgba(238,199,119,${state.battle.pulseFlash})`; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(12.5 * CELL, 4.5 * CELL, (0.7 - state.battle.pulseFlash) * 1800 + 30, 0, Math.PI * 2); ctx.stroke();
    }
    // 轻雾漂移，不影响规则；暂停时用静止时间绘制。
    for (let i = 0; i < 4; i++) {
      const x = ((i * 337 + time * 8) % (WIDTH + 400)) - 200;
      const fog = ctx.createRadialGradient(x, 90 + i * 170, 0, x, 90 + i * 170, 240);
      fog.addColorStop(0, '#abc8c609'); fog.addColorStop(1, '#abc8c600'); ctx.fillStyle = fog; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    if (paused && night) {
      ctx.fillStyle = '#0c161b99'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.textAlign = 'center'; ctx.fillStyle = '#ead9b7'; ctx.font = '500 24px sans-serif'; ctx.fillText('守夜已暂停', WIDTH / 2, HEIGHT / 2);
      ctx.fillStyle = '#a0aca6'; ctx.font = '14px sans-serif'; ctx.fillText('点击继续守夜，让灯光再次流动', WIDTH / 2, HEIGHT / 2 + 32);
    }
  }
  private onRoad(x: number, y: number): boolean {
    return PATH.slice(1).some((p, i) => x >= Math.min(p.x, PATH[i].x) && x <= Math.max(p.x, PATH[i].x) && y >= Math.min(p.y, PATH[i].y) && y <= Math.max(p.y, PATH[i].y));
  }
  private road(): void {
    const ctx = this.ctx;
    const trace = () => { ctx.beginPath(); PATH.forEach((p, i) => { if (i === 0) ctx.moveTo(-20, (p.y + 0.5) * CELL); else ctx.lineTo((p.x + 0.5) * CELL, (p.y + 0.5) * CELL); }); };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = '#0c171b'; ctx.lineWidth = 49; trace(); ctx.stroke();
    ctx.strokeStyle = '#3b4440'; ctx.lineWidth = 44; trace(); ctx.stroke();
    ctx.strokeStyle = '#76837322'; ctx.lineWidth = 1; ctx.setLineDash([4, 12]); trace(); ctx.stroke(); ctx.setLineDash([]);
  }
  private beacon(state: GameState, time: number): void {
    const ctx = this.ctx, px = 12.5 * CELL, py = 4.5 * CELL, level = effectiveLight(state);
    const glowRadius = level === 'high' ? 245 : level === 'low' ? 115 : 180;
    const gradient = ctx.createRadialGradient(px, py - 60, 8, px, py - 60, glowRadius);
    gradient.addColorStop(0, state.phase === 'defeat' ? '#f4cd7b00' : '#f4cd7b33'); gradient.addColorStop(1, '#eebc6c00'); ctx.fillStyle = gradient;
    ctx.fillRect(px - 300, py - 360, 600, 620);
    ctx.save(); ctx.translate(px, py - 59); ctx.rotate(Math.sin(time * 0.24) * 0.22);
    const beam = ctx.createLinearGradient(0, 0, -400, 0); beam.addColorStop(0, state.phase === 'defeat' ? '#edc77c00' : '#edc77c2c'); beam.addColorStop(1, '#edc77c00'); ctx.fillStyle = beam;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-450, -160); ctx.lineTo(-450, 160); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#101b20'; ctx.beginPath(); ctx.ellipse(px, py + 31, 49, 17, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#62706a'; ctx.beginPath(); ctx.moveTo(px - 17, py - 42); ctx.lineTo(px + 17, py - 42); ctx.lineTo(px + 28, py + 28); ctx.lineTo(px - 28, py + 28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#899287'; ctx.beginPath(); ctx.moveTo(px - 17, py - 42); ctx.lineTo(px - 1, py - 42); ctx.lineTo(px - 4, py + 28); ctx.lineTo(px - 28, py + 28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#293b3c'; ctx.fillRect(px - 23, py - 47, 46, 7); ctx.fillRect(px - 27, py + 24, 54, 8);
    ctx.fillStyle = state.phase === 'defeat' ? '#756d52' : '#f0ce83'; ctx.shadowColor = '#f7c873'; ctx.shadowBlur = state.phase === 'defeat' ? 0 : 18;
    ctx.fillRect(px - 18, py - 73, 36, 25); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#344544'; ctx.lineWidth = 3; ctx.strokeRect(px - 18, py - 73, 36, 25);
    ctx.beginPath(); ctx.moveTo(px, py - 73); ctx.lineTo(px, py - 48); ctx.stroke();
    ctx.fillStyle = '#869184'; ctx.beginPath(); ctx.moveTo(px - 27, py - 74); ctx.lineTo(px, py - 94); ctx.lineTo(px + 27, py - 74); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#273736'; ctx.fillRect(px - 5, py - 18, 10, 15); ctx.fillRect(px - 7, py + 8, 14, 18);
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#d6bd8c'; ctx.textAlign = 'center'; ctx.fillText('最后的灯塔', px, py + 58);
  }
}
