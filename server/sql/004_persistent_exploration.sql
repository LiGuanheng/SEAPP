-- v0.15 沿用五阶段计分公式，战斗与探索规则升级后隔离新旧榜单。
ALTER TABLE scores DROP CONSTRAINT scores_version_check;
ALTER TABLE scores ADD CONSTRAINT scores_version_check CHECK (
  score_version=1 AND game_version='0.12.0' OR score_version=2 AND game_version='0.13.0' OR
  score_version=3 AND game_version='0.14.0' OR score_version=4 AND game_version='0.15.0');
ALTER TABLE scores DROP CONSTRAINT scores_victory_check;
ALTER TABLE scores ADD CONSTRAINT scores_victory_check CHECK (outcome<>'victory' OR
  score_version<3 AND jsonb_array_length(stages)=3 OR score_version>=3 AND jsonb_array_length(stages)=5);
