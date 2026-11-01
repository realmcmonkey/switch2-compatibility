-- Keep an index for report lookups and the foreign key, then remove the old
-- one-flag-per-user restriction. Existing flags are preserved.
ALTER TABLE flags ADD INDEX flags_by_report_user (report_id, user_id);
ALTER TABLE flags DROP INDEX one_flag;
