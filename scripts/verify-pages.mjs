// 验证未配置 API 的生产产物也能从 GitHub Pages 风格的项目子路径运行。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4180', '--strictPort', '--base', '/SEAPP/'], { stdio: 'ignore', windowsHide: true });
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch('http://127.0.0.1:4180/SEAPP/')).ok) break; } catch { /* 等待预览启动 */ }
    if (i === 59) throw new Error('静态预览未启动');
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ channel: process.env.CI || process.env.PLAYWRIGHT_CHROMIUM ? undefined : 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => sessionStorage.setItem('last-light.prologue.seen', '1'));
  await page.goto('http://127.0.0.1:4180/SEAPP/');
  await page.waitForFunction(() => !!document.querySelector('canvas') && !document.getElementById('loading'));
  await page.getByRole('button', { name: '排行榜', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '尚未配置在线服务' }).waitFor();
  const link = await page.getByRole('link', { name: '开始普通排名战役 →' }).getAttribute('href');
  assert.ok(link.includes('/SEAPP/?ranked=1'));
  assert.deepEqual(errors, []);
  await page.screenshot({ path: 'artifacts/pages-offline.png' });
  console.log('Pages 子路径 /SEAPP/：素材载入、离线游戏、未配置 API 反馈、排名入口链接全部通过。');
} finally { await browser?.close(); preview.kill(); }
