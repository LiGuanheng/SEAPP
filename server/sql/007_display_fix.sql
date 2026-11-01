-- 仅显示修复，评分规则6不变；保留v0.17.0历史成绩并允许修复版写入。
ALTER TABLE scores DROP CONSTRAINT scores_version_check;
ALTER TABLE scores ADD CONSTRAINT scores_version_check CHECK (
  score_version=1 AND game_version='0.12.0' OR score_version=2 AND game_version='0.13.0' OR
  score_version=3 AND game_version='0.14.0' OR score_version=4 AND game_version='0.15.0' OR
  score_version=5 AND game_version='0.16.0' OR score_version=6 AND game_version IN ('0.17.0','0.17.1'));
