-- Требования законодательства РФ:
-- auth_phone — российский номер, подтверждённый SMS-кодом (ст. 8 ч. 10 149-ФЗ: авторизация российских пользователей);
-- phone_codes — одноразовые коды входа (хранится только хеш);
-- consents — журнал согласий и их отзывов (152-ФЗ ст. 9: оператор обязан доказать, что согласие получено).
ALTER TABLE users ADD COLUMN auth_phone TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_phone ON users(auth_phone) WHERE auth_phone IS NOT NULL;
CREATE TABLE IF NOT EXISTS phone_codes(phone TEXT PRIMARY KEY,hash TEXT NOT NULL,purpose TEXT NOT NULL,expires INTEGER NOT NULL,tries INTEGER NOT NULL DEFAULT 0,sent INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS consents(id INTEGER PRIMARY KEY AUTOINCREMENT,subject TEXT NOT NULL,kind TEXT NOT NULL,granted INTEGER NOT NULL,doc TEXT NOT NULL,source TEXT NOT NULL,ip TEXT NOT NULL DEFAULT '',agent TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS consents_subject ON consents(subject);
PRAGMA user_version=4;
