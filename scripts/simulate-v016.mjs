import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld } from '../src/core/night-world.ts';
import { newCampaign } from '../src/core/campaign.ts';
import { LIGHTHOUSE, BUILDINGS } from '../src/config/base.ts';
// 有限资源参考模型，不是人工实玩。每关一趟物资夹具均不超过该关背包容量。
let campaign=newCampaign();campaign.survivors=['engineer'];campaign.weapons.push('rifle');
for(let stage=1;stage<=5;stage++){
 const supplies=[[16,2],[48,16],[72,24],[100,32],[132,44]][stage-1];campaign.depot.materials+=supplies[0];campaign.depot.energy+=supplies[1];
 if(stage===2)campaign.survivors.push('guardian','medic','captain');if(stage===3)campaign.survivors.push('gunner','ranger','brawler');if(stage===4)campaign.survivors.push('sentinel');if(stage===5)campaign.survivors.push('striker');
 const b=new BaseWorld(campaign);b.resume();
 if(stage===1)for(const[k,x,y]of[['turret',1088,544],['arrowtower',864,832],['arrowtower',1120,832],['barricade',1216,832]]){const built=b.build(k,{x,y},k==='barricade'?1:0);if(!built.ok)throw Error(built.message);}
 else{
  const choices=stage===2?['antiair','cannon','arrowtower','turret','repair']:stage===3?['pounder','flame','turret','arrowtower']:stage===4?['inferno','sniper','turret','arrowtower']:['eagle','inferno','sniper','turret','arrowtower'];
  for(const kind of choices){let built=0;const points=[];for(let y=320;y<=1120;y+=32)for(let x=576;x<=1504;x+=32)points.push({x,y});points.sort((a,c)=>Math.abs(Math.hypot(a.x+32-LIGHTHOUSE.x,a.y+32-LIGHTHOUSE.y)-250)-Math.abs(Math.hypot(c.x+32-LIGHTHOUSE.x,c.y+32-LIGHTHOUSE.y)-250));for(const p of points){if(built>=(kind==='arrowtower'||kind==='turret'?3:1))break;if(b.build(kind,p).ok)built++;}}
 }
 b.finish();const w=new NightWorld(b.campaign);for(let i=0;i<7201&&w.commanding;i++){if(w.charges&&w.supportCooldown===0&&w.elapsed>55){const e=w.enemies.find(e=>['tank','bomber','blighter','brute'].includes(e.kind)&&w.canSee(e));if(e)w.callStrike(e);}w.step();}
 console.log(JSON.stringify({stage,...w.summary(),depot:b.campaign.depot,newBuildings:b.plan.buildings.map(x=>BUILDINGS[x.kind].name)}));if(w.status!=='victory')throw Error(`参考阵地第${stage}夜失守`);campaign=w.resultCampaign();
}
