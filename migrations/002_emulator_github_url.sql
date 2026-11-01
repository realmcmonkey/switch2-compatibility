-- Additive: preserves existing entries and their Wikipedia and official-site links.
ALTER TABLE entries ADD COLUMN github_url VARCHAR(2048) NULL;
