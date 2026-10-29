import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld, type NightEnemy } from '../src/core/night-world.ts';
import { ExpeditionWorld, CAMP } from '../src/core/expedition.ts';
import { newCampaign, decodeCampaign } from '../src/core/campaign.ts';
import { LIGHTHOUSE, BASE_WIDTH, BASE_HEIGHT, BUILDINGS, validBasePlan, type BuildingKind } from '../src/config/base.ts';
import { STAGES, type StageId } from '../src/config/progression.ts';
import { RankedRun } from '../src/core/ranking.ts';
import { calculateScore, validPhaseTimes, type StageScore } from '../src/core/scoring.ts';
import { heroPower, capacityFor } from '../src/config/growth.ts';
import { SURVIVOR_PROFILES, HERO_IDS } from '../src/config/survivors.ts';
import { distance } from '../src/core/geometry.ts';

function camp(stage: StageId) { const c=newCampaign();c.clearedStage=stage-1;c.depot={materials:500,energy:200,medkits:0};return c; }
function battle(kind: BuildingKind, stage: StageId) {const b=new BaseWorld(camp(stage));assert.ok(b.build(kind,{x:1216,y:832}).ok);const w=new NightWorld(b.campaign);for(const f of w.fighters.values())f.health=0;return w;}
function add(w: NightWorld, kind: NightEnemy['kind'], x=1340,y=848) {const e:NightEnemy={id:9000+w.enemies.length,kind,x,y,health:10000,maxHealth:10000,aim:0,moving:false,cooldown:999,hurt:0,skillCooldown:999,summonCooldown:999};w.enemies.push(e);return e;}
function step(w:NightWorld, count:number){for(let i=0;i<count;i++)w.step();}

test('灯塔是地图几何中心，五个施工区同心对称扩张，每阶段有新设施',()=>{
 assert.deepEqual(LIGHTHOUSE,{x:BASE_WIDTH/2,y:BASE_HEIGHT/2});let last=0,light=0;
 for(const stage of [1,2,3,4,5] as const){const a=STAGES[stage].area;assert.equal(a.x+a.width/2,LIGHTHOUSE.x);assert.equal(a.y+a.height/2,LIGHTHOUSE.y);assert.ok(a.width*a.height>last);assert.ok(STAGES[stage].lightRadius>light);last=a.width*a.height;light=STAGES[stage].lightRadius;assert.ok(Object.values(BUILDINGS).some(b=>b.stage===stage));}
});
test('旧阵地连同边缘设施迁移，数量/费用/英雄/库存保留，二次加载不会重复平移',()=>{
 const c=camp(3);c.base={version:1,stage:3,status:'ready',elapsed:30,buildings:[{id:1,kind:'turret',x:832,y:352,rotation:0,health:100,paid:{materials:6,energy:2}},{id:2,kind:'wall',x:2016,y:1344,rotation:0,health:80,paid:{materials:1,energy:0}}],soldiers:[688,752,816].map((x,i)=>({id:i+1,x,y:624,aim:0,destination:null,stance:'hold',moving:false}))};
 const restored=decodeCampaign(JSON.stringify(c));assert.equal(restored.base!.version,2);assert.equal(restored.base!.buildings.length,2);assert.deepEqual(restored.base!.buildings[0].paid,c.base.buildings[0].paid);assert.equal(restored.base!.buildings[0].x,1088);assert.deepEqual(restored.depot,c.depot);assert.ok(validBasePlan(restored.base));assert.deepEqual(decodeCampaign(JSON.stringify(restored)),restored);
 const bad=structuredClone(c);bad.base!.buildings[0].x=NaN;assert.throws(()=>decodeCampaign(JSON.stringify(bad)));
});
test('已救普通人员每趟仍生成但更换位置，已救英雄唯一，成功救援新增预备队',()=>{
 const c=camp(2);c.expeditions=2;c.survivors=['engineer','guardian'];const a=new ExpeditionWorld(c,false,1000),p=a.survivors.find(s=>s.id==='engineer')!;assert.ok(p);assert.ok(!a.survivors.some(s=>s.id==='guardian'));Object.assign(a.player,p);assert.ok(a.interact().ok);Object.assign(p,{x:CAMP.x-20,y:CAMP.y});Object.assign(a.player,CAMP);assert.ok(a.interact().ok);assert.equal(a.campaign.reserves!.rifle,1);
 const b=new ExpeditionWorld(a.campaign,false,2000),next=b.survivors.find(s=>s.id==='engineer')!;assert.ok(next);assert.ok(distance(next,p)>50);assert.notEqual(next.name,p.name);assert.ok(!b.survivors.some(s=>s.id==='guardian'));
});
test('五阶段容量/资源逐步成长，满背包拒绝整箱且不吞物资',()=>{
 let materials=0,energy=0;for(const stage of [1,2,3,4,5] as const){const w=new ExpeditionWorld(camp(stage),false,111),box=w.caches.find(c=>c.id==='salvage')!;assert.equal(w.capacity,capacityFor(stage));assert.ok(box.cargo.materials>materials&&box.cargo.energy>energy);materials=box.cargo.materials;energy=box.cargo.energy;Object.assign(w.player,box);w.inventory.materials=w.capacity;assert.equal(w.interact().ok,false);assert.equal(box.opened,false);}
});
test('预备队实际补齐12人编制，四英雄保留且存读档、生命随阶段成长',()=>{
 const c=camp(5);c.survivors=Object.keys(SURVIVOR_PROFILES);c.reserves={rifle:20,archer:5,vanguard:5};const b=new BaseWorld(c);assert.equal(b.plan.soldiers.length,12);for(const id of HERO_IDS)assert.equal(b.plan.soldiers.filter(s=>s.role===id).length,1);assert.equal(b.campaign.reserves!.rifle,18);assert.ok(validBasePlan(b.plan));assert.ok(decodeCampaign(JSON.stringify(b.campaign)));
 const w=new NightWorld(b.campaign),hero=w.plan.soldiers.find(s=>s.role==='sentinel')!;assert.equal(w.maxSoldierHealth(hero),260*heroPower(5));
});
test('布防600秒仍不入夜，手动完成保持真实耗时，继续调整不会清零',()=>{
 const b=new BaseWorld(camp(1));for(let i=0;i<36000;i++)b.step();assert.equal(b.plan.status,'preparing');assert.ok(Math.abs(b.plan.elapsed-600)<.01);const elapsed=b.plan.elapsed;b.finish();b.step();assert.equal(b.plan.elapsed,elapsed);b.resume();b.step();assert.ok(b.plan.elapsed>elapsed);assert.ok(decodeCampaign(JSON.stringify(b.campaign)));
});
test('实际布防计时排除暂停/离线，不受倍速影响，阶段恢复不补算离线',()=>{
 const r=new RankedRun('timing','normal');r.update(true,100,3,'base');r.update(false,10100,3,'base');r.update(false,90100,3,'base');r.update(true,100100,3,'base');r.update(false,105100,3,'base');assert.equal(r.phaseTimesMs.base,15000);const checkpoint=r.checkpoint();const restored=new RankedRun('next','normal');restored.restoreCheckpoint(checkpoint,200000);restored.update(true,300000,3,'base');restored.update(false,301000,3,'base');assert.equal(restored.phaseTimesMs.base,16000);
});
test('完整通关允许任意实际布防时长，额外布防同时增加榜单用时并减少效率分',()=>{
 const stages=([1,2,3,4,5] as const).map(stage=>({stage,kills:0,bossKills:0,lampHealth:380,soldiers:12} satisfies StageScore));const a={day:100000,base:20000,night:600000},b={...a,base:400000};assert.ok(validPhaseTimes(a,720000,true));assert.ok(validPhaseTimes(b,1100000,true));assert.equal(calculateScore(stages,720000,{phaseTimesMs:a}).efficiency-calculateScore(stages,1100000,{phaseTimesMs:b}).efficiency,380);assert.equal(validPhaseTimes({...b,night:599999},1099999,true),false);
});
test('十种搜救职业不会使阶段检查点超过计分人数上限而损坏',()=>{
 const r=new RankedRun('rescue-cap','normal');r.recordExploration(0,0,Object.keys(SURVIVOR_PROFILES));const saved=r.checkpoint();assert.equal(saved.rescued.length,8);const next=new RankedRun('next','normal');next.restoreCheckpoint(saved,1000);assert.equal(next.exploration.rescued,8);
});
test('震地锤真实范围伤害与减速只作用地面，阶段2不可提前建造',()=>{
 const early=new BaseWorld(camp(2));assert.equal(early.build('pounder',{x:1216,y:832}).ok,false);const w=battle('pounder',3),a=add(w,'brute'),b=add(w,'walker',1345),air=add(w,'crow');w.step();assert.ok(a.health<10000&&b.health<10000);assert.ok(a.slowed!>0);assert.equal(air.health,10000);
});
test('灼光塔锁定同一目标升温且能打空军，目标消失后重新升温',()=>{
 const w=battle('inferno',4),air=add(w,'bird');step(w,50);const first=10000-air.health;step(w,50);assert.ok(10000-air.health-first>first);assert.ok(w.events.some(e=>e.type==='beam'));w.enemies=[];w.step();assert.equal(w.turrets.values().next().value!.heat,0);const ground=add(w,'tank');step(w,20);assert.ok(ground.health<10000);
});
test('苍穹重炮远程实弹范围攻击地面，重型狙击塔阶段4可攻击陆空',()=>{
 const eagle=battle('eagle',5),a=add(eagle,'brute',1800,860),b=add(eagle,'walker',1812,860),air=add(eagle,'bird',1800,860);step(eagle,110);assert.ok(eagle.shotsFired.shell>0);assert.ok(a.health<10000&&b.health<10000);assert.equal(air.health,10000);
 for(const kind of ['walker','bird'] as const){const w=battle('sniper',4),e=add(w,kind);step(w,30);assert.ok(e.health<10000);}
});
