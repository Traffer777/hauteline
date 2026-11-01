import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { initialProducts, Product } from './catalog';
export type User = {
  id: string;
  email: string;
  name: string;
  phone: string;
  address: string;
  role: string;
  marketing: number;
  created: number;
};
const globalDB = globalThis as unknown as { hlDB?: DatabaseSync };
export function db() {
  if (!globalDB.hlDB) {
    const path = process.env.HL_DB_PATH || resolve('.data/hauteline.sqlite');
    mkdirSync(dirname(path), { recursive: true });
    const d = new DatabaseSync(path);
    d.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    if ((d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version < 1)
      d.exec(readFileSync(resolve('migrations/001.sql'), 'utf8'));
    if ((d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version < 2)
      d.exec(readFileSync(resolve('migrations/002.sql'), 'utf8'));
    if ((d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version < 3)
      d.exec(readFileSync(resolve('migrations/003.sql'), 'utf8'));
    if ((d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version < 4)
      d.exec(readFileSync(resolve('migrations/004.sql'), 'utf8'));
    if ((d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version < 5)
      d.exec(readFileSync(resolve('migrations/005.sql'), 'utf8'));
    if (!d.prepare('SELECT id FROM products LIMIT 1').get()) {
      d.exec('BEGIN');
      try {
        for (const p of initialProducts) {
          d.prepare('INSERT INTO products VALUES (?,?)').run(p.id, JSON.stringify(p));
          for (const [i, size] of p.sizes.entries())
            d.prepare('INSERT INTO inventory VALUES (?,?,?)').run(p.id, size, i < p.stock ? 1 : 0);
        }
        d.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run(
          'shop',
          JSON.stringify({
            telegram: DEFAULT_TELEGRAM_MANAGER,
            telegramChannel: DEFAULT_TELEGRAM_CHANNEL,
            whatsapp: '',
            email: '',
            promoEnabled: false,
            promoStart: '',
            promoEnd: '',
            promoLimit: 10,
            bannerSeconds: 12,
            shippingFreePromo: true,
          }),
        );
        d.exec('COMMIT');
      } catch (e) {
        d.exec('ROLLBACK');
        throw e;
      }
    }
    globalDB.hlDB = d;
  }
  const version = (globalDB.hlDB.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version < 2) globalDB.hlDB.exec(readFileSync(resolve('migrations/002.sql'), 'utf8'));
  if (version < 3) globalDB.hlDB.exec(readFileSync(resolve('migrations/003.sql'), 'utf8'));
  if (version < 4) globalDB.hlDB.exec(readFileSync(resolve('migrations/004.sql'), 'utf8'));
  if (version < 5) globalDB.hlDB.exec(readFileSync(resolve('migrations/005.sql'), 'utf8'));
  return globalDB.hlDB;
}
export const uid = () => randomBytes(12).toString('hex');
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function passwordOK(password: string, stored: string) {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const h = scryptSync(password, salt, 64);
  const original = Buffer.from(key, 'hex');
  return h.length === original.length && timingSafeEqual(h, original);
}
export function currentUser(req: Request): User | null {
  const cookie = req.headers.get('cookie') || '';
  const token = cookie.match(/(?:^|;\s*)hl_session=([^;]+)/)?.[1];
  if (!token) return null;
  return (
    (db()
      .prepare(
        'SELECT u.id,u.email,u.name,u.phone,u.address,u.role,u.marketing,u.created FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.hash=? AND s.expires>?',
      )
      .get(hash(token), Date.now()) as User) || null
  );
}
export function sessionResponse(user: User) {
  const token = randomBytes(32).toString('hex');
  // заодно убираем истёкшие сессии, чтобы таблица не росла
  db().prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  db()
    .prepare('INSERT INTO sessions VALUES (?,?,?)')
    .run(hash(token), user.id, Date.now() + 30 * 86400000);
  return Response.json(user, {
    headers: {
      'Set-Cookie': `hl_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    },
  });
}
export const permissions: Record<string, string[]> = {
  owner: [
    'banners',
    'products',
    'orders',
    'requests',
    'clients',
    'campaigns',
    'promotions',
    'analytics',
    'settings',
    'roles',
    'audit',
  ],
  lead: [
    'banners',
    'products',
    'orders',
    'requests',
    'clients',
    'campaigns',
    'promotions',
    'analytics',
    'audit',
  ],
  manager: ['orders', 'requests', 'clients'],
  content: ['products', 'banners'],
  marketing: ['campaigns', 'promotions', 'analytics', 'banners'],
};
export function allowed(user: User | null, area: string) {
  return !!user && !!permissions[user.role]?.includes(area);
}
export function audit(user: User, action: string, object: string, details: unknown) {
  db()
    .prepare('INSERT INTO audit(actor,action,object,details,created) VALUES (?,?,?,?,?)')
    .run(user.id, action, object, JSON.stringify(details), Date.now());
}
// Контакты от заказчика: менеджер в Telegram и канал магазина. Можно поменять в «Настройках» панели.
export const DEFAULT_TELEGRAM_MANAGER = 'https://t.me/manager_ale';
export const DEFAULT_TELEGRAM_CHANNEL = 'https://t.me/hauteline';
export function settings() {
  const cfg = JSON.parse(
    (db().prepare('SELECT data FROM settings WHERE key=?').get('shop') as { data: string }).data,
  );
  // поля, которых не было в старых базах, получают значения по умолчанию
  if (cfg.telegramChannel === undefined) cfg.telegramChannel = DEFAULT_TELEGRAM_CHANNEL;
  if (!Array.isArray(cfg.promotions)) cfg.promotions = [];
  if (!Array.isArray(cfg.promoCodes)) cfg.promoCodes = [];
  if (cfg.telegramManagerSet === undefined && !cfg.telegram) cfg.telegram = DEFAULT_TELEGRAM_MANAGER;
  return cfg;
}
export function expireReservations() {
  const now = Date.now();
  db()
    .prepare(
      "UPDATE orders SET payment='expired',status='Резерв истёк' WHERE payment='pending' AND expires<=?",
    )
    .run(now);
  db().prepare('DELETE FROM reservations WHERE expires<=?').run(now);
}
export function catalog() {
  expireReservations();
  return (db().prepare('SELECT data FROM products').all() as { data: string }[]).map((r) => {
    const p = JSON.parse(r.data) as Product;
    const variants = db().prepare('SELECT size,stock FROM inventory WHERE product_id=?').all(p.id) as {
      size: string;
      stock: number;
    }[];
    p.stock = variants.reduce((s, v) => s + v.stock, 0);
    return { ...p, variants };
  });
}
export function enqueue(recipient: string, subject: string, body: string, kind = 'transactional') {
  db()
    .prepare('INSERT INTO outbox(id,recipient,subject,body,kind,created) VALUES (?,?,?,?,?,?)')
    .run(uid(), recipient, subject, body, kind, Date.now());
}
export function rateLimit(key: string, max = 10) {
  const d = db(),
    now = Date.now();
  const r = d.prepare('SELECT count,reset_at FROM attempts WHERE key=?').get(key) as
    { count: number; reset_at: number } | undefined;
  if (!r || r.reset_at < now) {
    d.prepare('INSERT OR REPLACE INTO attempts VALUES (?,?,?)').run(key, 1, now + 15 * 60000);
    return false;
  }
  d.prepare('UPDATE attempts SET count=count+1 WHERE key=?').run(key);
  return r.count >= max;
}

// ── Блокировки входа по паролю ──
// 10 неверных паролей подряд: вход закрыт на сутки; следующие 10 после разблокировки: на неделю; дальше: на месяц.
// Ключ: IP посетителя. Если сайт стоит без прокси и IP неизвестен, ключ привязывается к почте,
// чтобы одна блокировка не закрыла вход всем сразу. Через полгода без нарушений ступень сбрасывается.
export const LOGIN_FAILS_LIMIT = 10;
const DAY = 86400000;
const BAN_STEPS = [DAY, 7 * DAY, 30 * DAY];
export function loginBanKey(req: Request, email: string) {
  const ip = clientIp(req);
  return ip === 'local' ? 'email:' + email.toLowerCase() : 'ip:' + ip;
}
export function loginBannedUntil(key: string) {
  const r = db().prepare('SELECT banned_until FROM login_bans WHERE key=?').get(key) as
    | { banned_until: number }
    | undefined;
  return r && r.banned_until > Date.now() ? r.banned_until : 0;
}
export function loginFailed(key: string, email: string) {
  const d = db(),
    now = Date.now();
  let r = d.prepare('SELECT fails,level,banned_until,updated FROM login_bans WHERE key=?').get(key) as
    | { fails: number; level: number; banned_until: number; updated: number }
    | undefined;
  if (r && r.banned_until < now && now - r.updated > 180 * DAY) r = { ...r, level: 0, fails: 0 };
  let fails = (r?.fails || 0) + 1;
  let level = r?.level || 0;
  let until = r && r.banned_until > now ? r.banned_until : 0;
  if (fails >= LOGIN_FAILS_LIMIT) {
    until = now + BAN_STEPS[Math.min(level, BAN_STEPS.length - 1)];
    level += 1;
    fails = 0;
  }
  d.prepare(
    'INSERT OR REPLACE INTO login_bans(key,fails,level,banned_until,last_email,updated) VALUES (?,?,?,?,?,?)',
  ).run(key, fails, level, until, email.toLowerCase().slice(0, 200), now);
  return until;
}
export function loginSucceeded(key: string) {
  // счётчик ошибок обнуляется, ступень остаётся: повторная серия ошибок даст уже следующий срок
  db().prepare('UPDATE login_bans SET fails=0,updated=? WHERE key=?').run(Date.now(), key);
}
export function loginBanText(until: number) {
  const date = new Date(until).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Вход временно заблокирован до ${date} (мск): 10 раз подряд введён неверный пароль. Если это вы, напишите в поддержку`;
}

// Сброс счётчика попыток (например, после успешного входа).
export function resetRateLimit(key: string) {
  db().prepare('DELETE FROM attempts WHERE key=?').run(key);
}

// IP клиента для лимитов. За прокси (nginx, Cloudflare) берём первый адрес из заголовка;
// без прокси заголовков нет — тогда общий ключ «local» (лимиты щадящие).
// Первый адрес в X-Forwarded-For пишет сам посетитель, его можно подделать и обойти блокировку.
// Поэтому берём X-Real-IP (nginx ставит $remote_addr), затем CF-Connecting-IP, затем последний адрес цепочки,
// который добавил наш прокси.
export function clientIp(req: Request) {
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 64);
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf.slice(0, 64);
  const chain = req.headers.get('x-forwarded-for')?.split(',').map((x) => x.trim()).filter(Boolean);
  return chain?.length ? chain[chain.length - 1].slice(0, 64) : 'local';
}

// Время акции админ вводит в поле datetime-local без часового пояса — считаем его московским.
function promoTime(value: string) {
  if (!value) return NaN;
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : value + '+03:00').getTime();
}
export function promoActive(cfg: { promoEnabled?: boolean; promoStart?: string; promoEnd?: string }, now = Date.now()) {
  if (!cfg.promoEnabled) return false;
  const start = promoTime(cfg.promoStart || '');
  const end = promoTime(cfg.promoEnd || '');
  return (Number.isNaN(start) || start <= now) && (Number.isNaN(end) || end > now);
}

// ───── Законодательство РФ ─────
/** Версии юридических документов: меняйте дату при правке текста — в журнале согласий видно, на какую редакцию согласился человек. */
export const LEGAL_VERSION = '2026-10-17';
export type ConsentKind = 'pd' | 'marketing' | 'cookies' | 'recommendations';
/** Журнал согласий (152-ФЗ ст. 9 ч. 3: обязанность доказать получение согласия лежит на операторе). */
export function logConsent(
  req: Request,
  subject: string,
  kind: ConsentKind,
  granted: boolean,
  source: string,
) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
  db()
    .prepare('INSERT INTO consents(subject,kind,granted,doc,source,ip,agent,created) VALUES (?,?,?,?,?,?,?,?)')
    .run(
      subject.toLowerCase().slice(0, 200),
      kind,
      granted ? 1 : 0,
      LEGAL_VERSION,
      source,
      ip.slice(0, 64),
      (req.headers.get('user-agent') || '').slice(0, 300),
      Date.now(),
    );
}
/** Российский мобильный номер → «79XXXXXXXXX» или null. Принимает +7, 8 и пробелы/скобки/дефисы. */
export function ruMobile(v: unknown) {
  if (typeof v !== 'string') return null;
  let digits = v.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (digits.length === 10 && digits.startsWith('9')) digits = '7' + digits;
  return /^79\d{9}$/.test(digits) ? digits : null;
}
export const formatRu = (d: string) => `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
/** Без подключённого SMS-сервиса код показывается на экране — только при разработке и в тестах. */
export const smsConnected = () => !!process.env.SMS_RU_API_ID;
// Тестовый режим (оплата-заглушка, коды СМС в ответе, без проверки ПВЗ). На боевом сервере (NODE_ENV=production)
// он включается только вместе с HL_TEST_MODE_PRODUCTION=1, чтобы случайно оставленный HL_TEST_MODE=1 не открыл сайт.
export const testMode = () =>
  process.env.HL_TEST_MODE === '1' &&
  (process.env.NODE_ENV !== 'production' || process.env.HL_TEST_MODE_PRODUCTION === '1');
export const smsDevMode = () => !smsConnected() && (process.env.NODE_ENV !== 'production' || testMode());
/** Отправка SMS через SMS.ru (российский сервис). Ключ — переменная SMS_RU_API_ID. */
export async function sendSms(phone: string, message: string) {
  const id = process.env.SMS_RU_API_ID;
  if (!id) return false;
  const q = new URLSearchParams({ api_id: id, to: phone, msg: message, json: '1' });
  if (process.env.SMS_RU_FROM) q.set('from', process.env.SMS_RU_FROM);
  try {
    const r = await fetch('https://sms.ru/sms/send?' + q.toString(), { method: 'POST' });
    const data = (await r.json()) as { status?: string; sms?: Record<string, { status?: string }> };
    return data.status === 'OK' && data.sms?.[phone]?.status === 'OK';
  } catch {
    return false;
  }
}
