import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
// 先运行 simulate-progression.mjs，再运行本脚本；需要4173端口生产预览。
const campaign = readFileSync('artifacts/performance-campaign.json', 'utf8');
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHROMIUM ? undefined : 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(data => { sessionStorage.setItem('last-light.prologue.seen', '1'); localStorage.setItem('last-light.campaign.v2', data); }, campaign);
  await page.goto('http://127.0.0.1:4173/?mode=night&test=1');
  await page.waitForFunction(() => window.__nightLight?.snapshot().ready);
  await page.mouse.move(600, 360); await page.mouse.wheel(0, 1200);
  await page.keyboard.press('KeyT'); await page.keyboard.press('KeyT');
  const metrics = await page.evaluate(() => new Promise(resolve => {
    const samples = []; let previous = performance.now(), started = previous;
    const tick = now => {
      if (now - started > 1000) samples.push(now - previous); previous = now;
      if (now - started < 8000) { requestAnimationFrame(tick); return; }
      samples.sort((a, b) => a - b);
      const s = window.__nightLight.snapshot();
      resolve({ frames: samples.length, meanFrameMs: samples.reduce((a, b) => a + b, 0) / samples.length, p95FrameMs: samples[Math.floor(samples.length * 0.95)], maxFrameMs: samples.at(-1), buildings: s.plan.buildings.length, enemies: s.enemies.length, speed: s.speed, elapsed: s.elapsed, view: s.view });
    };
    requestAnimationFrame(tick);
  }));
  await page.screenshot({ path: 'artifacts/progression-performance.png' });
  const result = { ...metrics, errors, note: '本机无虚拟时钟的Chrome 8秒采样，120设施生产构建；模型72敌人压力另测。非低配设备承诺。' };
  writeFileSync('artifacts/performance-browser.json', JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
