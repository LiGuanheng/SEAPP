import { test as base } from '@playwright/test';
export { expect, type Page } from '@playwright/test';

/** 既有战斗案例模拟已观看序章的玩家；序章专项通过公开 intro=1 入口验证真实播放。 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => sessionStorage.setItem('last-light.prologue.seen', '1'));
    await use(page);
  },
});
