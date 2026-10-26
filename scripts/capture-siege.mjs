import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('artifacts/v011', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const name of ['ordinary', 'fortified', 'encirclement']) {
    const campaign = readFileSync(`artifacts/siege-${name}-campaign.json`, 'utf8');
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(data => { sessionStorage.setItem('last-light.prologue.seen', '1'); localStorage.setItem('last-light.campaign.v2', data); }, campaign);
    await page.goto('http://127.0.0.1:4173/?mode=night&test=1');
    await page.waitForFunction(() => window.__nightLight?.snapshot().ready);
    if (name === 'ordinary') await page.evaluate(() => {
      const stream = document.querySelector('canvas').captureStream(30), chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm', videoBitsPerSecond: 1800000 });
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      window.__finishRecording = () => new Promise(resolve => { recorder.onstop = async () => { const blob = new Blob(chunks, { type: 'video/webm' }), reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); stream.getTracks().forEach(t => t.stop()); }; recorder.stop(); });
      recorder.start();
    });
    await page.mouse.click(800, 520); // Real gesture unlocks sound.
    for (const [delay, label] of [[250, 'warm'], [900, 'alarm'], [1100, 'dark']]) { await page.waitForTimeout(delay); if (name === 'ordinary') await page.screenshot({ path: `artifacts/v011/night-${label}.png` }); }
    await page.mouse.move(700, 360); for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 200);
    await page.keyboard.press('KeyT'); await page.keyboard.press('KeyT');
    await page.waitForTimeout(name === 'ordinary' ? 9000 : 19000);
    const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
    const before = await cdp.send('Performance.getMetrics');
    const metrics = await page.evaluate(() => new Promise(resolve => {
      const samples = [], peaks = { enemies: 0, directions: 0, particles: 0 }; let previous = performance.now(), started = previous;
      const tick = now => {
        samples.push(now - previous); previous = now;
        const s = window.__nightLight.snapshot();
        peaks.enemies = Math.max(peaks.enemies, s.enemies.length); peaks.directions = Math.max(peaks.directions, s.pressure.filter(n => n >= 3).length); peaks.particles = Math.max(peaks.particles, s.view.particles);
        if (now - started < 8000) { requestAnimationFrame(tick); return; }
        samples.sort((a, b) => a - b);
        resolve({ frames: samples.length, meanFrameMs: samples.reduce((a, b) => a + b, 0) / samples.length, p95FrameMs: samples[Math.floor(samples.length * 0.95)], maxFrameMs: samples.at(-1), peaks, elapsed: s.elapsed, status: s.status, lampHealth: s.lampHealth, buildings: s.plan.buildings.length, view: s.view });
      }; requestAnimationFrame(tick);
    }));
    const after = await cdp.send('Performance.getMetrics');
    const metric = (data, key) => data.metrics.find(m => m.name === key)?.value ?? 0;
    const result = { name, ...metrics, scriptSeconds: metric(after, 'ScriptDuration') - metric(before, 'ScriptDuration'), taskSeconds: metric(after, 'TaskDuration') - metric(before, 'TaskDuration'), heapMB: metric(after, 'JSHeapUsedSize') / 1048576, errors, note: 'Production headless Chrome, real requestAnimationFrame, 3x fixed-step simulation, 8 wall-clock seconds. No virtual clock.' };
    await page.screenshot({ path: `artifacts/v011/${name}-battle.png` });
    if (name === 'ordinary') writeFileSync('artifacts/v011/night-real-browser.webm', Buffer.from(await page.evaluate(() => window.__finishRecording()), 'base64'));
    results.push(result); console.log(JSON.stringify(result)); await context.close();
  }
  writeFileSync('artifacts/v011/browser-performance.json', JSON.stringify(results, null, 2));
} finally { await browser.close(); }
if (results.some(r => r.errors.length)) process.exitCode = 1;
