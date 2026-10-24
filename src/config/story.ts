export const STORY_KEY = 'last-light.prologue.seen';
export const STORY_SECONDS = 9;
export const STORY_CHAPTERS = [
  { title: '黑雾之后', text: '黑雾吞没了旧城，感染者与异变巨兽在雾中游荡。\n熟悉的街道，成了无人敢踏入的禁区。' },
  { title: '最后一片家园', text: '北境灯塔的光，让幸存者有了归处。\n灯火一旦熄灭，围墙后的家园也将被黑暗吞没。' },
  { title: '你是守灯人', text: '白天提灯探索，寻找物资、武器和幸存者；黄昏建设防线。\n夜晚指挥守军抵御怪物，守住灯塔，让家园等到黎明。' },
] as const;
let seenInMemory = false;
export function hasSeenStory(): boolean { try { return seenInMemory || sessionStorage.getItem(STORY_KEY) === '1'; } catch { return seenInMemory; } }
export function rememberStory(): void { seenInMemory = true; try { sessionStorage.setItem(STORY_KEY, '1'); } catch { /* 禁用存储时仍能跳过/开始。 */ } }
