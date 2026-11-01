-- Run once on an existing database. Existing users retain their current status.
ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0;
