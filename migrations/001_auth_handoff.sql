-- Additive migration: preserves existing users, reports and catalog records.
CREATE TABLE IF NOT EXISTS auth_handoffs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_state_hash CHAR(64) NOT NULL UNIQUE,
  client_state_hash CHAR(64) NOT NULL,
  client_state CHAR(43) NOT NULL,
  verifier_challenge CHAR(43) NOT NULL,
  code_hash CHAR(64) UNIQUE,
  user_id BIGINT UNSIGNED,
  status ENUM('started','processing','ready','consumed') NOT NULL DEFAULT 'started',
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY handoff_expiry (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY session_expiry (expires_at),
  KEY user_sessions (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
