-- === Database (first-run only) ===========================================
CREATE DATABASE IF NOT EXISTS users_db
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE users_db;

-- === users (טבלת העוגן) ==================================================
CREATE TABLE IF NOT EXISTS users (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username   VARCHAR(64)  NOT NULL,
  password   VARCHAR(255) NOT NULL,
  full_name  VARCHAR(255) NOT NULL,
  email      VARCHAR(255) NOT NULL,
  phone      VARCHAR(32)  NULL,
  device_id  VARCHAR(50)  NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_username (username),
  UNIQUE KEY uniq_email    (email),
  UNIQUE KEY uniq_device   (device_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- === weight_data (קורא נתונים לפי device_id של users) ===================
CREATE TABLE IF NOT EXISTS weight_data (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id  VARCHAR(50)  NOT NULL,
  weight     FLOAT        NOT NULL,
  `timestamp` DATETIME    NOT NULL,
  PRIMARY KEY (id),
  -- FK אל users.device_id (חייב להיות ייחודי ב-users, והגדרנו uniq_device למעלה)
  CONSTRAINT fk_wd_user_device
    FOREIGN KEY (device_id) REFERENCES users(device_id),
  -- אינדקסים לשאילתות בזמן
  UNIQUE KEY uniq_device_time (device_id, `timestamp`),
  KEY idx_weight_device_time (device_id, `timestamp`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- === client_stats -> user_stats (סטטיסטיקות פר משתמש) ===================
CREATE TABLE IF NOT EXISTS user_stats (
  user_id      INT UNSIGNED NOT NULL,
  sample_count INT          NOT NULL DEFAULT 0,
  avg_weight   FLOAT,
  min_weight   FLOAT,
  last_updated DATETIME,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_stats_user
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- (אופציונלי) Seed לדוגמה – בטל/י אם לא צריך
-- INSERT IGNORE INTO users (username,password,full_name,email,phone,device_id)
-- VALUES ('demo','demo','Demo User','demo@example.com','050-0000000','device1');
