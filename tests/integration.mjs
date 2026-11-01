import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const origin = process.env.HL_TEST_ORIGIN || 'http://127.0.0.1:3001';
const localDB = new DatabaseSync(process.env.HL_DB_PATH || '../work/test.sqlite');
const password = () => randomBytes(20).toString('base64url');
const run = Date.now();
const checks = [];
class Client {
  cookie = '';
  async req(path, body, status = 200) {
    const r = await fetch(origin + '/api/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json();
    assert.equal(r.status, status, path + ': ' + JSON.stringify(data));
    const cookie = r.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';')[0];
    return data;
  }
}
let phoneSeq = 0;
const newPhone = () => '+79' + String(run).slice(-6) + String(++phoneSeq).padStart(3, '0');
async function smsCode(c, phone, purpose) {
  const r = await c.req('auth/phone-code', { phone, purpose });
  assert.match(r.devCode, /^\d{6}$/);
  return r.devCode;
}
async function phoneFields(c) {
  const phone = newPhone();
  return { phone, code: await smsCode(c, phone, 'register') };
}
const guest = new Client(),
  owner = new Client(),
  a = new Client(),
  b = new Client();
const base = {
  name: 'Тестовый покупатель',
  phone: '+70000000000',
  email: 'buyer@example.test',
  address: 'Тестовый ПВЗ',
  carrier: 'СДЭК',
  consent: true,
};
await guest.req('catalog');
await guest.req('orders', undefined, 401);
await owner.req('auth/setup', {
  email: `owner-${run}@example.test`,
  name: 'Владелец теста',
  password: password(),
});
await owner.req('auth/setup', { email: 'duplicate@example.test', password: password() }, 403);
const au = await a.req('auth/register', {
  ...(await phoneFields(a)),
  email: `a-${run}@example.test`,
  password: password(),
  name: 'Покупатель А',
  consent: true,
  marketing: false,
});
const bu = await b.req('auth/register', {
  ...(await phoneFields(b)),
  email: `b-${run}@example.test`,
  password: password(),
  name: 'Покупатель Б',
  consent: true,
  marketing: true,
});
await a.req('admin/orders', undefined, 403);
checks.push('Вход и ограничения покупателя');
await a.req('state', { cart: [{ id: 'HL-JK-001', size: 'S', qty: 1 }], favorites: ['HL-JK-001'] });
assert.equal((await a.req('state')).cart.length, 1);
checks.push('Серверное сохранение корзины и избранного');
await guest.req('requests', {
  name: 'Гость',
  email: 'request@example.test',
  contact: '@test',
  messenger: 'Telegram',
  description: 'Ищу вещь',
  consent: true,
  marketing: false,
});
assert.equal((await owner.req('admin/requests')).length, 1);
checks.push('Заявка с сайта в панель');
await a.req('orders', { ...base, key: 'test-no-size', items: [{ id: 'HL-JK-001', size: '', qty: 1 }] }, 409);
const first = await a.req('orders', {
  ...base,
  key: 'test-reserve-' + run,
  items: [{ id: 'HL-JK-001', size: 'S', qty: 1, price: 1 }],
});
assert.equal(first.total, 18900);
assert.ok(first.expires > Date.now());
await b.req(
  'orders',
  { ...base, key: 'test-collision-' + run, items: [{ id: 'HL-JK-001', size: 'S', qty: 1 }] },
  409,
);
await b.req('orders/test-payment', { id: first.id, result: 'success' }, 409);
await a.req('orders/test-payment', { id: first.id, result: 'success' });
await a.req('orders/test-payment', { id: first.id, result: 'success' });
assert.equal(
  (await guest.req('catalog')).find((p) => p.id === 'HL-JK-001').variants.find((v) => v.size === 'S').stock,
  0,
);
assert.equal((await b.req('orders')).length, 0);
checks.push('Размер, цена сервера, конкурирующий резерв, собственные заказы, идемпотентная оплата');
const expired = await b.req('orders', {
  ...base,
  key: 'test-expired-' + run,
  items: [{ id: 'HL-JK-001', size: 'M', qty: 1 }],
});
localDB.prepare('UPDATE orders SET expires=0 WHERE id=?').run(expired.id);
localDB.prepare('UPDATE reservations SET expires=0 WHERE order_id=?').run(expired.id);
await b.req('orders/test-payment', { id: expired.id, result: 'success' }, 409);
const retry = await b.req('orders', {
  ...base,
  key: 'test-retry-' + run,
  items: [{ id: 'HL-JK-001', size: 'M', qty: 1 }],
});
await b.req('orders/test-payment', { id: retry.id, result: 'fail' });
checks.push('Истечение резерва и освобождение после отказа');
const stock = (await owner.req('admin/products')).find((p) => p.id === 'HL-BG-004');
await owner.req('admin/products', { ...stock, promo: true });
const cfg = await owner.req('admin/settings');
await owner.req('admin/settings', { ...cfg, promoEnabled: true, promoLimit: 10 });
const quote = await b.req('quote', { items: [{ id: 'HL-BG-004', size: 'One size', qty: 1 }] });
assert.equal(quote.total, 1);
assert.equal(quote.freeDelivery, true);
const promo = await b.req('orders', {
  ...base,
  key: 'test-promo-' + run,
  items: [{ id: 'HL-BG-004', size: 'One size', qty: 1 }],
});
assert.equal(promo.total, 1);
assert.equal(promo.data.freeDelivery, true);
await b.req('orders/test-payment', { id: promo.id, result: 'fail' });
const promoRetry = await b.req('orders', {
  ...base,
  key: 'test-promo-retry-' + run,
  items: [{ id: 'HL-BG-004', size: 'One size', qty: 1 }],
});
assert.equal(promoRetry.total, 1);
await b.req('orders/test-payment', { id: promoRetry.id, result: 'success' });
assert.ok(!(await guest.req('catalog')).some((p) => p.id === 'HL-BG-004'));
const shoes = (await owner.req('admin/products')).find((p) => p.id === 'HL-SH-002');
await owner.req('admin/products', { ...shoes, promo: true });
const repeat = await b.req('quote', { items: [{ id: 'HL-SH-002', size: '38', qty: 1 }] });
assert.equal(repeat.total, 12500);
checks.push(
  'Акция 1 ₽, бесплатная доставка, возврат после отказа, запрет повторного участия, снятие проданного товара',
);
await owner.req('admin/orders', {
  id: promoRetry.id,
  stage: 3,
  comment: 'Статус обновлён',
  delay: 'До 4 дней',
});
assert.equal((await b.req('orders')).find((o) => o.id === promoRetry.id).data.stage, 3);
checks.push('Ручное обновление статуса и история в кабинете');
const bulk = await owner.req('admin/orders', { ids: [promoRetry.id, first.id, retry.id], stage: 5 });
assert.equal(bulk.updated, 2); // retry — с отказом оплаты, его пропускаем
assert.equal((await b.req('orders')).find((o) => o.id === promoRetry.id).data.stage, 5);
assert.equal((await b.req('orders')).find((o) => o.id === retry.id).data.stage, 0);
checks.push('Массовая смена этапа: только оплаченные заказы');
// CRM: карточка клиента собирается из аккаунта, заказов и заявок; заметки, теги, ответственный, задачи.
const me = await owner.req('auth/me');
const bEmail = `b-${run}@example.test`;
const crm = await owner.req('admin/clients');
const bCard = crm.contacts.find((c) => c.email === bEmail);
assert.ok(bCard, 'клиент Б в CRM');
assert.ok(bCard.paid >= 1 && bCard.spent > 0 && bCard.segment !== 'lead');
assert.ok(crm.staff.some((x) => x.id === me.id));
assert.ok(!crm.contacts.some((c) => c.email === me.email), 'сотрудник без покупок не попадает в клиенты');
await owner.req('admin/clients/profile', { email: bEmail.toUpperCase(), manager: me.id, tags: ['Обувь', ' обувь ', 'VIP-кандидат'] });
await owner.req('admin/clients/profile', { email: bEmail, manager: bu.id, tags: [] }, 400);
await owner.req('admin/clients/profile', { email: 'nobody@example.test', tags: [] }, 404);
await owner.req('admin/clients/note', { email: bEmail, kind: 'call', body: 'Созвонились, ждёт 43 размер' });
await owner.req('admin/clients/note', { email: bEmail, kind: 'call', body: '   ' }, 400);
await owner.req('admin/clients/note', { email: bEmail, kind: 'spam', body: 'x' }, 400);
const detail = await owner.req('admin/clients/' + encodeURIComponent(bEmail));
assert.deepEqual(detail.contact.tags, ['Обувь', 'VIP-кандидат']);
assert.equal(detail.contact.manager, me.id);
assert.equal(detail.notes.length, 1);
assert.ok(detail.timeline.some((t) => t.kind === 'note-call'));
assert.ok(detail.orders.length >= 1);
await owner.req('admin/tasks', { title: 'x' }, 403);
await owner.req('admin/clients/' + encodeURIComponent('nobody@example.test'), undefined, 404);
const anyRequest = (await owner.req('admin/requests'))[0];
await owner.req('admin/requests', { id: anyRequest.id, status: 'Отказ', comment: 'Передумал' });
checks.push('CRM: карточка клиента, заметки, теги, ответственный');
// Акции и промокоды: один расчёт для корзины, оформления и заказа.
await owner.req(
  'admin/promotions',
  { promotions: [{ type: 'bundle', title: 'Тест', buy: 2, pay: 1, scope: { kind: 'brand', values: [] } }] },
  400,
);
await owner.req('admin/promotions', { promoCodes: [{ code: 'x', kind: 'percent', value: 10 }] }, 400);
await owner.req('admin/promotions', {
  promotions: [
    { id: 'b21', type: 'bundle', title: '2 по цене 1', buy: 2, pay: 1, scope: { kind: 'products', values: ['HL-JK-001', 'HL-JN-003'] } },
    { id: 'thr', type: 'threshold', title: '−20% от 25 000 ₽', minTotal: 25000, percent: 20 },
    { id: 'shp', type: 'shipping', title: 'Доставка 0 ₽ от 15 000 ₽', minTotal: 15000 },
    { id: 'off', type: 'threshold', title: 'Выключена', minTotal: 1, percent: 50, active: false },
  ],
  promoCodes: [
    { code: 'test10', kind: 'percent', value: 10, perCustomer: true },
    { code: 'MINUS5000', kind: 'fixed', value: 5000, minTotal: 30000 },
    { code: 'OLD', kind: 'percent', value: 10, end: '2020-01-01' },
  ],
});
const pr = await owner.req('admin/promotions');
assert.equal(pr.promotions.length, 4);
assert.equal(pr.promoCodes[0].code, 'TEST10');
assert.equal((await guest.req('settings')).promotions.length, 3, 'выключенная акция не уходит на витрину');
const pair = [
  { id: 'HL-JK-001', size: 'L', qty: 1 },
  { id: 'HL-JN-003', size: 'L', qty: 1 },
];
let q = await guest.req('quote', { items: pair });
assert.equal(q.pricing.subtotal, 28800);
assert.equal(q.pricing.discounts.find((x) => x.id === 'b21').amount, 9900, 'бесплатна более дешёвая вещь');
assert.equal(q.total, 18900);
assert.ok(q.pricing.freeShipping);
assert.ok(!q.pricing.discounts.some((x) => x.id === 'thr'), 'после 2 по цене 1 сумма меньше 25 000');
q = await guest.req('quote', { items: pair, promoCode: 'test10' });
assert.equal(q.total, 18900 - 1890);
assert.ok(q.pricing.code.ok);
q = await guest.req('quote', { items: pair, promoCode: 'NOPE' });
assert.equal(q.pricing.code.ok, false);
assert.equal(q.total, 18900);
q = await guest.req('quote', { items: pair, promoCode: 'OLD' });
assert.match(q.pricing.code.message, /закончился/);
q = await guest.req('quote', { items: [{ id: 'HL-JN-003', size: 'L', qty: 1 }], promoCode: 'MINUS5000' });
assert.match(q.pricing.code.message, /от 30/);
const coded = await a.req('orders', { ...base, key: 'code-' + run, items: [{ id: 'HL-JN-003', size: 'S', qty: 1 }], promoCode: 'TEST10' });
assert.equal(coded.total, 9900 - 990);
assert.equal(coded.data.promoCode, 'TEST10');
q = await a.req('quote', { items: [{ id: 'HL-JK-001', size: 'L', qty: 1 }], promoCode: 'TEST10' });
assert.match(q.pricing.code.message, /уже использовали/);
await a.req('orders', { ...base, key: 'code2-' + run, items: [{ id: 'HL-JK-001', size: 'L', qty: 1 }], promoCode: 'TEST10' }, 409);
// комплект: «костюм по цене брюк» — к джинсам куртка бесплатно
await owner.req('admin/promotions', {
  promotions: [{ type: 'set', title: 'Костюм по цене брюк', main: ['HL-JN-003'], extra: ['HL-JK-001'], extraPercent: 100 }],
});
q = await guest.req('quote', { items: pair });
assert.equal(q.total, 9900);
q = await guest.req('quote', { items: [{ id: 'HL-JK-001', size: 'L', qty: 1 }] });
assert.equal(q.total, 18900, 'без основной вещи комплект не срабатывает');
// скидка от суммы и промокод не суммируются — остаётся бóльшая
await owner.req('admin/promotions', {
  promotions: [{ type: 'threshold', title: '−20% от 10 000 ₽', minTotal: 10000, percent: 20 }],
  promoCodes: [{ code: 'FIVE', kind: 'percent', value: 5, perCustomer: false }],
});
q = await guest.req('quote', { items: [{ id: 'HL-JK-001', size: 'L', qty: 1 }], promoCode: 'FIVE' });
assert.equal(q.total, 18900 - 3780);
assert.equal(q.pricing.code.ok, false);
await owner.req('admin/promotions', { promotions: [], promoCodes: [] });
checks.push('Акции: 2 по цене 1, скидка от суммы, бесплатная доставка, промокоды и их лимиты');
for (const role of ['manager', 'content', 'lead', 'marketing']) {
  const c = new Client();
  const u = await c.req('auth/register', {
  ...(await phoneFields(c)),
    email: `${role}-${run}@example.test`,
    password: password(),
    consent: true,
  });
  await owner.req('admin/roles', { id: u.id, role });
  await c.req('admin/roles', undefined, 403);
  await c.req('admin/settings', undefined, 403);
  if (role === 'content') {
    await c.req('admin/products');
    await c.req('admin/orders', undefined, 403);
    await c.req('admin/clients', undefined, 403);
    await c.req('admin/clients/note', { email: `b-${run}@example.test`, kind: 'note', body: 'x' }, 403);
  }
  if (role === 'manager') {
    await c.req('admin/orders');
    await c.req('admin/products', undefined, 403);
    await c.req('admin/clients');
  }
  if (role === 'manager') await c.req('admin/promotions', undefined, 403);
  if (role === 'marketing') {
    await c.req('admin/promotions');
    await c.req('admin/campaigns');
    await c.req('admin/clients', undefined, 403);
  }
  if (role === 'lead') await c.req('admin/audit');
}
checks.push('Права четырёх ролей проверены на сервере');
const subscriber = localDB
  .prepare('SELECT token FROM subscribers WHERE email=?')
  .get(`b-${run}@example.test`);
assert.ok(subscriber);
await guest.req('unsubscribe', { token: subscriber.token });
assert.equal(
  localDB.prepare('SELECT consent FROM subscribers WHERE token=?').get(subscriber.token).consent,
  0,
);
assert.equal(
  localDB.prepare('SELECT COUNT(*) AS n FROM subscribers WHERE email=?').get(`a-${run}@example.test`).n,
  0,
);
checks.push('Согласие на рассылку и отписка');
const campaign = await owner.req('admin/campaigns', { subject: 'Тест', body: 'Поступления', segment: 'all' });
const preview = await owner.req('admin/campaigns/preview?id=' + campaign.id);
assert.equal(preview.connected, false);
checks.push('Черновик письма и предпросмотр без ложной отправки');
assert.ok((await owner.req('admin/audit')).length > 0);
await owner.req('payment', { id: first.id }, 503);
// ───── Законодательство РФ ─────
{
  const c = new Client();
  // регистрация без подтверждённого российского номера невозможна
  await c.req('auth/register', { email: `nophone-${run}@example.test`, password: password(), consent: true }, 400);
  await c.req('auth/phone-code', { phone: '+375291234567', purpose: 'register' }, 400);
  const phone = newPhone();
  const regCode = await smsCode(c, phone, 'register');
  await c.req('auth/register', { email: `law-${run}@example.test`, password: password(), consent: true, phone, code: regCode === '000000' ? '111111' : '000000' }, 401);
  const pass = password();
  const me = await c.req('auth/register', { email: `law-${run}@example.test`, password: pass, consent: true, phone, code: regCode });
  assert.equal(me.phone.replace(/\D/g, ''), phone.replace(/\D/g, ''));
  await c.req('auth/phone-code', { phone, purpose: 'register' }, 409);
  await new Client().req('auth/phone-code', { phone: '+79990000001', purpose: 'login' }, 404);
  // вход по номеру
  const d = new Client();
  await d.req('auth/phone-login', { phone, code: '123456' }, 401);
  const code = (await d.req('auth/phone-code', { phone, purpose: 'login' })).devCode;
  await d.req('auth/phone-code', { phone, purpose: 'login' }, 429);
  assert.equal((await d.req('auth/phone-login', { phone, code })).email, `law-${run}@example.test`);
  assert.ok((await d.req('auth/me')).authPhone);
  // согласия: отдельно ПДн и реклама, отзыв из кабинета, журнал
  await guest.req('newsletter', { email: `nl-${run}@example.test`, consent: true }, 400);
  await guest.req('newsletter', { email: `nl-${run}@example.test`, consent: true, pdConsent: true });
  await d.req('account/consent', { kind: 'marketing', granted: true });
  await d.req('account/consent', { kind: 'marketing', granted: false });
  await guest.req('consent/cookies', { choice: 'no', visitor: 'v-' + run });
  const journal = await owner.req('admin/settings/consents');
  const mine = journal.filter((r) => r.subject === `law-${run}@example.test`);
  assert.ok(mine.some((r) => r.kind === 'pd' && r.source === 'register' && r.granted === 1 && r.doc));
  assert.ok(mine.some((r) => r.kind === 'marketing' && r.granted === 0));
  assert.ok(journal.some((r) => r.subject === 'v-' + run || r.subject === 'visitor:v-' + run));
  await a.req('admin/settings/consents', undefined, 403);
  // реквизиты продавца попадают на сайт
  const cfg = await owner.req('admin/settings');
  await owner.req('admin/settings', { ...cfg, sellerName: 'ИП Тестов Т. Т.', sellerInn: '770012345678', sellerOgrn: '324770000012345' });
  const pub = await guest.req('settings');
  assert.equal(pub.seller.inn, '770012345678');
  assert.match(pub.legal, /ОГРНИП 324770000012345/);
  // удаление аккаунта = отзыв согласия; заказы остаются
  await d.req('account/delete', { confirm: true });
  await d.req('auth/me').then((u) => assert.equal(u, null));
  assert.equal(localDB.prepare('SELECT COUNT(*) AS n FROM users WHERE email=?').get(`law-${run}@example.test`).n, 0);
  await owner.req('account/delete', { confirm: true }, 403);
  checks.push('Законы РФ: вход по российскому номеру, отдельные согласия, журнал согласий, реквизиты, удаление аккаунта');
}
console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
