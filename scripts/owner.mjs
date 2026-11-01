#!/usr/bin/env node
// Управление доступом в панель прямо на сервере (по SSH), без открытых страниц в интернете.
//   npm run owner -- create owner@mail.ru "Имя"   — создать владельца (или сделать владельцем существующий аккаунт)
//   npm run owner -- password owner@mail.ru        — задать новый пароль (если забыли, почта ещё не подключена)
//   npm run owner -- list                          — кто имеет доступ в панель
//   npm run owner -- unban all                     — снять все блокировки входа (или unban 1.2.3.4 для одного адреса)
// Пароль спрашивается в терминале и нигде не сохраняется в открытом виде.
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

const dbPath = process.env.HL_DB_PATH || resolve('.data/hauteline.sqlite');
if (!existsSync(dbPath)) {
  console.error(`База не найдена: ${dbPath}. Запустите сайт один раз (npm run start), чтобы она создалась, или укажите HL_DB_PATH.`);
  process.exit(1);
}
const d = new DatabaseSync(dbPath);
const [cmd, emailArg, ...nameParts] = process.argv.slice(2);
const email = (emailArg || '').trim().toLowerCase();
const hash = (p) => {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(p, salt, 64).toString('hex');
};
function ask(question) {
  return new Promise((done) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // не показываем пароль при вводе
    rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : '*');
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      done(answer);
    });
  });
}
async function newPassword() {
  const p = process.env.HL_NEW_PASSWORD || (await ask('Новый пароль (от 12 символов): '));
  if (p.length < 12 || p.length > 128) {
    console.error('Пароль должен быть от 12 до 128 символов.');
    process.exit(1);
  }
  if (!process.env.HL_NEW_PASSWORD && (await ask('Повторите пароль: ')) !== p) {
    console.error('Пароли не совпадают.');
    process.exit(1);
  }
  return p;
}
const emailOK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

if (cmd === 'unban') {
  const target = (emailArg || '').trim();
  if (!target) {
    console.error('Укажите адрес: npm run owner -- unban 1.2.3.4, или unban all, чтобы снять все блокировки');
    process.exit(1);
  }
  const has = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='login_bans'").get();
  if (!has) {
    console.log('Блокировок нет.');
  } else if (target === 'all') {
    const n = d.prepare('DELETE FROM login_bans').run().changes;
    console.log(`Снято блокировок: ${n}`);
  } else {
    const n = d.prepare('DELETE FROM login_bans WHERE key IN (?,?)').run('ip:' + target, 'email:' + target.toLowerCase()).changes;
    console.log(n ? 'Блокировка снята.' : 'Для этого адреса блокировки нет.');
  }
} else if (cmd === 'list') {
  const rows = d.prepare("SELECT email,name,role FROM users WHERE role<>'customer' ORDER BY role").all();
  console.table(rows);
} else if (cmd === 'create') {
  if (!emailOK) {
    console.error('Укажите почту: npm run owner -- create owner@mail.ru "Имя"');
    process.exit(1);
  }
  const existing = d.prepare('SELECT id FROM users WHERE email=?').get(email);
  const password = await newPassword();
  if (existing) {
    d.prepare("UPDATE users SET role='owner',password=? WHERE id=?").run(hash(password), existing.id);
    d.prepare('DELETE FROM sessions WHERE user_id=?').run(existing.id);
    console.log(`Готово: ${email} теперь владелец, пароль обновлён.`);
  } else {
    d.prepare('INSERT INTO users(id,email,password,name,role,created) VALUES (?,?,?,?,?,?)').run(
      randomBytes(12).toString('hex'),
      email,
      hash(password),
      nameParts.join(' ').trim(),
      'owner',
      Date.now(),
    );
    console.log(`Готово: владелец ${email} создан. Вход — /login → «По почте и паролю», затем /admin.`);
  }
} else if (cmd === 'password') {
  const user = emailOK && d.prepare('SELECT id,role FROM users WHERE email=?').get(email);
  if (!user) {
    console.error('Аккаунт с этой почтой не найден.');
    process.exit(1);
  }
  d.prepare('UPDATE users SET password=? WHERE id=?').run(hash(await newPassword()), user.id);
  d.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
  console.log('Пароль изменён, старые входы на всех устройствах завершены.');
} else {
  console.log('Команды: create <почта> [имя] · password <почта> · list');
}
