import { z } from 'zod';

export function readConfig(env = process.env) {
  const raw = z.object({
    DATABASE_URL: z.url().refine(s => /^postgres(ql)?:\/\//.test(s)),
    DATABASE_SSL: z.enum(['disable', 'verify-full']).default('disable'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().default('127.0.0.1'),
    CORS_ORIGINS: z.string().default('http://127.0.0.1:5173,http://localhost:5173'),
    TRUST_PROXY: z.enum(['0', '1']).default('0'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  }).parse(env);
  const origins = raw.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  if (!origins.length || origins.some(s => { try { const u = new URL(s); return u.origin !== s || !['http:', 'https:'].includes(u.protocol); } catch { return true; } })) throw new Error('CORS_ORIGINS 必须是逗号分隔的准确来源（无路径、无末尾斜杠）');
  return { ...raw, origins };
}
export type Config = ReturnType<typeof readConfig>;
