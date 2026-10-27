-- 仅开发/测试数据库手动运行；生产迁移不会自动插入演示成绩。
INSERT INTO scores (id,nickname,difficulty,duration_ms,score,max_speed,score_version,game_version,stages) VALUES
('00000000-0000-4000-8000-000000000001','示例守灯人','normal',480000,18022,3,1,'0.12.0',
 '[{"stage":1,"kills":50,"bossKills":1,"lampHealth":300,"soldiers":3},{"stage":2,"kills":100,"bossKills":1,"lampHealth":300,"soldiers":3},{"stage":3,"kills":150,"bossKills":1,"lampHealth":300,"soldiers":3}]'),
('00000000-0000-4000-8000-000000000002','示例远行者','hard',600000,17902,3,1,'0.12.0',
 '[{"stage":1,"kills":50,"bossKills":1,"lampHealth":300,"soldiers":3},{"stage":2,"kills":100,"bossKills":1,"lampHealth":300,"soldiers":3},{"stage":3,"kills":150,"bossKills":1,"lampHealth":300,"soldiers":3}]')
ON CONFLICT DO NOTHING;
