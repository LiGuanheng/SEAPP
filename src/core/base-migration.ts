import { BASE_WIDTH, BASE_HEIGHT, BASE_OBSTACLES, RESERVED_ROUTES, BUILDINGS, buildingRect, overlaps, type BasePlan, type Soldier } from '../config/base.ts';
import { validBasePlan as validLegacyBasePlan } from '../config/legacy-base.ts';
import { canOccupy, distance } from './geometry.ts';

/** 旧阵地整体平移至地图中央；越界或冲突的外侧设施寻找最近合法网格，保留费用与耐久。 */
export function migrateBase(plan: BasePlan): BasePlan {
  if (plan.version === 2) return plan;
  if (!validLegacyBasePlan(plan)) throw new Error('旧阵地校验失败，原记录保留');
  const p: BasePlan = structuredClone(plan), placed: typeof p.buildings = [];
  if (!Array.isArray(p.buildings) || !Array.isArray(p.soldiers)) throw new Error('旧阵地无效');
  for (const b of p.buildings) {
    if (!Object.hasOwn(BUILDINGS, b.kind) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) throw new Error('旧设施无效');
    const desired = { x: b.x + 256, y: b.y + 192 }, candidates: {x:number;y:number}[] = [];
    for (let y = 0; y < BASE_HEIGHT; y += 32) for (let x = 0; x < BASE_WIDTH; x += 32) candidates.push({x,y});
    candidates.sort((a,c)=>distance(a,desired)-distance(c,desired));
    const point = candidates.find(point => { const r=buildingRect({...b,...point}); return r.x+r.width<=BASE_WIDTH && r.y+r.height<=BASE_HEIGHT && ![...BASE_OBSTACLES,...RESERVED_ROUTES,...placed.map(buildingRect)].some(o=>overlaps(r,o)); });
    if (!point) throw new Error('旧设施无法迁移'); Object.assign(b,point); placed.push(b);
  }
  const obstacles=[...BASE_OBSTACLES,...placed.map(buildingRect)], positioned: Soldier[]=[];
  for (const s of p.soldiers) {
    const desired={x:s.x+256,y:s.y+192}, points=[desired];
    for(let y=16;y<BASE_HEIGHT;y+=32)for(let x=16;x<BASE_WIDTH;x+=32)points.push({x,y});
    points.sort((a,b)=>distance(a,desired)-distance(b,desired));
    const point=points.find(v=>canOccupy(v,13,obstacles,BASE_WIDTH,BASE_HEIGHT)&&positioned.every(o=>distance(o,v)>28));
    if(!point)throw new Error('旧守卫无法迁移'); Object.assign(s,point,{destination:null,stance:'hold',moving:false}); positioned.push(s);
  }
  p.version=2; return p;
}
