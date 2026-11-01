// Акции и промокоды: один расчёт для корзины, оформления и сервера (сервер — окончательный).
// Порядок: 1 ₽-акция (считается раньше) → «N по цене M» и комплекты → скидка от суммы или промокод
// (не суммируются, применяется бóльшая) → бесплатная доставка от суммы / по промокоду.
import { department } from './catalog';

export type PromoScope = {
  kind: 'all' | 'brand' | 'department' | 'products';
  values: string[];
};
export type PromotionType = 'bundle' | 'set' | 'threshold' | 'shipping';
export type Promotion = {
  id: string;
  type: PromotionType;
  title: string;
  active: boolean;
  start: string; // ГГГГ-ММ-ДД по Москве, пусто — без ограничения
  end: string;
  // «N по цене M»: из N вещей в одном заказе платные M самых дорогих
  buy?: number;
  pay?: number;
  scope?: PromoScope;
  // комплект: при покупке вещи из main вещь из extra — со скидкой extraPercent (100 = бесплатно)
  main?: string[];
  extra?: string[];
  extraPercent?: number;
  // скидка от суммы заказа / бесплатная доставка от суммы
  minTotal?: number;
  percent?: number;
  amount?: number;
};
export type PromoCode = {
  code: string;
  active: boolean;
  kind: 'percent' | 'fixed' | 'shipping';
  value: number;
  minTotal: number;
  start: string;
  end: string;
  limit: number; // всего применений, 0 — без лимита
  perCustomer: boolean; // один раз на покупателя
  note: string;
};
export type PricingLine = {
  id: string;
  size?: string;
  qty: number;
  price: number; // цена за штуку после акции 1 ₽
  promo?: boolean; // вещь по акции 1 ₽ — в других акциях не участвует
  brand: string;
  name: string;
  category?: string;
};
export type Discount = { id: string; label: string; amount: number; kind: 'item' | 'order' | 'code' };
export type PricingResult = {
  subtotal: number; // сумма по ценам вещей (после 1 ₽)
  discounts: Discount[];
  discountTotal: number;
  total: number;
  lineDiscounts: number[]; // скидка на каждую строку корзины (для показа «по акции»)
  freeShipping: boolean;
  shippingReason: string;
  shippingLeft: number | null; // сколько добавить до бесплатной доставки
  code: { code: string; ok: boolean; message: string } | null;
};

/** Сегодняшняя дата по Москве в виде ГГГГ-ММ-ДД. */
export const moscowDay = (now: number) => new Date(now + 3 * 3_600_000).toISOString().slice(0, 10);
export const inDates = (x: { start?: string; end?: string }, now: number) => {
  const day = moscowDay(now);
  return (!x.start || day >= x.start) && (!x.end || day <= x.end);
};
export const promotionLive = (p: Promotion, now: number) => p.active && inDates(p, now);

export function inScope(scope: PromoScope | undefined, l: Pick<PricingLine, 'id' | 'brand' | 'name' | 'category'>) {
  if (!scope || scope.kind === 'all') return true;
  const vals = scope.values.map((v) => v.toLowerCase());
  if (scope.kind === 'brand') return vals.includes(l.brand.toLowerCase());
  if (scope.kind === 'department') return vals.includes(department(l).toLowerCase());
  return scope.values.includes(l.id);
}
/** Короткая подпись акции для карточки товара: «2 по цене 1», «−15% от 50 000 ₽». */
export function promotionBadge(p: Promotion) {
  if (p.type === 'bundle') return `${p.buy} по цене ${p.pay}`;
  if (p.type === 'set') return p.extraPercent === 100 || !p.extraPercent ? 'Комплект' : `Комплект −${p.extraPercent}%`;
  if (p.type === 'threshold')
    return (p.percent ? `−${p.percent}%` : `−${rubles(p.amount || 0)}`) + ` от ${rubles(p.minTotal || 0)}`;
  return `Доставка 0\u00a0₽ от ${rubles(p.minTotal || 0)}`;
}
const rubles = (n: number) => n.toLocaleString('ru-RU') + '\u00a0₽';
/** Акции, в которых участвует товар (для меток на витрине). */
export function promotionsFor(
  product: Pick<PricingLine, 'id' | 'brand' | 'name' | 'category'>,
  promotions: Promotion[],
  now: number,
) {
  return promotions.filter(
    (p) =>
      promotionLive(p, now) &&
      ((p.type === 'bundle' && inScope(p.scope, product)) ||
        (p.type === 'set' && (p.main?.includes(product.id) || p.extra?.includes(product.id)))),
  );
}

export function priceCart(
  lines: PricingLine[],
  promotions: Promotion[],
  now: number,
  code?: { input: string; found: PromoCode | null; blocked?: string } | null,
): PricingResult {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const live = promotions.filter((p) => promotionLive(p, now));
  // каждая штука — отдельно: «2 по цене 1» считается по штукам, а не по строкам
  const units = lines.flatMap((l, i) =>
    l.promo ? [] : Array.from({ length: l.qty }, () => ({ line: i, price: l.price, used: false })),
  );
  const lineDiscounts = lines.map(() => 0);
  const discounts: Discount[] = [];
  for (const p of live.filter((x) => x.type === 'bundle')) {
    const buy = Math.max(2, Math.floor(p.buy || 2));
    const pay = Math.min(buy - 1, Math.max(1, Math.floor(p.pay || 1)));
    const pool = units
      .filter((u) => !u.used && inScope(p.scope, lines[u.line]))
      .sort((a, z) => z.price - a.price);
    let amount = 0;
    for (let g = 0; g + buy <= pool.length; g += buy) {
      const group = pool.slice(g, g + buy);
      group.forEach((u) => (u.used = true));
      for (const u of group.slice(pay)) {
        amount += u.price;
        lineDiscounts[u.line] += u.price;
      }
    }
    if (amount) discounts.push({ id: p.id, label: p.title || promotionBadge(p), amount, kind: 'item' });
  }
  for (const p of live.filter((x) => x.type === 'set')) {
    const percent = Math.min(100, Math.max(1, p.extraPercent || 100));
    const mains = units.filter((u) => !u.used && p.main?.includes(lines[u.line].id));
    const extras = units
      .filter((u) => !u.used && p.extra?.includes(lines[u.line].id) && !mains.includes(u))
      .sort((a, z) => z.price - a.price);
    const pairs = Math.min(mains.length, extras.length);
    let amount = 0;
    for (let k = 0; k < pairs; k++) {
      mains[k].used = extras[k].used = true;
      const off = Math.round((extras[k].price * percent) / 100);
      amount += off;
      lineDiscounts[extras[k].line] += off;
    }
    if (amount) discounts.push({ id: p.id, label: p.title || promotionBadge(p), amount, kind: 'item' });
  }
  const afterItems = subtotal - discounts.reduce((s, d) => s + d.amount, 0);
  // скидка от суммы заказа — лучшая из подходящих
  let orderDiscount: Discount | null = null;
  for (const p of live.filter((x) => x.type === 'threshold')) {
    if (afterItems < (p.minTotal || 0)) continue;
    const amount = Math.min(
      afterItems - 1,
      p.percent ? Math.round((afterItems * Math.min(90, p.percent)) / 100) : Math.round(p.amount || 0),
    );
    if (amount > 0 && (!orderDiscount || amount > orderDiscount.amount))
      orderDiscount = { id: p.id, label: p.title || promotionBadge(p), amount, kind: 'order' };
  }
  // промокод
  let codeState: PricingResult['code'] = null;
  let codeDiscount: Discount | null = null;
  let codeShipping = false;
  if (code && code.input.trim()) {
    const c = code.found;
    const name = code.input.trim().toUpperCase();
    if (!c || !c.active) codeState = { code: name, ok: false, message: 'Такого промокода нет' };
    else if (!inDates(c, now))
      codeState = {
        code: name,
        ok: false,
        message: c.start && moscowDay(now) < c.start ? 'Промокод ещё не действует' : 'Срок промокода закончился',
      };
    else if (code.blocked) codeState = { code: name, ok: false, message: code.blocked };
    else if (afterItems < (c.minTotal || 0))
      codeState = { code: name, ok: false, message: `Промокод действует от ${rubles(c.minTotal)}` };
    else if (c.kind === 'shipping') {
      codeShipping = true;
      codeState = { code: name, ok: true, message: 'Доставка бесплатно по промокоду' };
    } else {
      const amount = Math.min(
        afterItems - 1,
        c.kind === 'percent' ? Math.round((afterItems * Math.min(90, c.value)) / 100) : Math.round(c.value),
      );
      codeDiscount = { id: 'code:' + name, label: 'Промокод ' + name, amount, kind: 'code' };
      codeState = { code: name, ok: true, message: 'Промокод применён' };
    }
  }
  if (codeDiscount && orderDiscount) {
    // не суммируются: оставляем бóльшую
    if (codeDiscount.amount >= orderDiscount.amount) orderDiscount = null;
    else {
      codeState = {
        code: codeState!.code,
        ok: false,
        message: `Не суммируется со скидкой «${orderDiscount.label}» : она выгоднее, оставили её`,
      };
      codeDiscount = null;
    }
  }
  if (orderDiscount) discounts.push(orderDiscount);
  if (codeDiscount) discounts.push(codeDiscount);
  const discountTotal = discounts.reduce((s, d) => s + d.amount, 0);
  const total = Math.max(lines.length ? 1 : 0, subtotal - discountTotal);
  // бесплатная доставка от суммы (после скидок)
  const shipping = live
    .filter((x) => x.type === 'shipping')
    .sort((a, z) => (a.minTotal || 0) - (z.minTotal || 0));
  const reached = shipping.find((p) => total >= (p.minTotal || 0));
  const next = shipping.find((p) => total < (p.minTotal || 0));
  const freeShipping = !!reached || codeShipping;
  return {
    subtotal,
    discounts,
    discountTotal,
    total,
    lineDiscounts,
    freeShipping,
    shippingReason: codeShipping ? 'по промокоду' : reached ? reached.title || promotionBadge(reached) : '',
    shippingLeft: freeShipping || !next ? null : (next.minTotal || 0) - total,
    code: codeState,
  };
}

// ── Проверка данных из панели ──
const clean = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const int = (v: unknown, min: number, max: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const list = (v: unknown, max = 200) =>
  Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean))].slice(0, max) : [];

export function normalizePromotions(input: unknown): { ok: true; value: Promotion[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: true, value: [] };
  const out: Promotion[] = [];
  for (const raw of input.slice(0, 50)) {
    const r = (raw || {}) as Record<string, unknown>;
    const type = r.type as PromotionType;
    if (!['bundle', 'set', 'threshold', 'shipping'].includes(type)) return { ok: false, error: 'Неизвестный тип акции' };
    const p: Promotion = {
      id: clean(r.id, 40) || Math.random().toString(36).slice(2, 10),
      type,
      title: clean(r.title, 80),
      active: r.active !== false,
      start: day(r.start),
      end: day(r.end),
    };
    if (p.start && p.end && p.end < p.start) return { ok: false, error: `«${p.title || 'Акция'}»: дата окончания раньше начала` };
    if (type === 'bundle') {
      p.buy = int(r.buy, 2, 10, 2);
      p.pay = int(r.pay, 1, p.buy - 1, 1);
      const scope = (r.scope || {}) as Record<string, unknown>;
      const kind = ['all', 'brand', 'department', 'products'].includes(scope.kind as string)
        ? (scope.kind as PromoScope['kind'])
        : 'all';
      p.scope = { kind, values: kind === 'all' ? [] : list(scope.values) };
      if (kind !== 'all' && !p.scope.values.length)
        return { ok: false, error: `«${p.title || 'Акция'}»: выберите, на какие вещи она действует` };
    }
    if (type === 'set') {
      p.main = list(r.main);
      p.extra = list(r.extra);
      p.extraPercent = int(r.extraPercent, 1, 100, 100);
      if (!p.main.length || !p.extra.length)
        return { ok: false, error: `«${p.title || 'Комплект'}»: выберите обе части комплекта` };
    }
    if (type === 'threshold') {
      p.minTotal = int(r.minTotal, 1, 10_000_000, 0);
      p.percent = int(r.percent, 0, 90, 0);
      p.amount = p.percent ? 0 : int(r.amount, 0, 10_000_000, 0);
      if (!p.minTotal || (!p.percent && !p.amount))
        return { ok: false, error: `«${p.title || 'Скидка от суммы'}»: укажите сумму заказа и размер скидки` };
    }
    if (type === 'shipping') {
      p.minTotal = int(r.minTotal, 0, 10_000_000, 0);
    }
    out.push(p);
  }
  return { ok: true, value: out };
}
export function normalizeCodes(input: unknown): { ok: true; value: PromoCode[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: true, value: [] };
  const out: PromoCode[] = [];
  for (const raw of input.slice(0, 300)) {
    const r = (raw || {}) as Record<string, unknown>;
    const code = clean(r.code, 30).toUpperCase().replace(/\s+/g, '');
    if (!/^[A-ZА-ЯЁ0-9_-]{3,30}$/.test(code)) return { ok: false, error: 'Промокод: от 3 символов, буквы, цифры, «-» и «_»' };
    if (out.some((x) => x.code === code)) return { ok: false, error: `Промокод ${code} повторяется` };
    const kind = ['percent', 'fixed', 'shipping'].includes(r.kind as string) ? (r.kind as PromoCode['kind']) : 'percent';
    const c: PromoCode = {
      code,
      active: r.active !== false,
      kind,
      value: kind === 'shipping' ? 0 : int(r.value, 1, kind === 'percent' ? 90 : 10_000_000, 0),
      minTotal: int(r.minTotal, 0, 10_000_000, 0),
      start: day(r.start),
      end: day(r.end),
      limit: int(r.limit, 0, 1_000_000, 0),
      perCustomer: r.perCustomer !== false,
      note: clean(r.note, 200),
    };
    if (kind !== 'shipping' && !c.value) return { ok: false, error: `${code}: укажите размер скидки` };
    if (c.start && c.end && c.end < c.start) return { ok: false, error: `${code}: дата окончания раньше начала` };
    out.push(c);
  }
  return { ok: true, value: out };
}
