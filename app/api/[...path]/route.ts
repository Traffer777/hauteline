import { randomInt } from 'node:crypto';
import {
  db,
  currentUser,
  uid,
  hash,
  passwordHash,
  passwordOK,
  sessionResponse,
  permissions,
  allowed,
  audit,
  settings,
  catalog,
  expireReservations,
  enqueue,
  rateLimit,
  resetRateLimit,
  loginBanKey,
  loginBannedUntil,
  loginFailed,
  loginSucceeded,
  loginBanText,
  testMode,
  clientIp,
  promoActive,
  User,
  logConsent,
  ruMobile,
  formatRu,
  smsDevMode,
  smsConnected,
  sendSms,
  LEGAL_VERSION,
} from '@/lib/server';
import { Product } from '@/lib/catalog';
import { priceCart, normalizePromotions, normalizeCodes, type PricingLine, type PromoCode } from '@/lib/pricing';
import { buildContacts, contactDetail, cleanTags, noteKinds, normEmail, type CrmSource } from '@/lib/crm';

// Первичное создание владельца через браузер: только на компьютере разработчика (не production)
// и только с явным HL_ALLOW_SETUP=1. На сервере владельца создают командой npm run owner -- create.
const setupAllowed = () => process.env.NODE_ENV !== 'production' && process.env.HL_ALLOW_SETUP === '1';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Короткий читаемый номер заказа: HL-ГГММДД-XXXX (без похожих символов 0/O, 1/I).
function orderNumber(d: ReturnType<typeof db>, now: number) {
  const date = new Date(now);
  const day =
    String(date.getFullYear()).slice(2) +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const tail = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    const id = 'HL-' + day + '-' + tail;
    if (!d.prepare('SELECT id FROM orders WHERE id=?').get(id)) return id;
  }
  return 'HL-' + day + '-' + uid().slice(0, 8).toUpperCase();
}
/** Расчёт акций и промокода с проверкой лимитов кода по заказам (оплаченные и ещё держащие резерв). */
function priceWithCode(
  d: ReturnType<typeof db>,
  cfg: any,
  user: User | null,
  lines: PricingLine[],
  input: string,
  now: number,
) {
  const name = input.trim().toUpperCase();
  const found = name ? ((cfg.promoCodes || []) as PromoCode[]).find((c) => c.code === name) || null : null;
  let blocked = '';
  if (found) {
    const live = "(payment='paid' OR (payment='pending' AND expires>?)) AND json_extract(data,'$.promoCode')=?";
    if (found.limit) {
      const n = (d.prepare('SELECT COUNT(*) AS n FROM orders WHERE ' + live).get(now, name) as { n: number }).n;
      if (n >= found.limit) blocked = 'Промокод закончился';
    }
    if (!blocked && found.perCustomer && user) {
      const mine = d.prepare('SELECT id FROM orders WHERE user_id=? AND ' + live).get(user.id, now, name);
      if (mine) blocked = 'Вы уже использовали этот промокод';
    }
  }
  return priceCart(lines, cfg.promotions || [], now, name ? { input: name, found, blocked } : null);
}
function crmSource(d: ReturnType<typeof db>): CrmSource {
  const parse = (r: any) => ({ ...r, data: JSON.parse(r.data) });
  return {
    users: d.prepare('SELECT id,email,name,phone,created,role FROM users').all() as any[],
    orders: d.prepare('SELECT id,user_id,data,payment,status,total,created FROM orders').all().map(parse),
    requests: d.prepare('SELECT id,user_id,data,status,comment,created FROM requests').all().map(parse),
    profiles: (d.prepare('SELECT email,data,updated FROM crm_profiles').all() as any[]).map((r) => ({
      email: r.email,
      ...JSON.parse(r.data),
      updated: r.updated,
    })),
    notes: d.prepare('SELECT * FROM crm_notes').all() as any[],
  };
}
const error = (message: string, status = 400) => Response.json({ error: message }, { status });
// Реквизиты продавца — обязательны на сайте (ст. 9 ЗоЗПП, п. 12 Правил продажи товаров, ПП РФ № 2463).
function sellerInfo(cfg: any) {
  return {
    name: cfg.sellerName || '',
    inn: cfg.sellerInn || '',
    ogrn: cfg.sellerOgrn || '',
    address: cfg.sellerAddress || '',
    email: cfg.legalEmail || cfg.email || '',
    phone: cfg.sellerPhone || '',
    rkn: cfg.rknNumber || '',
  };
}
function legalLine(cfg: any) {
  const s = sellerInfo(cfg);
  if (!s.name) return cfg.legal || '';
  return [s.name, s.inn && 'ИНН ' + s.inn, s.ogrn && (s.ogrn.length === 15 ? 'ОГРНИП ' : 'ОГРН ') + s.ogrn]
    .filter(Boolean)
    .join(' · ');
}
// Одноразовый код подтверждения номера: 6 цифр, живёт 5 минут, 5 попыток ввода.
function checkPhoneCode(phone: string, code: unknown, purpose: string) {
  const d = db();
  const row = d.prepare('SELECT * FROM phone_codes WHERE phone=? AND purpose=?').get(phone, purpose) as
    { hash: string; expires: number; tries: number } | undefined;
  if (!row || row.expires < Date.now()) return 'Код устарел. Запросите новый';
  if (row.tries >= 5) return 'Слишком много попыток. Запросите новый код';
  if (typeof code !== 'string' || hash(phone + ':' + code.trim()) !== row.hash) {
    d.prepare('UPDATE phone_codes SET tries=tries+1 WHERE phone=? AND purpose=?').run(phone, purpose);
    return 'Неверный код. Проверьте СМС или запросите новый код';
  }
  d.prepare('DELETE FROM phone_codes WHERE phone=? AND purpose=?').run(phone, purpose);
  return null;
}
const userCols = 'id,email,name,phone,address,role,marketing,created';
const emailOK = (v: unknown) =>
  typeof v === 'string' && v.length < 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const text = (v: unknown, max = 1000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const safeURL = (v: unknown) => typeof v === 'string' && (/^\/(?!\/)/.test(v) || /^https:\/\//.test(v));
async function route(req: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path;
  const url = new URL(req.url);
  const action = path.join('/');
  const user = currentUser(req);
  const d = db();
  const method = req.method;
  let b: any = {};
  if (!['GET', 'HEAD'].includes(method)) {
    const origin = req.headers.get('origin');
    let originHost = '';
    try {
      originHost = origin ? new URL(origin).host : '';
    } catch {
      return error('Запрос отклонён', 403);
    }
    if (origin && originHost !== req.headers.get('host')) return error('Запрос отклонён', 403);
    if (Number(req.headers.get('content-length') || 0) > 8 * 1024 * 1024)
      return error('Файл слишком большой', 413);
    try {
      b = await req.json();
    } catch {
      return error('Некорректный запрос');
    }
  }
  if (action === 'catalog' && method === 'GET') {
    const cfg = settings();
    const now = Date.now();
    const active = promoActive(cfg, now);
    return Response.json(
      catalog()
        .filter((p) => p.published && p.stock > 0)
        .map((p) => ({ ...p, promo: p.promo && active })),
    );
  }
  if (action === 'settings' && method === 'GET') {
    const cfg = settings();
    return Response.json({
      telegram: cfg.telegram,
      telegramChannel: cfg.telegramChannel || '',
      whatsapp: cfg.whatsapp,
      email: cfg.email,
      max: cfg.max || '',
      tiktok: cfg.tiktok || '',
      youtube: cfg.youtube || '',
      hours: cfg.hours || '',
      legal: legalLine(cfg),
      seller: sellerInfo(cfg),
      legalVersion: LEGAL_VERSION,
      smsConnected: smsConnected(),
      bannerSeconds: cfg.bannerSeconds,
      banners: cfg.banners || null,
      // автоматические акции видны витрине (метки, расчёт в корзине); промокоды — только на сервере
      promotions: (cfg.promotions || []).filter((p: { active: boolean }) => p.active),
      testMode: testMode(),
      deliveryConnected: false,
      paymentConnected: false,
    });
  }
  if (action === 'auth/me' && method === 'GET') {
    if (!user) return Response.json(null);
    const extra = d.prepare('SELECT auth_phone FROM users WHERE id=?').get(user.id) as { auth_phone: string | null };
    return Response.json({ ...user, authPhone: extra?.auth_phone ? formatRu(extra.auth_phone) : '' });
  }
  // Отзыв и выдача согласий из личного кабинета (152-ФЗ ст. 9 ч. 2; 38-ФЗ ст. 18 ч. 1).
  if (action === 'account/consent' && method === 'POST') {
    if (!user) return error('Войдите в аккаунт', 401);
    const granted = b.granted === true;
    if (b.kind === 'marketing') {
      d.prepare('UPDATE users SET marketing=? WHERE id=?').run(granted ? 1 : 0, user.id);
      if (granted)
        d.prepare('INSERT OR REPLACE INTO subscribers VALUES (?,?,?,?)').run(user.email, 1, uid(), Date.now());
      else d.prepare('UPDATE subscribers SET consent=0 WHERE email=?').run(user.email);
    } else if (b.kind !== 'recommendations') return error('Неизвестный тип согласия');
    logConsent(req, user.email, b.kind, granted, 'profile');
    return Response.json({ ok: true });
  }
  // Удаление аккаунта = отзыв согласия на обработку ПДн. Заказы остаются: их хранение требует налоговое
  // и бухгалтерское законодательство (ст. 6 ч. 1 п. 2 152-ФЗ), но из профиля и рассылок человек удаляется.
  if (action === 'account/delete' && method === 'POST') {
    if (!user) return error('Войдите в аккаунт', 401);
    if (user.role !== 'customer') return error('Аккаунт сотрудника удаляет владелец в разделе «Команда»', 403);
    if (b.confirm !== true) return error('Подтвердите удаление');
    const email = user.email;
    d.exec('BEGIN');
    try {
      d.prepare(
        "UPDATE users SET email=?,password=?,name='',phone='',address='',auth_phone=NULL,marketing=0 WHERE id=?",
      ).run('deleted-' + user.id + '@deleted.invalid', passwordHash(uid() + uid()), user.id);
      d.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      d.prepare('DELETE FROM user_state WHERE user_id=?').run(user.id);
      d.prepare('DELETE FROM subscribers WHERE email=?').run(email);
      d.prepare('DELETE FROM crm_profiles WHERE email=?').run(email);
      d.prepare('DELETE FROM crm_notes WHERE email=?').run(email);
      d.exec('COMMIT');
    } catch (e) {
      d.exec('ROLLBACK');
      throw e;
    }
    logConsent(req, email, 'pd', false, 'account-delete');
    return Response.json(
      { ok: true },
      { headers: { 'Set-Cookie': 'hl_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' } },
    );
  }
  // Выбор в плашке про cookie — тоже согласие, его фиксируем (без привязки к человеку).
  if (action === 'consent/cookies' && method === 'POST') {
    if (rateLimit('cookie-consent:' + clientIp(req), 30)) return Response.json({ ok: true });
    const visitor = text(b.visitor, 64) || 'anonymous';
    logConsent(req, 'visitor:' + visitor, 'cookies', true, 'banner');
    logConsent(req, 'visitor:' + visitor, 'recommendations', b.choice === 'yes', 'banner');
    return Response.json({ ok: true });
  }
  if (action === 'auth/setup' && method === 'GET')
    return Response.json({
      available:
        !d.prepare("SELECT id FROM users WHERE role='owner'").get() &&
        setupAllowed(),
    });
  if (action === 'auth/setup' && method === 'POST') {
    if (
      !setupAllowed() ||
      d.prepare("SELECT id FROM users WHERE role='owner'").get()
    )
      return error('Первичная настройка недоступна', 403);
    if (!emailOK(b.email) || typeof b.password !== 'string' || b.password.length < 12)
      return error('Укажите почту и пароль от 12 символов');
    const id = uid();
    d.prepare('INSERT INTO users(id,email,password,name,role,created) VALUES (?,?,?,?,?,?)').run(
      id,
      b.email.toLowerCase(),
      passwordHash(b.password),
      text(b.name),
      'owner',
      Date.now(),
    );
    return sessionResponse(
      d
        .prepare('SELECT id,email,name,phone,address,role,marketing,created FROM users WHERE id=?')
        .get(id) as User,
    );
  }
  // Российский номер для входа (149-ФЗ ст. 8 ч. 10, штрафы ст. 13.55 КоАП с 07.07.2026).
  if (action === 'auth/phone-code' && method === 'POST') {
    const phone = ruMobile(b.phone);
    if (!phone) return error('Укажите российский мобильный номер: +7 9XX XXX-XX-XX');
    const purpose = ['register', 'login', 'link'].includes(b.purpose) ? b.purpose : 'login';
    if (rateLimit('sms-ip:' + clientIp(req), 15) || rateLimit('sms:' + phone, 5))
      return error('Слишком много запросов кода. Попробуйте через 15 минут', 429);
    const owner = d.prepare('SELECT id FROM users WHERE auth_phone=?').get(phone);
    if (purpose === 'register' && owner) return error('Этот номер уже привязан к аккаунту. Войдите по нему', 409);
    if (purpose === 'login' && !owner) return error('Аккаунт с этим номером не найден. Зарегистрируйтесь', 404);
    const prev = d.prepare('SELECT sent FROM phone_codes WHERE phone=? AND purpose=?').get(phone, purpose) as
      { sent: number } | undefined;
    if (prev && Date.now() - prev.sent < 60_000) return error('Новый код можно запросить через минуту', 429);
    const code = String(randomInt(100000, 1000000));
    d.prepare('INSERT OR REPLACE INTO phone_codes(phone,hash,purpose,expires,tries,sent) VALUES (?,?,?,?,0,?)').run(
      phone,
      hash(phone + ':' + code),
      purpose,
      Date.now() + 5 * 60_000,
      Date.now(),
    );
    if (smsConnected()) {
      if (!(await sendSms(phone, `Hauteline: код ${code}. Никому его не сообщайте.`)))
        return error('Не удалось отправить СМС. Запросите код ещё раз через минуту', 502);
      return Response.json({ ok: true });
    }
    if (smsDevMode()) return Response.json({ ok: true, devCode: code });
    return error('Отправка СМС ещё не подключена. Войдите по почте и паролю или напишите менеджеру', 503);
  }
  if (action === 'auth/phone-login' && method === 'POST') {
    const phone = ruMobile(b.phone);
    if (!phone) return error('Укажите российский мобильный номер');
    if (rateLimit('phone-login:' + phone + ':' + clientIp(req))) return error('Слишком много попыток. Попробуйте позже', 429);
    const bad = checkPhoneCode(phone, b.code, 'login');
    if (bad) return error(bad, 401);
    const row = d.prepare(`SELECT ${userCols} FROM users WHERE auth_phone=?`).get(phone) as User | undefined;
    if (!row) return error('Аккаунт не найден', 404);
    return sessionResponse(row);
  }
  if (action === 'auth/register' && method === 'POST') {
    if (rateLimit('register:' + clientIp(req), 20))
      return error('Слишком много попыток. Повторите через 15 минут', 429);
    if (
      !emailOK(b.email) ||
      typeof b.password !== 'string' ||
      b.password.length < 10 ||
      b.password.length > 128 ||
      b.consent !== true
    )
      return error('Укажите почту, пароль от 10 символов и отметьте согласие');
    const regPhone = ruMobile(b.phone);
    if (!regPhone) return error('Укажите российский мобильный номер, по нему подтверждается вход');
    if (d.prepare('SELECT id FROM users WHERE auth_phone=?').get(regPhone))
      return error('Этот номер уже привязан к аккаунту', 409);
    if (d.prepare('SELECT id FROM users WHERE email=?').get(String(b.email).toLowerCase()))
      return error('Эта почта уже зарегистрирована. Войдите в аккаунт', 409);
    const badCode = checkPhoneCode(regPhone, b.code, 'register');
    if (badCode) return error(badCode, 401);
    const id = uid();
    try {
      d.prepare(
        'INSERT INTO users(id,email,password,name,phone,auth_phone,marketing,created) VALUES (?,?,?,?,?,?,?,?)',
      ).run(
        id,
        b.email.toLowerCase(),
        passwordHash(b.password),
        text(b.name),
        formatRu(regPhone),
        regPhone,
        b.marketing ? 1 : 0,
        Date.now(),
      );
    } catch {
      return error('Эта почта уже зарегистрирована. Войдите в аккаунт', 409);
    }
    logConsent(req, b.email, 'pd', true, 'register');
    if (b.marketing) logConsent(req, b.email, 'marketing', true, 'register');
    if (b.marketing)
      d.prepare('INSERT OR REPLACE INTO subscribers VALUES (?,?,?,?)').run(
        b.email.toLowerCase(),
        1,
        uid(),
        Date.now(),
      );
    return sessionResponse(
      d
        .prepare('SELECT id,email,name,phone,address,role,marketing,created FROM users WHERE id=?')
        .get(id) as User,
    );
  }
  if (action === 'auth/login' && method === 'POST') {
    if (!emailOK(b.email) || typeof b.password !== 'string' || b.password.length > 128)
      return error('Неверная почта или пароль. Проверьте данные или восстановите пароль', 401);
    const banKey = loginBanKey(req, b.email);
    const bannedUntil = loginBannedUntil(banKey);
    if (bannedUntil) return error(loginBanText(bannedUntil), 429);
    // подбор к одному аккаунту с разных адресов: не больше 30 попыток за 15 минут
    const acctKey = 'login-acct:' + b.email.toLowerCase();
    if (rateLimit(acctKey, 30)) return error('Слишком много попыток входа в этот аккаунт. Попробуйте через 15 минут', 429);
    const row = d.prepare('SELECT * FROM users WHERE email=?').get(b.email.toLowerCase()) as
      (User & { password: string }) | undefined;
    if (!row || !passwordOK(b.password, row.password)) {
      const until = loginFailed(banKey, b.email);
      if (until) return error(loginBanText(until), 429);
      return error('Неверная почта или пароль. Проверьте данные или восстановите пароль', 401);
    }
    loginSucceeded(banKey);
    resetRateLimit(acctKey);
    const { password, auth_phone, ...u } = row as typeof row & { auth_phone: string | null };
    // Покупатель без подтверждённого российского номера сначала привязывает его (команда магазина — по паролю).
    if (u.role === 'customer' && !auth_phone) {
      const phone = ruMobile(b.phone);
      if (!phone || !b.code)
        return Response.json(
          { error: 'Подтвердите российский номер телефона: так требует закон для входа на сайт', needPhone: true },
          { status: 428 },
        );
      if (d.prepare('SELECT id FROM users WHERE auth_phone=? AND id<>?').get(phone, u.id))
        return error('Этот номер уже привязан к другому аккаунту', 409);
      const bad = checkPhoneCode(phone, b.code, 'link');
      if (bad) return error(bad, 401);
      d.prepare('UPDATE users SET auth_phone=?,phone=CASE WHEN phone=\'\' THEN ? ELSE phone END WHERE id=?').run(
        phone,
        formatRu(phone),
        u.id,
      );
      return sessionResponse(d.prepare(`SELECT ${userCols} FROM users WHERE id=?`).get(u.id) as User);
    }
    return sessionResponse(u);
  }
  if (action === 'auth/logout' && method === 'POST') {
    const token = req.headers.get('cookie')?.match(/(?:^|;\s*)hl_session=([^;]+)/)?.[1];
    if (token) d.prepare('DELETE FROM sessions WHERE hash=?').run(hash(token));
    return Response.json(
      { ok: true },
      { headers: { 'Set-Cookie': 'hl_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' } },
    );
  }
  if (action === 'auth/forgot' && method === 'POST') {
    if (!emailOK(b.email) || rateLimit('forgot:' + b.email, 3))
      return error('Проверьте адрес почты. Если всё верно, повторите через 15 минут');
    const row = d.prepare('SELECT id FROM users WHERE email=?').get(b.email.toLowerCase()) as
      { id: string } | undefined;
    if (row) {
      const token = uid() + uid();
      d.prepare('INSERT INTO resets VALUES (?,?,?)').run(hash(token), row.id, Date.now() + 3600000);
      enqueue(
        b.email,
        'Восстановление доступа Hauteline',
        `${process.env.HL_PUBLIC_URL || url.origin}/reset?token=${token}`,
      );
    }
    return Response.json({ ok: true, emailConnected: false });
  }
  if (action === 'auth/reset' && method === 'POST') {
    if (
      typeof b.password !== 'string' ||
      b.password.length < 10 ||
      b.password.length > 128 ||
      typeof b.token !== 'string'
    )
      return error('Проверьте пароль');
    const row = d
      .prepare('SELECT user_id FROM resets WHERE hash=? AND expires>?')
      .get(hash(b.token), Date.now()) as { user_id: string } | undefined;
    if (!row) return error('Ссылка недействительна');
    d.prepare('UPDATE users SET password=? WHERE id=?').run(passwordHash(b.password), row.user_id);
    d.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);
    d.prepare('DELETE FROM resets WHERE user_id=?').run(row.user_id);
    return Response.json({ ok: true });
  }
  if (action === 'state' && method === 'GET') {
    if (!user) return error('Войдите в аккаунт', 401);
    const row = d.prepare('SELECT cart,favorites FROM user_state WHERE user_id=?').get(user.id) as
      { cart: string; favorites: string } | undefined;
    return Response.json(
      row
        ? { cart: JSON.parse(row.cart), favorites: JSON.parse(row.favorites) }
        : { cart: [], favorites: [] },
    );
  }
  if (action === 'state' && method === 'POST') {
    // Гость: корзина живёт в браузере, на сервере сохранять нечего — это не ошибка.
    if (!user) return Response.json({ saved: false });
    if (
      !Array.isArray(b.cart) ||
      b.cart.length > 100 ||
      !Array.isArray(b.favorites) ||
      b.favorites.length > 500
    )
      return error('Не удалось сохранить корзину. Обновите страницу');
    const cart = b.cart.filter(
      (x: any) =>
        typeof x.id === 'string' &&
        x.id.length < 100 &&
        typeof x.size === 'string' &&
        x.size.length < 50 &&
        Number.isInteger(x.qty) &&
        x.qty > 0 &&
        x.qty <= 20,
    );
    const favorites = b.favorites.filter((x: any) => typeof x === 'string' && x.length < 100);
    d.prepare('INSERT OR REPLACE INTO user_state VALUES (?,?,?,?)').run(
      user.id,
      JSON.stringify(cart),
      JSON.stringify(favorites),
      Date.now(),
    );
    return Response.json({ ok: true });
  }
  if (action === 'profile' && method === 'POST') {
    if (!user) return error('Войдите в аккаунт', 401);
    d.prepare('UPDATE users SET name=?,phone=?,address=? WHERE id=?').run(
      text(b.name, 200),
      text(b.phone, 30),
      text(b.address, 500),
      user.id,
    );
    return Response.json({ ok: true });
  }
  if (action === 'newsletter' && method === 'POST') {
    if (!emailOK(b.email) || b.consent !== true || b.pdConsent !== true)
      return error('Укажите почту и отметьте оба согласия');
    if (rateLimit('newsletter:' + b.email, 5)) return error('Слишком много попыток. Повторите через 15 минут', 429);
    logConsent(req, b.email, 'pd', true, 'newsletter');
    logConsent(req, b.email, 'marketing', true, 'newsletter');
    d.prepare('INSERT OR REPLACE INTO subscribers VALUES (?,?,?,?)').run(
      b.email.toLowerCase(),
      1,
      uid(),
      Date.now(),
    );
    return Response.json({ ok: true });
  }
  if (action === 'unsubscribe' && method === 'POST') {
    if (typeof b.token !== 'string') return error('Ссылка недействительна');
    const row = d.prepare('SELECT email FROM subscribers WHERE token=?').get(b.token) as
      { email: string } | undefined;
    if (!row) return error('Ссылка недействительна');
    d.prepare('UPDATE subscribers SET consent=0 WHERE token=?').run(b.token);
    d.prepare('UPDATE users SET marketing=0 WHERE email=?').run(row.email);
    d.prepare(
      "UPDATE outbox SET status='Отписка' WHERE recipient=? AND kind='marketing' AND status='Ожидает подключения'",
    ).run(row.email);
    return Response.json({ ok: true });
  }
  if (action === 'requests' && method === 'POST') {
    if (rateLimit('request:' + text(b.email), 5)) return error('Слишком много попыток. Повторите через 15 минут', 429);
    if (
      !emailOK(b.email) ||
      !text(b.name) ||
      !text(b.contact) ||
      !['Telegram', 'MAX', 'WhatsApp'].includes(b.messenger) ||
      b.consent !== true
    )
      return error('Заполните обязательные поля и согласие');
    const id = uid();
    const data = {
      email: b.email,
      name: text(b.name, 200),
      contact: text(b.contact, 200),
      messenger: b.messenger,
      description: text(b.description, 3000),
      size: text(b.size, 100),
      budget: text(b.budget, 100),
      reference: text(b.reference, 1000),
      attachment:
        typeof b.attachment === 'string' && /^[a-f0-9]{24}$/.test(b.attachment) ? b.attachment : null,
      marketing: b.marketing === true,
      consentAt: Date.now(),
    };
    logConsent(req, b.email, 'pd', true, 'request');
    if (b.marketing) logConsent(req, b.email, 'marketing', true, 'request');
    d.prepare('INSERT INTO requests(id,user_id,data,created) VALUES (?,?,?,?)').run(
      id,
      user?.id || null,
      JSON.stringify(data),
      Date.now(),
    );
    if (b.marketing)
      d.prepare('INSERT OR REPLACE INTO subscribers VALUES (?,?,?,?)').run(
        b.email.toLowerCase(),
        1,
        uid(),
        Date.now(),
      );
    return Response.json({ id });
  }
  if (action === 'upload' && method === 'POST') {
    // Загрузка нужна только команде (фото товаров и баннеров) — анонимно базу не засорить.
    if (!(allowed(user, 'products') || allowed(user, 'banners')))
      return error(user ? 'Недостаточно прав' : 'Войдите в аккаунт', user ? 403 : 401);
    if (typeof b.data !== 'string' || b.data.length > 7 * 1024 * 1024)
      return error('Файл больше 5 МБ. Уменьшите его и загрузите снова');
    const bytes = Buffer.from(b.data, 'base64');
    const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216
        ? 'image/jpeg'
        : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
          ? 'image/webp'
          : null;
    if (!mime || bytes.length > 5 * 1024 * 1024 || bytes.length < 50)
      return error('Разрешены JPG, PNG и WebP до 5 МБ');
    const id = uid();
    d.prepare('INSERT INTO files VALUES (?,?,?,?,?)').run(
      id,
      mime,
      'product',
      bytes,
      Date.now(),
    );
    return Response.json({ id, url: '/api/files/' + id });
  }
  if (path[0] === 'files' && method === 'GET') {
    const row = d.prepare('SELECT type,scope,data FROM files WHERE id=?').get(path[1]) as
      { type: string; scope: string; data: Uint8Array } | undefined;
    if (!row) return error('Файл не найден', 404);
    if (row.scope !== 'product' && !allowed(user, 'requests')) return error('Нет доступа', 403);
    return new Response(new Uint8Array(row.data), {
      headers: {
        'Content-Type': row.type,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': row.scope === 'product' ? 'public,max-age=86400' : 'no-store',
      },
    });
  }
  if (action === 'quote' && method === 'POST') {
    // считаем и для гостя: акции и промокод видны ещё до входа (ограничения «на покупателя» — после входа)
    if (!Array.isArray(b.items) || b.items.length > 100) return error('Проверьте корзину');
    expireReservations();
    const cfg = settings();
    const now = Date.now();
    const active = promoActive(cfg, now);
    const old = user
      ? d
          .prepare(
            "SELECT id FROM orders WHERE user_id=? AND (payment='paid' OR (payment='pending' AND expires>? AND json_extract(data,'$.promo')=1))",
          )
          .get(user.id, now)
      : null;
    const used = (
      d
        .prepare(
          "SELECT COUNT(*) AS n FROM orders WHERE (payment='paid' OR (payment='pending' AND expires>?)) AND json_extract(data,'$.promo')=1",
        )
        .get(now) as any
    ).n;
    let discount = false;
    const items = b.items.map((r: any) => {
      const p = catalog().find((p) => p.id === r.id);
      if (!p) return { ...r, available: false, price: 0 };
      const promo = !!p.promo && active && !old && !discount && used < cfg.promoLimit && r.qty === 1;
      if (promo) discount = true;
      return { ...r, available: true, price: promo ? 1 : p.price, promo, brand: p.brand, name: p.name, category: p.category };
    });
    const pricing = priceWithCode(
      d,
      cfg,
      user,
      items.filter((l: any) => l.available),
      text(b.promoCode, 40),
      now,
    );
    return Response.json({
      items,
      total: pricing.total,
      freeDelivery: (items.length === 1 && items[0].promo) || pricing.freeShipping,
      pricing,
    });
  }
  if (action === 'orders' && method === 'GET') {
    if (!user) return error('Войдите в аккаунт', 401);
    expireReservations();
    return Response.json(
      d
        .prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created DESC')
        .all(user.id)
        .map((r: any) => ({ ...r, data: JSON.parse(r.data) })),
    );
  }
  if (action === 'orders' && method === 'POST') {
    if (!user) return error('Войдите в аккаунт', 401);
    if (
      !Array.isArray(b.items) ||
      b.items.length === 0 ||
      b.items.length > 100 ||
      !text(b.name) ||
      !text(b.phone) ||
      !emailOK(b.email) ||
      !text(b.address) ||
      !['СДЭК', 'Яндекс Доставка'].includes(b.carrier) ||
      b.consent !== true
    )
      return error('Проверьте данные получателя, доставку и согласие');
    logConsent(req, b.email, 'pd', true, 'checkout');
    const phoneDigits = String(b.phone).replace(/\D/g, '').length;
    if (phoneDigits < 7 || phoneDigits > 15) return error('Укажите номер телефона полностью');
    if (!testMode() && (!b.pvzId || !b.pvzVerified))
      return error('Оформить заказ на сайте пока нельзя: подключаем доставку. Напишите менеджеру, и мы оформим заказ вручную', 503);
    const key = text(b.key, 100);
    if (!key) return error('Обновите страницу и оформите заказ ещё раз');
    const duplicate = d
      .prepare("SELECT * FROM orders WHERE user_id=? AND (id=? OR json_extract(data,'$.key')=?)")
      .get(user.id, key, key) as any;
    if (duplicate)
      return Response.json({
        ...duplicate,
        data: JSON.parse(duplicate.data),
        testMode: testMode(),
      });
    expireReservations();
    d.exec('BEGIN IMMEDIATE');
    try {
      const now = Date.now();
      const lines: any[] = [];
      const wanted = new Map<string, number>();
      const cfg = settings();
      for (const item of b.items) {
        if (
          typeof item.id !== 'string' ||
          typeof item.size !== 'string' ||
          !Number.isInteger(item.qty) ||
          item.qty < 1 ||
          item.qty > 20
        )
          throw new Error('Проверьте количество и размер');
        const p = catalog().find((p) => p.id === item.id);
        if (!p || !p.published) throw new Error('Товар недоступен');
        const inv = d
          .prepare('SELECT stock FROM inventory WHERE product_id=? AND size=?')
          .get(item.id, item.size) as { stock: number } | undefined;
        if (!inv) throw new Error('Выберите доступный размер');
        const k = item.id + '|' + item.size;
        const needed = (wanted.get(k) || 0) + item.qty;
        wanted.set(k, needed);
        const reserved = (
          d
            .prepare(
              'SELECT COALESCE(SUM(qty),0) AS n FROM reservations WHERE product_id=? AND size=? AND expires>?',
            )
            .get(item.id, item.size, now) as { n: number }
        ).n;
        if (inv.stock - reserved < needed) throw new Error('Этот размер уже зарезервирован или закончился');
        let price = p.price;
        let promo = false;
        if (p.promo) {
          const active = promoActive(cfg, now);
          const old = d
            .prepare(
              "SELECT id FROM orders WHERE user_id=? AND (payment='paid' OR (payment='pending' AND expires>? AND json_extract(data,'$.promo')=1))",
            )
            .get(user.id, now);
          const used = d
            .prepare(
              "SELECT COUNT(*) AS n FROM orders WHERE (payment='paid' OR (payment='pending' AND expires>?)) AND json_extract(data,'$.promo')=1",
            )
            .get(now) as { n: number };
          // Как в расчёте /quote: по акции — одна вещь в одном экземпляре, остальное по полной цене.
          if (active && !old && used.n < cfg.promoLimit && item.qty === 1 && !lines.some((l) => l.promo)) {
            price = 1;
            promo = true;
          }
        }
        lines.push({
          id: p.id,
          name: p.name,
          image: p.image,
          sprite: p.sprite,
          brand: p.brand,
          category: p.category,
          size: item.size,
          qty: item.qty,
          price,
          availability: p.availability,
          promo,
        });
      }
      const promoCode = text(b.promoCode, 40);
      const pricing = priceWithCode(d, cfg, user, lines, promoCode, now);
      if (promoCode && !pricing.code?.ok) throw new Error('Промокод: ' + (pricing.code?.message || 'не подходит'));
      const total = pricing.total;
      const data = {
        items: lines.map((l, i) => ({ ...l, discount: pricing.lineDiscounts[i] || 0 })),
        subtotal: pricing.subtotal,
        discounts: pricing.discounts,
        promoCode: pricing.code?.ok ? pricing.code.code : undefined,
        name: text(b.name),
        phone: text(b.phone),
        email: b.email,
        address: text(b.address),
        carrier: b.carrier,
        pvzId: text(b.pvzId),
        comment: text(b.comment),
        contactMethod: ['Почта', 'Telegram', 'MAX'].includes(b.contactMethod) ? b.contactMethod : 'Telegram',
        deliveryMode: text(b.deliveryMode, 40),
        paymentMethod: ['СБП', 'Картой', 'Сплит', 'Долями'].includes(b.paymentMethod)
          ? b.paymentMethod
          : 'СБП',
        key,
        promo: lines.some((l) => l.promo),
        freeDelivery: (lines.length === 1 && lines[0].promo) || pricing.freeShipping,
        stage: 0,
        history: [{ stage: 0, date: now, note: 'Заказ создан' }],
        consentAt: now,
      };
      const expires = now + 300000;
      const id = orderNumber(d, now);
      d.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?)').run(
        id,
        user.id,
        JSON.stringify(data),
        'Ожидает оплаты',
        'pending',
        total,
        now,
        expires,
      );
      for (const line of lines)
        d.prepare('INSERT INTO reservations VALUES (?,?,?,?,?)').run(
          id,
          line.id,
          line.size,
          line.qty,
          expires,
        );
      d.exec('COMMIT');
      return Response.json({
        id,
        data,
        total,
        payment: 'pending',
        expires,
        testMode: testMode(),
      });
    } catch (e) {
      d.exec('ROLLBACK');
      return error(e instanceof Error ? e.message : 'Не удалось создать заказ', 409);
    }
  }
  if (action === 'orders/test-payment' && method === 'POST') {
    if (!testMode())
      return error('Тестовая оплата отключена', 403);
    if (!user) return error('Войдите в аккаунт', 401);
    expireReservations();
    d.exec('BEGIN IMMEDIATE');
    try {
      const o = d.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(b.id, user.id) as any;
      if (!o) throw new Error('Заказ не найден');
      if (o.payment === 'paid') {
        d.exec('COMMIT');
        return Response.json({ ok: true });
      }
      if (o.payment !== 'pending' || o.expires < Date.now()) throw new Error('Резерв истёк');
      if (b.result === 'fail') {
        d.prepare("UPDATE orders SET payment='failed',status='Оплата не прошла' WHERE id=?").run(o.id);
        d.prepare('DELETE FROM reservations WHERE order_id=?').run(o.id);
        d.exec('COMMIT');
        return Response.json({ ok: false, error: 'Тестовый отказ оплаты' });
      }
      const data = JSON.parse(o.data);
      for (const l of data.items) {
        const r = d
          .prepare('UPDATE inventory SET stock=stock-? WHERE product_id=? AND size=? AND stock>=?')
          .run(l.qty, l.id, l.size, l.qty);
        if (Number(r.changes) !== 1) throw new Error('Товар недоступен');
      }
      d.prepare("UPDATE orders SET payment='paid',status='Оплачен',expires=NULL WHERE id=?").run(o.id);
      d.prepare('DELETE FROM reservations WHERE order_id=?').run(o.id);
      enqueue(data.email, 'Заказ Hauteline подтверждён', 'Ваш заказ ' + o.id + ' оплачен в тестовом режиме.');
      d.exec('COMMIT');
      return Response.json({ ok: true, test: true });
    } catch (e) {
      d.exec('ROLLBACK');
      return error(e instanceof Error ? e.message : 'Не удалось обработать оплату', 409);
    }
  }
  if (action === 'payment' && method === 'POST')
    return error('Приём оплаты на сайте ещё не подключён, деньги не списаны. Напишите менеджеру, чтобы оплатить заказ', 503);
  if (action === 'events' && method === 'POST') {
    if (
      typeof b.visitor !== 'string' ||
      b.visitor.length > 100 ||
      !['visit', 'duration', 'cart', 'view'].includes(b.type)
    )
      return error('Некорректное событие');
    // Лишние события молча пропускаем: это аналитика, ошибка в консоли покупателю не нужна.
    if (rateLimit('event:' + b.visitor, 200)) return new Response(null, { status: 204 });
    d.prepare('INSERT INTO events(visitor,type,data,created) VALUES (?,?,?,?)').run(
      b.visitor,
      b.type,
      JSON.stringify({
        seconds: Math.max(0, Math.min(Number(b.seconds) || 0, 86400)),
        product: text(b.product, 100),
      }),
      Date.now(),
    );
    return Response.json({ ok: true });
  }
  if (path[0] === 'admin') {
    const area = path[1] || 'analytics';
    if (!allowed(user, area))
      return error(user ? 'Недостаточно прав' : 'Войдите в аккаунт', user ? 403 : 401);
    const u = user!;
    if (area === 'products' && method === 'GET') return Response.json(catalog());
    if (area === 'products' && method === 'POST') {
      const p = b as Product & { variants?: { size: string; stock: number }[] };
      if (
        !text(p.name) ||
        !Number.isInteger(p.price) ||
        p.price < 1 ||
        !['preorder', 'stock'].includes(p.availability) ||
        !['Новое', 'Идеальное', 'Хорошее'].includes(p.condition) ||
        !Array.isArray(p.sizes) ||
        p.sizes.length < 1 ||
        p.sizes.length > 30 ||
        !safeURL(p.image)
      )
        return error('Проверьте поля товара');
      const id = p.id && /^[\w-]{1,100}$/.test(p.id) ? p.id : uid();
      const variants = p.variants || p.sizes.map((size, i) => ({ size, stock: i === 0 ? p.stock : 0 }));
      if (
        variants.some(
          (v) =>
            typeof v.size !== 'string' || v.size.length > 50 || !Number.isInteger(v.stock) || v.stock < 0,
        ) ||
        new Set(variants.map((v) => v.size)).size !== variants.length
      )
        return error('Проверьте остатки по размерам');
      const old = d.prepare('SELECT data FROM products WHERE id=?').get(id) as { data: string } | undefined;
      const cleaned = {
        id,
        color: text(p.color, 80),
        colorHex:
          typeof p.colorHex === 'string' && /^#[0-9a-f]{6}$/i.test(p.colorHex) ? p.colorHex : undefined,
        gender: ['women', 'men', 'unisex'].includes(p.gender || '') ? p.gender : undefined,
        category: text(p.category, 100),
        name: text(p.name, 200),
        brand: text(p.brand, 100),
        price: p.price,
        compareAt:
          Number.isInteger(p.compareAt) && (p.compareAt as number) > p.price ? p.compareAt : undefined,
        availability: p.availability,
        condition: p.condition,
        sizes: variants.map((v) => v.size),
        stock: variants.reduce((s, v) => s + v.stock, 0),
        image: p.image,
        gallery: Array.isArray(p.gallery) ? p.gallery.filter(safeURL).slice(0, 10) : [],
        description: text(p.description, 5000),
        published: !!p.published,
        promo: !!p.promo,
        ...(typeof p.sprite === 'number' ? { sprite: p.sprite } : {}),
      };
      d.exec('BEGIN IMMEDIATE');
      try {
        const pending = d
          .prepare('SELECT product_id FROM reservations WHERE product_id=? AND expires>? LIMIT 1')
          .get(id, Date.now());
        if (pending) throw new Error('Товар зарезервирован. Дождитесь окончания оплаты');
        d.prepare('INSERT OR REPLACE INTO products VALUES (?,?)').run(id, JSON.stringify(cleaned));
        d.prepare('DELETE FROM inventory WHERE product_id=?').run(id);
        for (const v of variants) d.prepare('INSERT INTO inventory VALUES (?,?,?)').run(id, v.size, v.stock);
        audit(u, 'Изменение товара', id, { before: old ? JSON.parse(old.data) : null, after: cleaned });
        d.exec('COMMIT');
        return Response.json(cleaned);
      } catch (e) {
        d.exec('ROLLBACK');
        return error(e instanceof Error ? e.message : 'Не удалось сохранить. Проверьте поля и попробуйте ещё раз');
      }
    }
    if (area === 'orders' && method === 'GET') {
      expireReservations();
      return Response.json(
        d
          .prepare('SELECT o.*,u.email AS user_email FROM orders o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.created DESC')
          .all()
          .map((r: any) => ({ ...r, data: JSON.parse(r.data) })),
      );
    }
    if (area === 'orders' && method === 'POST' && Array.isArray(b.ids)) {
      // Массовая смена этапа доставки для нескольких оплаченных заказов.
      if (!Number.isInteger(b.stage) || b.stage < 0 || b.stage > 8) return error('Проверьте этап');
      const ids = [...new Set(b.ids.filter((x: unknown) => typeof x === 'string'))].slice(0, 500) as string[];
      if (!ids.length) return error('Отметьте заказы');
      const updated: string[] = [];
      const skipped: string[] = [];
      d.exec('BEGIN IMMEDIATE');
      try {
        for (const id of ids) {
          const o = d.prepare('SELECT * FROM orders WHERE id=?').get(id) as any;
          if (!o || o.payment !== 'paid') {
            skipped.push(id);
            continue;
          }
          const data = JSON.parse(o.data);
          data.stage = b.stage;
          if (typeof b.delay === 'string') data.delay = text(b.delay, 300);
          data.history.push({ stage: b.stage, date: Date.now(), note: 'Статус обновлён' });
          d.prepare('UPDATE orders SET data=?,status=? WHERE id=?').run(
            JSON.stringify(data),
            b.stage === 8 ? 'Получен' : 'В пути',
            id,
          );
          enqueue(data.email, 'Статус заказа Hauteline обновлён', 'Проверьте заказ в личном кабинете.');
          updated.push(id);
        }
        d.exec('COMMIT');
      } catch (e) {
        d.exec('ROLLBACK');
        return error(e instanceof Error ? e.message : 'Не удалось обновить заказы');
      }
      audit(u, 'Массовая смена этапа', updated.join(', '), { stage: b.stage, updated, skipped });
      return Response.json({ ok: true, updated: updated.length, skipped: skipped.length });
    }
    if (area === 'orders' && method === 'POST') {
      const o = d.prepare('SELECT * FROM orders WHERE id=?').get(b.id) as any;
      if (!o) return error('Заказ не найден');
      if (!Number.isInteger(b.stage) || b.stage < 0 || b.stage > 8) return error('Проверьте этап');
      if (o.payment !== 'paid') return error('Статусы доставки доступны после оплаты');
      const data = JSON.parse(o.data);
      data.stage = b.stage;
      data.delay = text(b.delay, 300);
      data.managerComment = text(b.managerComment, 2000);
      data.history.push({ stage: b.stage, date: Date.now(), note: data.managerComment || 'Статус обновлён' });
      const status = b.stage === 8 ? 'Получен' : 'В пути';
      d.prepare('UPDATE orders SET data=?,status=? WHERE id=?').run(JSON.stringify(data), status, b.id);
      audit(u, 'Статус заказа', b.id, { stage: b.stage, delay: data.delay });
      enqueue(data.email, 'Статус заказа Hauteline обновлён', 'Проверьте заказ в личном кабинете.');
      return Response.json({ ok: true });
    }
    if (area === 'requests' && method === 'GET')
      return Response.json(
        d
          .prepare(
            'SELECT r.*,u.email AS user_email FROM requests r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.created DESC',
          )
          .all()
          .map((r: any) => ({ ...r, data: JSON.parse(r.data) })),
      );
    if (area === 'requests' && method === 'POST') {
      if (!['Новая', 'В работе', 'Согласовано', 'Закрыта', 'Отказ'].includes(b.status))
        return error('Проверьте статус');
      d.prepare('UPDATE requests SET status=?,comment=? WHERE id=?').run(
        b.status,
        text(b.comment, 3000),
        b.id,
      );
      audit(u, 'Заявка', b.id, b.status);
      return Response.json({ ok: true });
    }
    if (area === 'promotions' && method === 'GET') {
      const cfg = settings();
      const usage: Record<string, number> = {};
      for (const r of d
        .prepare(
          "SELECT json_extract(data,'$.promoCode') AS code, COUNT(*) AS n FROM orders WHERE payment='paid' AND json_extract(data,'$.promoCode') IS NOT NULL GROUP BY code",
        )
        .all() as { code: string; n: number }[])
        usage[r.code] = r.n;
      return Response.json({
        promotions: cfg.promotions,
        promoCodes: cfg.promoCodes,
        usage,
        products: catalog().map((p) => ({ id: p.id, name: p.name, brand: p.brand, price: p.price, category: p.category })),
      });
    }
    if (area === 'promotions' && method === 'POST') {
      const promos = normalizePromotions(b.promotions);
      if (!promos.ok) return error(promos.error);
      const codes = normalizeCodes(b.promoCodes);
      if (!codes.ok) return error(codes.error);
      const cfg = settings();
      d.prepare('UPDATE settings SET data=? WHERE key=?').run(
        JSON.stringify({ ...cfg, promotions: promos.value, promoCodes: codes.value }),
        'shop',
      );
      audit(u, 'Акции и промокоды', 'promotions', {
        promotions: promos.value.length,
        promoCodes: codes.value.map((c) => c.code),
      });
      return Response.json({ ok: true });
    }
    // ───── CRM: карточки клиентов, заметки, теги, ответственный ─────
    if (area === 'clients') {
      const src = crmSource(d);
      const now = Date.now();
      const marketing = new Set(
        (d.prepare('SELECT email FROM subscribers WHERE consent=1').all() as { email: string }[]).map((r) =>
          normEmail(r.email),
        ),
      );
      const staff = src.users
        .filter((x) => x.role !== 'customer')
        .map((x) => ({ id: x.id, name: x.name, email: x.email, role: x.role }));
      const contactExists = (email: string) => !!contactDetail(src, email, now);
      if (method === 'GET' && path.length === 2)
        return Response.json({ contacts: buildContacts(src, now, marketing), staff });
      if (method === 'GET') {
        const detail = contactDetail(src, decodeURIComponent(path.slice(2).join('/')), now, marketing);
        if (!detail) return error('Клиент не найден', 404);
        return Response.json({ ...detail, staff });
      }
      if (path[2] === 'profile' && method === 'POST') {
        const email = normEmail(b.email);
        if (!contactExists(email)) return error('Клиент не найден', 404);
        const manager = b.manager ? String(b.manager) : null;
        if (manager && !staff.some((x) => x.id === manager)) return error('Ответственный должен быть из команды');
        const tags = cleanTags(b.tags);
        d.prepare(
          'INSERT INTO crm_profiles(email,data,updated) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET data=excluded.data,updated=excluded.updated',
        ).run(email, JSON.stringify({ manager, tags }), now);
        audit(u, 'CRM: карточка клиента', email, { manager, tags });
        return Response.json({ ok: true });
      }
      if (path[2] === 'note' && method === 'POST') {
        const email = normEmail(b.email);
        if (!contactExists(email)) return error('Клиент не найден', 404);
        if (!noteKinds.some((k) => k.id === b.kind)) return error('Проверьте тип записи');
        const body = text(b.body, 3000);
        if (!body) return error('Напишите текст заметки');
        const id = uid();
        d.prepare('INSERT INTO crm_notes(id,email,kind,body,author,created) VALUES (?,?,?,?,?,?)').run(
          id,
          email,
          b.kind,
          body,
          u.id,
          now,
        );
        audit(u, 'CRM: запись в карточке', email, { kind: b.kind });
        return Response.json({ ok: true, id });
      }
      if (path[2] === 'note-delete' && method === 'POST') {
        const note = d.prepare('SELECT * FROM crm_notes WHERE id=?').get(text(b.id, 64)) as any;
        if (!note) return error('Запись не найдена', 404);
        if (note.author !== u.id && u.role !== 'owner') return error('Удалить запись может автор или владелец', 403);
        d.prepare('DELETE FROM crm_notes WHERE id=?').run(note.id);
        audit(u, 'CRM: запись удалена', note.email, { kind: note.kind });
        return Response.json({ ok: true });
      }
    }
    // Журнал согласий — доказательство для Роскомнадзора; выгружается владельцем в Excel.
    if (area === 'settings' && path[2] === 'consents' && method === 'GET')
      return Response.json(
        d.prepare('SELECT subject,kind,granted,doc,source,ip,created FROM consents ORDER BY id DESC LIMIT 50000').all(),
      );
    if (area === 'banners' && method === 'GET') {
      // контент и маркетинг видят только баннеры, без промокодов и реквизитов продавца
      const cfg = settings() as any;
      return Response.json({ banners: cfg.banners, bannerSeconds: cfg.bannerSeconds });
    }
    if (area === 'settings' && method === 'GET') return Response.json(settings());
    if (['settings', 'banners'].includes(area) && method === 'POST') {
      if (
        area === 'settings' &&
        ([b.telegram, b.telegramChannel].some((v) => v && !/^https:\/\/t\.me\/\w/.test(v)) ||
          (b.email && !emailOK(b.email)) ||
          ['max', 'tiktok', 'youtube'].some((k) => b[k] && !/^https:\/\//.test(b[k])))
      )
        return error('Проверьте ссылки: Telegram вида https://t.me/имя, остальные с https://, и почту');
      if (
        area === 'banners' &&
        Array.isArray(b.banners) &&
        b.banners.some((x: any) => !safeURL(x?.image) || !/^\/(?!\/)/.test(String(x?.href || '')))
      )
        return error('У каждого баннера должна быть картинка и ссылка внутри сайта, например /catalog');
      const cfg = settings();
      const next =
        area === 'settings'
          ? {
              ...cfg,
              telegram: text(b.telegram, 200),
              telegramChannel: text(b.telegramChannel, 200),
              // владелец сам задал (или очистил) ссылку — значение по умолчанию больше не подставляем
              telegramManagerSet: true,
              whatsapp: text(b.whatsapp, 200),
              email: text(b.email, 200),
              max: text(b.max, 200),
              tiktok: text(b.tiktok, 200),
              youtube: text(b.youtube, 200),
              hours: text(b.hours, 120),
              legal: text(b.legal, 300),
              sellerName: text(b.sellerName, 200),
              sellerInn: text(b.sellerInn, 12).replace(/\D/g, ''),
              sellerOgrn: text(b.sellerOgrn, 15).replace(/\D/g, ''),
              sellerAddress: text(b.sellerAddress, 300),
              sellerPhone: text(b.sellerPhone, 40),
              legalEmail: text(b.legalEmail, 200),
              rknNumber: text(b.rknNumber, 60),
              promoEnabled: !!b.promoEnabled,
              promoStart: text(b.promoStart, 100),
              promoEnd: text(b.promoEnd, 100),
              promoLimit: Math.max(1, Math.min(Number(b.promoLimit) || 10, 10000)),
              bannerSeconds: Math.max(8, Math.min(Number(b.bannerSeconds) || 12, 120)),
            }
          : {
              ...cfg,
              bannerSeconds: Math.max(8, Math.min(Number(b.bannerSeconds) || 12, 120)),
              banners: Array.isArray(b.banners)
                ? b.banners
                    .slice(0, 10)
                    .map((x: any) => ({ image: x.image, href: x.href, title: text(x.title, 150) }))
                : cfg.banners,
            };
      d.prepare('UPDATE settings SET data=? WHERE key=?').run(JSON.stringify(next), 'shop');
      audit(u, 'Настройки', area, next);
      return Response.json(area === 'banners' ? { banners: next.banners, bannerSeconds: next.bannerSeconds } : next);
    }
    if (area === 'roles' && path[2] === 'bans' && method === 'GET')
      return Response.json(
        d
          .prepare('SELECT key,fails,level,banned_until,last_email,updated FROM login_bans WHERE banned_until>? OR fails>0 OR level>0 ORDER BY banned_until DESC, updated DESC LIMIT 200')
          .all(Date.now()),
      );
    if (area === 'roles' && path[2] === 'bans' && method === 'POST') {
      if (typeof b.key !== 'string') return error('Не указана блокировка');
      d.prepare('DELETE FROM login_bans WHERE key=?').run(b.key);
      audit(u, 'Снята блокировка входа', b.key, {});
      return Response.json({ ok: true });
    }
    if (area === 'roles' && method === 'GET')
      return Response.json(d.prepare('SELECT id,name,email,role FROM users ORDER BY created DESC').all());
    if (area === 'roles' && method === 'POST') {
      if (!['customer', ...Object.keys(permissions)].includes(b.role)) return error('Неизвестная роль');
      if (b.id === u.id && b.role !== 'owner') return error('Нельзя снять права со своего аккаунта');
      const old = d.prepare('SELECT role FROM users WHERE id=?').get(b.id) as { role: string } | undefined;
      if (!old) return error('Пользователь не найден');
      if (
        old.role === 'owner' &&
        b.role !== 'owner' &&
        (d.prepare("SELECT COUNT(*) AS n FROM users WHERE role='owner'").get() as any).n <= 1
      )
        return error('Должен остаться хотя бы один владелец');
      d.prepare('UPDATE users SET role=? WHERE id=?').run(b.role, b.id);
      audit(u, 'Изменение роли', b.id, { before: old.role, after: b.role });
      return Response.json({ ok: true });
    }
    if (area === 'audit' && method === 'GET')
      return Response.json(
        d
          .prepare(
            'SELECT a.*,u.email FROM audit a JOIN users u ON u.id=a.actor ORDER BY a.created DESC LIMIT 300',
          )
          .all(),
      );
    if (area === 'analytics' && method === 'GET') {
      const days = { day: 1, week: 7, month: 30, all: 100000 }[url.searchParams.get('period') || 'week'] || 7;
      const since = Date.now() - days * 86400000;
      const count = (sql: string) => Number((d.prepare(sql).get(since) as any).n);
      const visits = count(
        "SELECT COUNT(DISTINCT visitor) AS n FROM events WHERE type='visit' AND created>?",
      );
      const purchases = count("SELECT COUNT(*) AS n FROM orders WHERE payment='paid' AND created>?");
      return Response.json({
        visits,
        registrations: count('SELECT COUNT(*) AS n FROM users WHERE created>?'),
        orders: count('SELECT COUNT(*) AS n FROM orders WHERE created>?'),
        requests: count('SELECT COUNT(*) AS n FROM requests WHERE created>?'),
        purchases,
        cart: count("SELECT COUNT(*) AS n FROM events WHERE type='cart' AND created>?"),
        averageSeconds: Number(
          (
            d
              .prepare(
                "SELECT COALESCE(AVG(json_extract(data,'$.seconds')),0) AS n FROM events WHERE type='duration' AND created>?",
              )
              .get(since) as any
          ).n,
        ),
        conversion: visits ? Math.round((purchases / visits) * 10000) / 100 : 0,
        revenue: Number(
          (
            d
              .prepare("SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE payment='paid' AND created>?")
              .get(since) as any
          ).n,
        ),
        pendingOrders: Number(
          (d.prepare("SELECT COUNT(*) AS n FROM orders WHERE payment='pending'").get() as any).n,
        ),
        openRequests: Number(
          (d.prepare("SELECT COUNT(*) AS n FROM requests WHERE status IN ('Новая','В работе')").get() as any)
            .n,
        ),
        // Выручка и оплаченные заказы по дням — для графика (до 30 последних дней периода).
        series: (() => {
          const span = Math.min(days, 30);
          const from = new Date();
          from.setHours(0, 0, 0, 0);
          from.setDate(from.getDate() - span + 1);
          const rows = d
            .prepare(
              "SELECT date(created/1000,'unixepoch','localtime') AS day, COUNT(*) AS orders, SUM(total) AS revenue FROM orders WHERE payment='paid' AND created>=? GROUP BY day",
            )
            .all(from.getTime()) as { day: string; orders: number; revenue: number }[];
          const map = new Map(rows.map((r) => [r.day, r]));
          return Array.from({ length: span }, (_, i) => {
            const dt = new Date(from);
            dt.setDate(from.getDate() + i);
            const key =
              dt.getFullYear() +
              '-' +
              String(dt.getMonth() + 1).padStart(2, '0') +
              '-' +
              String(dt.getDate()).padStart(2, '0');
            const r = map.get(key);
            return { day: key, orders: r?.orders || 0, revenue: r?.revenue || 0 };
          });
        })(),
      });
    }
    if (area === 'campaigns' && method === 'GET' && path.length === 2)
      return Response.json(
        d
          .prepare('SELECT * FROM campaigns ORDER BY created DESC')
          .all()
          .map((r: any) => ({ ...r, data: JSON.parse(r.data) })),
      );
    if (area === 'campaigns' && method === 'POST') {
      const data = {
        subject: text(b.subject, 200),
        body: text(b.body, 20000),
        segment: ['all', 'new', 'buyers', 'no-orders', 'promo'].includes(b.segment) ? b.segment : 'all',
      };
      if (!data.subject || !data.body) return error('Укажите тему и текст письма');
      const id = uid();
      d.prepare('INSERT INTO campaigns(id,data,created) VALUES (?,?,?)').run(
        id,
        JSON.stringify(data),
        Date.now(),
      );
      audit(u, 'Черновик рассылки', id, { subject: data.subject });
      return Response.json({ id });
    }
    if (area === 'campaigns' && path[2] === 'preview' && method === 'GET') {
      const id = url.searchParams.get('id');
      const c = d.prepare('SELECT data FROM campaigns WHERE id=?').get(id) as { data: string } | undefined;
      if (!c) return error('Письмо не найдено');
      const data = JSON.parse(c.data);
      const subscribers = d.prepare('SELECT email,token FROM subscribers WHERE consent=1').all() as {
        email: string;
        token: string;
      }[];
      const audience = subscribers.filter((s) => {
        const u = d.prepare('SELECT id,created FROM users WHERE email=?').get(s.email) as any;
        if (data.segment === 'all') return true;
        if (!u) return false;
        const paid = d.prepare("SELECT id FROM orders WHERE user_id=? AND payment='paid'").get(u.id);
        return data.segment === 'buyers'
          ? !!paid
          : data.segment === 'no-orders'
            ? !paid
            : data.segment === 'new'
              ? u.created > Date.now() - 7 * 86400000
              : !!d
                  .prepare(
                    "SELECT id FROM orders WHERE user_id=? AND payment='paid' AND json_extract(data,'$.promo')=1",
                  )
                  .get(u.id);
      });
      return Response.json({
        audience: audience.length,
        subject: data.subject,
        body: data.body,
        connected: false,
      });
    }
    return error('Операция ещё не подключена', 503);
  }
  return error('Не найдено', 404);
}
async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    return await route(req, ctx);
  } catch (e) {
    console.error('Hauteline API error', e instanceof Error ? e.message : e);
    return error('Не удалось выполнить действие. Попробуйте ещё раз.', 500);
  }
}
export const GET = handle;
export const POST = handle;
