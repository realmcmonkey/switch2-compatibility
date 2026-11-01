-- For the original TiDB schema, verify SHOW CREATE TABLE flags first: replace
-- fk_1 below if the report_id foreign key has a different name. Run during a
-- quiet period and execute every statement in order; the foreign key is absent
-- between the second and fourth statements. Existing flags are preserved.
ALTER TABLE flags ADD INDEX flags_by_report_user (report_id, user_id);
ALTER TABLE flags DROP FOREIGN KEY fk_1;
ALTER TABLE flags DROP INDEX one_flag;
ALTER TABLE flags ADD CONSTRAINT fk_1 FOREIGN KEY (report_id) REFERENCES reports(id);
