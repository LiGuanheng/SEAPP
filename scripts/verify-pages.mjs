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
  await page.getByRole('main', { name: '主菜单' }).waitFor();
  assert.equal(await page.getByText('课堂演示', { exact: false }).count(), 0);
  await page.getByLabel('游戏难度', { exact: true }).selectOption('hard');
  await page.screenshot({ path: 'artifacts/pages-main-menu.png' });
  await page.getByRole('button', { name: '排行榜', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '尚未配置在线服务' }).waitFor();
  const link = await page.getByRole('link', { name: '开始普通排名战役 →' }).getAttribute('href');
  assert.ok(link.includes('/SEAPP/?ranked=1'));
  assert.deepEqual(errors, []);
  await page.screenshot({ path: 'artifacts/pages-offline.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '开始新游戏', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/SEAPP/' && url.searchParams.get('difficulty') === 'hard');
  await page.waitForFunction(() => !document.getElementById('loading'));
  assert.deepEqual(errors, []);
  console.log('Pages 子路径 /SEAPP/：主菜单、难度、新游戏、素材载入、离线反馈与排行榜入口均通过。');
} finally { await browser?.close(); preview.kill(); }
