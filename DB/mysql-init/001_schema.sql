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
  UNIQUE KEY uniq_email    (email)
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
-- === user_stats (per-user live stats for Smart Milk) ===================
CREATE TABLE IF NOT EXISTS user_stats (
  user_id                     INT UNSIGNED NOT NULL,
  container_id                VARCHAR(128) NULL,  -- e.g., DEVICE_ID
  current_amount_g            FLOAT        NULL,  -- latest reading (grams)
  avg_daily_consumption_g     FLOAT        NULL,  -- avg (start_of_day - end_of_day) over recent days
  cups_left                   FLOAT        NULL,  -- current_amount_g / avg_cup_grams
  percent_full                FLOAT        NULL,  -- 0..100
  expected_empty_date         DATE         NULL,  -- projected run-out date

  PRIMARY KEY (user_id),
  CONSTRAINT fk_stats_user
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- (אופציונלי) Seed לדוגמה – בטל/י אם לא צריך
-- INSERT IGNORE INTO users (username,password,full_name,email,phone,device_id)
-- VALUES ('demo','demo','Demo User','demo@example.com','050-0000000','device1');
