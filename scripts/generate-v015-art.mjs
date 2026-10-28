// 原创像素轮廓 SVG，与游戏现有素材同样使用 crispEdges；无需外部图像或授权素材。
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('public/assets/heroes', { recursive: true });
const rect = (x,y,w,h,c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
const path = (d,c) => `<path d="${d}" fill="${c}"/>`;
const sheet = (w,h,body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w*3}" height="${h}" viewBox="0 0 ${w*3} ${h}" shape-rendering="crispEdges">${[0,1,2].map(i=>`<g transform="translate(${i*w},0)">${body(i-1)}</g>`).join('')}</svg>`;
const colors={guardian:['#d7e6d6','#5b9d89','#284c48'],gunner:['#ab795a','#e1a36b','#503e38'],sentinel:['#709fc5','#d6c58c','#304d6b'],striker:['#8f7cab','#e0dac6','#3b3759']};
for (const [id,[base,light,dark]] of Object.entries(colors)) {
  const image=sheet(64,80,step=>{
    let s=rect(17,65+step,12,10,'#152b31')+rect(36,65-step,12,10,'#152b31')+path('M14 26H50L56 65H9Z','#11242c');
    if(id==='guardian') s+=path('M15 30H48L51 65H12Z',base)+rect(12,31,9,23,light)+rect(45,31,9,22,light)+rect(27,32,10,33,dark)+rect(36,40,16,17,'#315c54')+rect(42,43,4,11,'#b9e7bc')+rect(39,47,10,4,'#b9e7bc')+rect(8,38,7,23,'#667a61')+rect(7,34,9,9,'#cae4b4');
    if(id==='gunner') s+=rect(8,27,47,32,dark)+rect(14,31,36,31,base)+rect(8,29,10,18,light)+rect(46,29,11,20,light)+rect(19,37,27,7,'#e9bb80')+rect(22,50,21,8,'#3f4140')+rect(3,25,12,34,'#596961')+rect(5,30,8,4,'#e0bd75')+rect(5,39,8,4,'#e0bd75')+rect(5,48,8,4,'#e0bd75');
    if(id==='sentinel') s+=path('M12 28H50L54 64H13Z',dark)+rect(19,29,26,28,base)+rect(15,29,9,11,light)+rect(42,29,10,11,light)+rect(26,37,10,17,'#a6c6d3')+path('M5 35H26L29 57L16 69L3 56Z','#152e42')+path('M8 38H23L25 55L16 63L7 54Z',base)+rect(14,41,4,16,light)+rect(10,46,12,4,light);
    if(id==='striker') s+=path('M13 27L5 59L21 55L28 68H43L57 58L49 27Z',dark)+path('M18 28H46L49 60H15Z',base)+rect(24,33,14,23,'#ced5ca')+rect(14,33,7,17,light)+rect(45,33,8,17,light)+path('M8 28L2 39L16 42L23 34Z','#9cb9c8')+path('M46 30L61 38L54 47L43 38Z','#9cb9c8')+rect(25,51,18,6,'#354b50');
    s+=rect(23,10,20,19,'#21383b')+rect(26,15,14,12,'#e0c49b')+rect(26,23,14,4,'#b79377');
    if(id==='guardian')s+=rect(21,8,24,8,'#e1e9d9')+rect(30,8,6,8,light)+rect(23,17,4,7,'#dce3d3');
    if(id==='gunner')s+=rect(22,7,23,9,'#a46b45')+rect(23,16,20,7,'#394b48')+rect(25,18,16,3,'#eca75b');
    if(id==='sentinel')s+=rect(20,7,26,10,base)+rect(23,16,20,8,dark)+rect(26,18,14,3,'#d8e8c8')+rect(30,3,6,8,light);
    if(id==='striker')s+=path('M22 8L33 2L45 10L45 25H40V13H27V25H21Z',base)+rect(26,10,15,5,'#e3e5d3')+rect(27,19,12,3,'#88c3bd');
    return s;
  });writeFileSync(`public/assets/heroes/${id}.svg`,image);
}
writeFileSync('public/assets/weapons/antiair.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="78" height="92" viewBox="0 0 78 92" shape-rendering="crispEdges">${path('M9 67H68L75 88H3Z','#172e37')}${rect(10,63,57,20,'#617e7d')}${rect(16,67,45,11,'#9da897')}${rect(26,37,27,34,'#243f4c')}${rect(30,43,19,18,'#8aa8ac')}${rect(5,31,17,39,'#203947')}${rect(55,31,17,39,'#203947')}${[11,30,50].map((x,i)=>path(`M${x} 46V18L${x+6} 3L${x+12} 18V46Z`,i===1?'#d9c38c':'#b7d6cf')+rect(x+3,22,6,15,'#527d8b')+rect(x+3,17,6,5,'#d7a16c')).join('')}${rect(34,58,11,6,'#8ed6df')}${rect(63,12,3,22,'#587e85')}${rect(58,9,14,6,'#a1c9bc')}</svg>`);
writeFileSync('public/assets/enemies/tank.svg',sheet(96,96,step=>rect(17,77+step*2,23,14,'#15292f')+rect(55,77-step*2,23,14,'#15292f')+path('M12 29H82L89 72L72 84H22L6 70Z','#172b30')+rect(15,33,66,44,'#596e66')+rect(10,34,17,30,'#849085')+rect(69,34,18,30,'#849085')+rect(25,39,44,34,'#a1a48a')+rect(28,43,38,7,'#697668')+rect(28,57,38,7,'#697668')+rect(39,47,16,16,'#384e4b')+rect(44,50,6,9,'#dda26e')+rect(31,13,34,24,'#243b3e')+rect(35,11,26,13,'#87937e')+rect(36,24,24,8,'#342f30')+rect(39,25,18,4,'#d99069')+rect(5,54,15,18,'#53695c')+rect(77,54,15,18,'#53695c')));
