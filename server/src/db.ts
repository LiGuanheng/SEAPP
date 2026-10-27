import pg from 'pg';
import type { Config } from './config.ts';
import { SCORE_VERSION, type BoardType, type RankDifficulty, type ScoreSubmission, type LeaderboardEntry, type ScoreScope, type ScoreRanks } from '../../src/core/scoring.ts';

export function createPool(config: Pick<Config, 'DATABASE_URL' | 'DATABASE_SSL'>): pg.Pool {
  // 连接串中的 sslmode 会覆盖 pg 的 ssl 对象；统一由配置控制，并始终验证证书。
  const url = new URL(config.DATABASE_URL);
  if (config.DATABASE_SSL === 'disable' && ['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '')) throw new Error('连接串要求 TLS，请设置 DATABASE_SSL=verify-full');
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
  const pool = new pg.Pool({
    connectionString: url.toString(), ssl: config.DATABASE_SSL === 'verify-full' ? { rejectUnauthorized: true } : false,
    max: 5, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30_000,
    statement_timeout: 5000, query_timeout: 6000, application_name: 'last-light-api',
  });
  // 空闲连接出错也必须有监听器，避免进程因未处理的 error 退出；请求错误由路由统一记录。
  pool.on('error', error => process.stderr.write(`PostgreSQL pool error: ${'code' in error ? String(error.code) : error.name}\n`));
  return pool;
}
export interface ScoreStore {
  health(): Promise<void>;
  submit(score: ScoreSubmission): Promise<{ entry: LeaderboardEntry; created: boolean; ranks?: ScoreRanks }>;
  leaderboard(board: BoardType, difficulty: RankDifficulty, limit: number, scope?: ScoreScope): Promise<LeaderboardEntry[]>;
}
export class ConflictError extends Error {}
const columns = 'id, nickname, difficulty, duration_ms AS "durationMs", score, max_speed AS "maxSpeed", submitted_at AS "submittedAt", scope, outcome';
export function createStore(pool: pg.Pool): ScoreStore {
  const rank = async (s: ScoreSubmission): Promise<ScoreRanks> => {
    const result = await pool.query<{ speed: string; score: string }>(`SELECT speed,score FROM (
      SELECT id,row_number() OVER (ORDER BY duration_ms ASC,score DESC,submitted_at ASC,id ASC) AS speed,
      row_number() OVER (ORDER BY score DESC,duration_ms ASC,submitted_at ASC,id ASC) AS score
      FROM scores WHERE difficulty=$1 AND score_version=$2 AND scope=$3) positions WHERE id=$4`, [s.difficulty, SCORE_VERSION, s.scope, s.runId]);
    return { speed: s.scope === 'clear' ? Number(result.rows[0].speed) : null, score: Number(result.rows[0].score) };
  };
  return {
    async health() { await pool.query('SELECT id FROM scores LIMIT 0'); },
    async submit(s) {
      const result = await pool.query<LeaderboardEntry>(`INSERT INTO scores
        (id, nickname, difficulty, duration_ms, score, max_speed, score_version, game_version, stages,scope,outcome,exploration)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb) ON CONFLICT (id) DO NOTHING RETURNING ${columns}`,
      [s.runId, s.nickname, s.difficulty, s.durationMs, s.score, s.maxSpeed, s.scoreVersion, s.gameVersion, JSON.stringify(s.stages), s.scope, s.outcome, JSON.stringify(s.exploration)]);
      if (result.rows[0]) return { entry: result.rows[0], created: true, ranks: await rank(s) };
      const existing = await pool.query<LeaderboardEntry & { matches: boolean }>(`SELECT ${columns},
        (nickname=$2 AND difficulty=$3 AND duration_ms=$4 AND score=$5 AND max_speed=$6 AND score_version=$7 AND game_version=$8 AND stages=$9::jsonb AND scope=$10 AND outcome=$11 AND exploration=$12::jsonb) AS matches
        FROM scores WHERE id=$1`, [s.runId, s.nickname, s.difficulty, s.durationMs, s.score, s.maxSpeed, s.scoreVersion, s.gameVersion, JSON.stringify(s.stages), s.scope, s.outcome, JSON.stringify(s.exploration)]);
      const row = existing.rows[0];
      if (!row?.matches) throw new ConflictError('该战役已提交其他内容');
      const { matches: _matches, ...entry } = row;
      return { entry, created: false, ranks: await rank(s) };
    },
    async leaderboard(board, difficulty, limit, scope = 'clear') {
      // 排序片段仅由后端枚举决定；所有用户值通过占位符绑定。
      const order = board === 'speed' ? 'duration_ms ASC, score DESC' : 'score DESC, duration_ms ASC';
      const result = await pool.query<LeaderboardEntry>(`SELECT ${columns} FROM scores WHERE difficulty=$1 AND score_version=$2 AND scope=$3
        ORDER BY ${order}, submitted_at ASC, id ASC LIMIT $4`, [difficulty, SCORE_VERSION, scope, limit]);
      return result.rows;
    },
  };
}
