// 原创矢量细节；保持旧素材尺寸与地基，不改变命中/碰撞。
import {readFileSync,writeFileSync} from 'node:fs';
const dir='public/assets/weapons/';
const edits={
 lighthouse:'<g><path d="M24 120H64V125H24Z" fill="#c9b489"/><path d="M28 56L35 56L35 118L28 118Z" fill="#c6cbb0"/><path d="M53 56H59V119H53Z" fill="#3b5854"/><path d="M28 80H59M28 103H59M23 57H65M21 124H67" stroke="#728b7c" stroke-width="1"/><path d="M18 22L44 9L70 22Z" fill="#344d52"/><path d="M20 22L44 12L66 22Z" fill="#8e9b87"/><path d="M23 25H66M23 48H66" stroke="#c6bf92" stroke-width="1"/><path d="M18 49V56M27 49V56M36 49V56M45 49V56M54 49V56M63 49V56M71 49V56M17 55H72" stroke="#3e5954" stroke-width="1"/><path d="M26 32H62V34H26Z" fill="#fff5ce"/><path d="M40 112H49V126H40Z" fill="#172e35"/><path d="M42 112V125M45 112V125" stroke="#4d665e" stroke-width="1"/><rect x="47" y="119" width="1" height="2" fill="#e5bf79"/><path d="M34 128H55M30 131H59M26 134H63" stroke="#526a64" stroke-width="1"/></g>',
 turret:'<g fill="#c7c7a5"><rect x="8" y="17" width="2" height="2"/><rect x="53" y="17" width="2" height="2"/><rect x="8" y="57" width="2" height="2"/><rect x="53" y="57" width="2" height="2"/></g><path d="M13 23V50H20M44 50H52V23M10 63H54M18 60H46" fill="none" stroke="#39534c" stroke-width="1"/><path d="M19 27L25 23H39L45 27M19 47L25 51H39L45 47" fill="none" stroke="#bdba92" stroke-width="1"/>',
 sniper:'<path d="M18 28H47M20 31H45M19 54H45M17 58H47" stroke="#a7b5aa" stroke-width="1"/><path d="M22 35L42 52M42 35L22 52" stroke="#d1c5a4" stroke-width="2"/>',
 inferno:'<path d="M28 34H53M27 59H55M17 72H64M20 78H60" stroke="#c8b48c" stroke-width="1"/><path d="M32 37V55M48 37V55" stroke="#f4ba73" stroke-width="1"/><rect x="37" y="39" width="6" height="12" fill="#ffdf9a"/>',
 eagle:'<path d="M13 68H66M17 76H61M26 48V60M54 48V60M31 46H49" stroke="#e2cc9c" stroke-width="1"/><path d="M10 14L28 24M16 25L30 31M51 24L68 13M49 31L62 24" stroke="#6c857f" stroke-width="1"/>',
 pounder:'<path d="M17 37H61M17 40H61M28 52H52M28 56H52M16 72H64" stroke="#f0d2a0" stroke-width="1"/><path d="M20 23V30M58 23V30M31 18H48" stroke="#bfd2c6" stroke-width="2"/>',
};
for(const [key,detail]of Object.entries(edits)){const f=dir+key+'.svg';const source=readFileSync(f,'utf8');if(!source.includes(detail))writeFileSync(f,source.replace('</svg>',detail+'</svg>'));}
