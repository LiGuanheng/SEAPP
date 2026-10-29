-- 不限时布防按实际活动时间累计；旧版成绩、旧迁移校验和保留。
ALTER TABLE scores DROP CONSTRAINT scores_version_check;
ALTER TABLE scores ADD CONSTRAINT scores_version_check CHECK (
  score_version=1 AND game_version='0.12.0' OR score_version=2 AND game_version='0.13.0' OR
  score_version=3 AND game_version='0.14.0' OR score_version=4 AND game_version='0.15.0' OR
  score_version=5 AND game_version='0.16.0');
ALTER TABLE scores DROP CONSTRAINT scores_score_check;
ALTER TABLE scores ADD CONSTRAINT scores_score_check CHECK (score BETWEEN 0 AND 48000);
ALTER TABLE scores DROP CONSTRAINT scores_phase_times_check;
ALTER TABLE scores ADD CONSTRAINT scores_phase_times_check CHECK (jsonb_typeof(phase_times_ms)='object' AND
  phase_times_ms ?& ARRAY['day','base','night'] AND
  jsonb_typeof(phase_times_ms->'day')='number' AND jsonb_typeof(phase_times_ms->'base')='number' AND jsonb_typeof(phase_times_ms->'night')='number' AND
  (phase_times_ms->>'day')::numeric BETWEEN 0 AND 86400000 AND
  (phase_times_ms->>'base')::numeric BETWEEN 0 AND 86400000 AND (phase_times_ms->>'night')::numeric BETWEEN 0 AND 600000 AND
  (phase_times_ms->>'day')::numeric = trunc((phase_times_ms->>'day')::numeric) AND
  (phase_times_ms->>'base')::numeric = trunc((phase_times_ms->>'base')::numeric) AND
  (phase_times_ms->>'night')::numeric = trunc((phase_times_ms->>'night')::numeric) AND
  (phase_times_ms->>'day')::numeric + (phase_times_ms->>'base')::numeric + (phase_times_ms->>'night')::numeric = duration_ms AND
  (score_version>=5 OR (phase_times_ms->>'base')::numeric<=150000) AND
  (score_version<3 OR outcome<>'victory' OR (phase_times_ms->>'night')::numeric=600000 AND (score_version>=5 OR (phase_times_ms->>'base')::numeric=150000)));
