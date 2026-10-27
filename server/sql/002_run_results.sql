-- 保留 v1 历史成绩；v2 将正式通关、失败/主动结束、演示记录分开查询。
ALTER TABLE scores ADD COLUMN scope text NOT NULL DEFAULT 'clear' CHECK (scope IN ('clear','challenge','demo'));
ALTER TABLE scores ADD COLUMN outcome text NOT NULL DEFAULT 'victory' CHECK (outcome IN ('victory','defeat','retired'));
ALTER TABLE scores ADD COLUMN exploration jsonb NOT NULL DEFAULT '{"kills":0,"caches":0,"rescued":0}'::jsonb;
ALTER TABLE scores DROP CONSTRAINT scores_duration_ms_check, DROP CONSTRAINT scores_score_check,
  DROP CONSTRAINT scores_score_version_check, DROP CONSTRAINT scores_game_version_check, DROP CONSTRAINT scores_stages_check;
ALTER TABLE scores ADD CHECK (duration_ms BETWEEN 0 AND 86400000), ADD CHECK (score BETWEEN 0 AND 25000),
  ADD CHECK (score_version IN (1,2)), ADD CHECK (game_version IN ('0.12.0','0.13.0')),
  ADD CHECK (jsonb_typeof(stages)='array' AND jsonb_array_length(stages) BETWEEN 0 AND 3),
  ADD CHECK (scope <> 'clear' OR outcome='victory'), ADD CHECK (scope <> 'challenge' OR outcome<>'victory'),
  ADD CHECK (outcome <> 'victory' OR duration_ms >= 120000 AND jsonb_array_length(stages)=3);
DROP INDEX scores_speed_idx;
DROP INDEX scores_score_idx;
CREATE INDEX scores_speed_idx ON scores (difficulty,score_version,scope,duration_ms ASC,score DESC,submitted_at ASC,id ASC);
CREATE INDEX scores_score_idx ON scores (difficulty,score_version,scope,score DESC,duration_ms ASC,submitted_at ASC,id ASC);
