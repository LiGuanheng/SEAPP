// 原创网格矢量建筑；延续现有像素轮廓，不使用其他游戏素材。
import {writeFileSync} from 'node:fs';
const rect=(x,y,w,h,c)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
const path=(d,c)=>`<path d="${d}" fill="${c}"/>`;
const base=path('M8 65H70L77 88H2Z','#182f38')+rect(10,61,58,20,'#5c7470')+rect(16,67,46,9,'#b6b697');
const art={
  pounder:base+rect(16,22,9,47,'#364f53')+rect(55,22,9,47,'#364f53')+rect(27,25,25,43,'#876b55')+rect(30,11,19,32,'#af9270')+rect(13,31,54,20,'#263e45')+rect(18,33,44,10,'#d2bd88')+rect(24,49,32,8,'#9c7f5a')+rect(28,8,23,7,'#dfca93'),
  inferno:base+path('M23 65L28 22H53L59 65Z','#314c53')+rect(31,30,18,28,'#8a6d53')+rect(23,20,36,10,'#baa87d')+path('M26 20L33 7L38 16L47 2L54 19Z','#df7851')+path('M35 20L42 10L47 20Z','#ffdf93')+rect(35,40,11,14,'#e9985e'),
  eagle:base+rect(21,43,39,26,'#ac9871')+rect(29,26,24,31,'#283f4a')+path('M11 23L4 7L30 18L39 30L48 17L74 6L68 25L49 41H29Z','#cbbb8b')+path('M17 18L33 25L39 35L47 25L64 16L53 32H25Z','#7f9289')+rect(31,29,17,33,'#d5b77a')+rect(35,10,10,34,'#536f75')+rect(35,7,10,9,'#1f343e'),
};
for(const[key,body]of Object.entries(art))writeFileSync(`public/assets/weapons/${key}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="92" viewBox="0 0 80 92" shape-rendering="crispEdges">${body}</svg>`);
