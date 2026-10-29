import { test, expect, type Page } from './fixtures.ts';
import { newCampaign } from '../../src/core/campaign.ts';
import { BaseWorld } from '../../src/core/base-world.ts';
import { SURVIVOR_PROFILES } from '../../src/config/survivors.ts';
const state = (p: Page): Promise<any> => p.evaluate(() => ((window as any).__nightLight ?? (window as any).__baseLight ?? (window as any).__lastLight).snapshot());
async function key(p: Page,k:string){await p.keyboard.down(k);await p.clock.runFor(50);await p.keyboard.up(k);await p.clock.runFor(50);}
async function click(p: Page,x:number,y:number){const b=(await p.locator('canvas').boundingBox())!;await p.mouse.click(b.x+x/1280*b.width,b.y+y/720*b.height);await p.clock.runFor(80);}
async function worldClick(p: Page,x:number,y:number){for(let i=0;i<12;i++){const s=await state(p),sx=(x-s.camera.x)*s.camera.zoom,sy=(y-s.camera.y)*s.camera.zoom;const code=sy>560?'KeyS':sy<120?'KeyW':sx>1050?'KeyD':sx<40?'KeyA':null;if(!code)break;await p.keyboard.down(code);await p.clock.runFor(100);await p.keyboard.up(code);}const s=await state(p);await click(p,(x-s.camera.x)*s.camera.zoom,(y-s.camera.y)*s.camera.zoom);}
async function prepare(p:Page,stage=1){const c=newCampaign();c.clearedStage=stage-1;c.depot={materials:400,energy:160,medkits:0};if(stage===5){c.survivors=Object.keys(SURVIVOR_PROFILES);c.reserves={rifle:20,archer:4,vanguard:4};}const b=new BaseWorld(c);await p.addInitScript(c=>localStorage.setItem('last-light.campaign.v2',JSON.stringify(c)),b.campaign);await p.clock.install();await p.goto('/?test=1');await p.getByRole('button',{name:'继续游戏',exact:true}).click();await p.waitForFunction(()=>(window as any).__baseLight?.snapshot().ready);await p.clock.pauseAt(await p.evaluate(()=>Date.now())+100);await p.clock.runFor(1800);}

test('地图与镜头同时居中，不限时布防、暂停/倍速的实际计时、完成按钮立即入夜',async({page})=>{
 await prepare(page);let s=await state(page);expect((1024-s.camera.x)*s.camera.zoom).toBeCloseTo(640,0);expect((672-s.camera.y)*s.camera.zoom).toBeCloseTo(345,0);expect(s.buildArea.x+s.buildArea.width/2).toBe(1024);expect(s.buildArea.y+s.buildArea.height/2).toBe(704);
 await key(page,'KeyT');await key(page,'KeyT');const first=(await state(page)).ranking.phaseTimesMs.base;await page.clock.runFor(35000);s=await state(page);expect(s.plan.status).toBe('preparing');expect(s.ranking.phaseTimesMs.base-first).toBeGreaterThan(34000);expect(s.ranking.phaseTimesMs.base-first).toBeLessThan(36000);await key(page,'KeyP');const paused=await state(page);await page.clock.runFor(8000);expect((await state(page)).ranking.phaseTimesMs).toEqual(paused.ranking.phaseTimesMs);await key(page,'KeyP');
 await page.screenshot({path:'artifacts/v016-centered-preparation.png'});await click(page,1128,641);await page.waitForFunction(()=>(window as any).__nightLight?.snapshot().ready);s=await state(page);expect(s.ranking.phaseTimesMs.base).toBeGreaterThan(35000);const base=s.ranking.phaseTimesMs.base;await page.clock.runFor(1000);expect((await state(page)).ranking.phaseTimesMs.base).toBe(base);
});

test('各阶段新设施键鼠解锁/施工、13个菜单按钮、四英雄成长与12人守备素材无错误',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await prepare(page,5);let s=await state(page);expect(s.plan.soldiers).toHaveLength(12);expect(s.lightRadius).toBe(1120);
 for(const [code,kind,x,y] of [['Digit0','antiair',1216,544],['KeyJ','pounder',864,544],['Digit9','sniper',1376,544],['KeyK','inferno',1216,960],['KeyH','eagle',864,960]] as const){await key(page,code);expect((await state(page)).placement).toBe(kind);await worldClick(page,x+4,y+4);expect((await state(page)).plan.buildings.some((b:any)=>b.kind===kind)).toBe(true);await key(page,'Escape');}
 await key(page,'KeyC'); await page.mouse.move(600,400); for(let i=0;i<4;i++){await page.mouse.wheel(0,200);await page.clock.runFor(50);} await page.screenshot({path:'artifacts/v016-endgame-buildings.png'});await click(page,1128,641);await page.waitForFunction(()=>(window as any).__nightLight?.snapshot().ready);s=await state(page);for(const role of ['guardian','gunner','sentinel','striker'])expect(s.plan.soldiers.some((x:any)=>x.role===role)).toBe(true);await page.clock.runFor(1500);await page.screenshot({path:'artifacts/v016-growing-heroes.png'});expect(errors).toEqual([]);
});

test('第二关仅开放防空火炮，第四关狙击与终局重炮不能越级建造',async({page})=>{
 await prepare(page,2);for(const k of ['Digit9','KeyK','KeyH']){const before=(await state(page)).campaign.depot;await key(page,k);expect((await state(page)).placement).toBe(null);expect((await state(page)).campaign.depot).toEqual(before);}await key(page,'Digit0');expect((await state(page)).placement).toBe('antiair');await worldClick(page,1220,548);expect((await state(page)).plan.buildings[0].kind).toBe('antiair');
});

test('第五阶段探索背包184、增强物资、普通队员再次出现而已救英雄消失',async({page})=>{
 const c=newCampaign();c.clearedStage=4;c.expeditions=3;c.survivors=Object.keys(SURVIVOR_PROFILES);await page.addInitScript(c=>localStorage.setItem('last-light.campaign.v2',JSON.stringify(c)),c);await page.clock.install();await page.goto('/?play=1&test=1');await page.waitForFunction(()=>(window as any).__lastLight?.snapshot().ready);const s=await state(page);expect(s.expedition.capacity).toBe(184);expect(s.expedition.caches.find((c:any)=>c.id==='salvage').cargo.materials).toBe(36);expect(s.expedition.survivors).toHaveLength(6);expect(s.expedition.survivors.some((x:any)=>x.id==='guardian')).toBe(false);await page.screenshot({path:'artifacts/v016-rich-exploration.png'});
});
