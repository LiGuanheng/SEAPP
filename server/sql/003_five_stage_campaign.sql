-- 五阶段与探索/布防/守夜游戏计时。保留 v1/v2 历史行和旧迁移校验和，当前榜单只查询 v3。
ALTER TABLE scores ADD COLUMN total_duration_ms integer NOT NULL DEFAULT 0;
UPDATE scores SET total_duration_ms = duration_ms;
ALTER TABLE scores ADD COLUMN phase_times_ms jsonb NOT NULL DEFAULT '{"day":0,"base":0,"night":0}'::jsonb;
UPDATE scores SET phase_times_ms = jsonb_build_object('day',duration_ms,'base',0,'night',0);

-- 002 的跨列检查由 PostgreSQL 自动命名；在同一迁移事务中统一重建完整约束。
DO $$ DECLARE old_check record; BEGIN
  FOR old_check IN SELECT conname FROM pg_constraint WHERE conrelid='scores'::regclass AND contype='c' LOOP
    EXECUTE format('ALTER TABLE scores DROP CONSTRAINT %I', old_check.conname);
  END LOOP;
END $$;

ALTER TABLE scores
  ADD CONSTRAINT scores_nickname_check CHECK (char_length(nickname) BETWEEN 2 AND 16),
  ADD CONSTRAINT scores_difficulty_check CHECK (difficulty IN ('easy','normal','hard')),
  ADD CONSTRAINT scores_duration_ms_check CHECK (duration_ms BETWEEN 0 AND 86400000),
  ADD CONSTRAINT scores_total_duration_check CHECK (total_duration_ms BETWEEN 0 AND 86400000),
  ADD CONSTRAINT scores_score_check CHECK (score BETWEEN 0 AND 40000),
  ADD CONSTRAINT scores_max_speed_check CHECK (max_speed BETWEEN 1 AND 3),
  ADD CONSTRAINT scores_version_check CHECK (
    score_version=1 AND game_version='0.12.0' OR score_version=2 AND game_version='0.13.0' OR score_version=3 AND game_version='0.14.0'),
  ADD CONSTRAINT scores_scope_check CHECK (scope IN ('clear','challenge','demo') AND (score_version<3 OR scope<>'demo')),
  ADD CONSTRAINT scores_outcome_check CHECK (outcome IN ('victory','defeat','retired')),
  ADD CONSTRAINT scores_stages_check CHECK (jsonb_typeof(stages)='array' AND jsonb_array_length(stages) BETWEEN 0 AND 5),
  ADD CONSTRAINT scores_clear_check CHECK (scope<>'clear' OR outcome='victory'),
  ADD CONSTRAINT scores_victory_check CHECK (outcome<>'victory' OR
    score_version<3 AND jsonb_array_length(stages)=3 OR score_version=3 AND jsonb_array_length(stages)=5),
  ADD CONSTRAINT scores_phase_times_check CHECK (jsonb_typeof(phase_times_ms)='object' AND
    phase_times_ms ?& ARRAY['day','base','night'] AND
    jsonb_typeof(phase_times_ms->'day')='number' AND jsonb_typeof(phase_times_ms->'base')='number' AND jsonb_typeof(phase_times_ms->'night')='number' AND
    (phase_times_ms->>'day')::numeric BETWEEN 0 AND 86400000 AND
    (phase_times_ms->>'base')::numeric BETWEEN 0 AND 150000 AND (phase_times_ms->>'night')::numeric BETWEEN 0 AND 600000 AND
    (phase_times_ms->>'day')::numeric = trunc((phase_times_ms->>'day')::numeric) AND
    (phase_times_ms->>'base')::numeric = trunc((phase_times_ms->>'base')::numeric) AND
    (phase_times_ms->>'night')::numeric = trunc((phase_times_ms->>'night')::numeric) AND
    (phase_times_ms->>'day')::numeric + (phase_times_ms->>'base')::numeric + (phase_times_ms->>'night')::numeric = duration_ms AND
    (score_version<3 OR outcome<>'victory' OR (phase_times_ms->>'base')::numeric=150000 AND (phase_times_ms->>'night')::numeric=600000));

DROP INDEX scores_speed_idx;
DROP INDEX scores_score_idx;
CREATE INDEX scores_speed_idx ON scores (difficulty,score_version,scope,duration_ms ASC,score DESC,total_duration_ms ASC,submitted_at ASC,id ASC);
CREATE INDEX scores_score_idx ON scores (difficulty,score_version,scope,score DESC,duration_ms ASC,total_duration_ms ASC,submitted_at ASC,id ASC);
