-- Блокировки входа по паролю: после 10 неверных паролей подряд вход с адреса закрывается
-- на сутки, при повторе на неделю, дальше на месяц. level хранит, сколько раз уже блокировали.
CREATE TABLE IF NOT EXISTS login_bans(
  key TEXT PRIMARY KEY,
  fails INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  banned_until INTEGER NOT NULL DEFAULT 0,
  last_email TEXT NOT NULL DEFAULT '',
  updated INTEGER NOT NULL
);
PRAGMA user_version=5;
