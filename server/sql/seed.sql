-- 仅开发/测试数据库手动运行；生产迁移不会自动插入示例成绩。
INSERT INTO scores (id,nickname,difficulty,duration_ms,total_duration_ms,phase_times_ms,score,max_speed,score_version,game_version,scope,stages) VALUES
('00000000-0000-4000-8000-000000000001','示例守灯人','normal',900000,500000,'{"day":150000,"base":150000,"night":600000}',26520,3,3,'0.14.0','clear',
 '[{"stage":1,"kills":50,"bossKills":1,"lampHealth":300,"soldiers":3},{"stage":2,"kills":100,"bossKills":1,"lampHealth":300,"soldiers":3},{"stage":3,"kills":150,"bossKills":1,"lampHealth":300,"soldiers":3},{"stage":4,"kills":200,"bossKills":1,"lampHealth":300,"soldiers":3},{"stage":5,"kills":250,"bossKills":1,"lampHealth":300,"soldiers":3}]'),
('00000000-0000-4000-8000-000000000002','示例远行者','hard',1000000,600000,'{"day":250000,"base":150000,"night":600000}',26420,3,3,'0.14.0','clear',
 '[{"stage":1,"kills":50,"bossKills":1,"lampHealth":300,"soldiers":3},{"stage":2,"kills":100,"bossKills":1,"lampHealth":300,"soldiers":3},{"stage":3,"kills":150,"bossKills":1,"lampHealth":300,"soldiers":3},{"stage":4,"kills":200,"bossKills":1,"lampHealth":300,"soldiers":3},{"stage":5,"kills":250,"bossKills":1,"lampHealth":300,"soldiers":3}]')
ON CONFLICT DO NOTHING;
