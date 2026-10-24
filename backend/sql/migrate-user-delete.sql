-- ============================================================
-- 用户删除功能迁移：移除 tasks / gossip_posts / gossip_answers 指向 users 的外键
-- 背景：主管理员可在「用户管理」物理删除用户（连同其相关资料/互动数据）。
--       用户发布的任务与打听内容需要保留（发布者显示为"已注销"、不影响他人认领与评价），
--       因此必须去掉这三处外键，否则删除 users 行会被外键约束拦截。
-- 适用：本地 MySQL 8 / 线上 MariaDB 10.3+
-- 说明：全新库直接执行 init.sql 即可（已不含这三处外键），无需本脚本。
-- 注意：DROP FOREIGN KEY 不可重复执行，重复执行会报"约束不存在"，属正常。
-- ============================================================

USE eggworld;

ALTER TABLE tasks          DROP FOREIGN KEY fk_task_publisher;
ALTER TABLE gossip_posts   DROP FOREIGN KEY fk_gossip_user;
ALTER TABLE gossip_answers DROP FOREIGN KEY fk_answer_author;
