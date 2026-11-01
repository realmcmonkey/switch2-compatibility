-- Additive migration: existing users, games, emulators and reports are retained.
ALTER TABLE entries ADD COLUMN recommended_game_ids TEXT NULL;
CREATE INDEX public_user_reports ON reports (user_id, status, tested_at, id);
