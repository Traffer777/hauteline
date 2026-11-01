// Базовая CRM: единая карточка клиента из аккаунтов, заказов и заявок + заметки, задачи, теги, ответственный.
// Чистые функции без базы данных — их использует и сервер, и демо-версия в браузере.

export const VIP_SPENT = 100_000; // ₽ оплаченных заказов — клиент попадает в VIP
export const SLEEP_DAYS = 90; // столько дней без оплаченных заказов — «спящий»
const DAY = 86_400_000;

export const crmSegments = [
  { id: 'lead', label: 'Лиды', hint: 'Ещё ничего не купили: заявка или регистрация' },
  { id: 'new', label: 'Новые', hint: 'Один оплаченный заказ' },
  { id: 'repeat', label: 'Постоянные', hint: 'Два и больше оплаченных заказа' },
  { id: 'vip', label: 'VIP', hint: `Оплатили больше чем на ${VIP_SPENT.toLocaleString('ru-RU')} ₽` },
  { id: 'sleeping', label: 'Спящие', hint: `Не покупали больше ${SLEEP_DAYS} дней` },
] as const;
export type CrmSegment = (typeof crmSegments)[number]['id'];

export const noteKinds = [
  { id: 'note', label: 'Заметка' },
  { id: 'call', label: 'Звонок' },
  { id: 'message', label: 'Переписка' },
  { id: 'meeting', label: 'Встреча' },
] as const;
export type NoteKind = (typeof noteKinds)[number]['id'];

export type CrmProfile = { email: string; manager?: string | null; tags?: string[]; updated?: number };
export type CrmNote = {
  id: string;
  email: string;
  kind: NoteKind;
  body: string;
  author: string;
  created: number;
};
type SrcUser = { id: string; email: string; name: string; phone: string; created: number; role: string };
type SrcOrder = {
  id: string;
  user_id: string;
  data: any;
  payment: string;
  status: string;
  total: number;
  created: number;
};
type SrcRequest = { id: string; user_id?: string | null; data: any; status: string; comment?: string; created: number };
export type CrmSource = {
  users: SrcUser[];
  orders: SrcOrder[];
  requests: SrcRequest[];
  profiles: CrmProfile[];
  notes: CrmNote[];
};

export const normEmail = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
export const isOpenRequest = (status: string) => ['Новая', 'В работе', 'Согласовано'].includes(status);

export type CrmContact = {
  email: string;
  name: string;
  phone: string;
  messenger: string;
  contact: string;
  userId: string | null;
  registered: number | null;
  firstSeen: number;
  lastActivity: number;
  orders: number;
  paid: number;
  spent: number;
  avgCheck: number;
  lastPaidAt: number | null;
  requests: number;
  openRequests: number;
  segment: CrmSegment;
  tags: string[];
  manager: string | null;
  marketing: boolean;
};

function segmentOf(paid: number, spent: number, lastPaidAt: number | null, now: number): CrmSegment {
  if (!paid) return 'lead';
  if (spent >= VIP_SPENT) return 'vip';
  if (lastPaidAt && now - lastPaidAt > SLEEP_DAYS * DAY) return 'sleeping';
  return paid >= 2 ? 'repeat' : 'new';
}

/** Группирует всё, что известно о человеке, по email. */
function collect(src: CrmSource) {
  const byId = new Map(src.users.map((u) => [u.id, u]));
  const groups = new Map<
    string,
    { user: SrcUser | null; orders: SrcOrder[]; requests: SrcRequest[]; notes: CrmNote[] }
  >();
  const group = (email: string) => {
    let g = groups.get(email);
    if (!g) groups.set(email, (g = { user: null, orders: [], requests: [], notes: [] }));
    return g;
  };
  for (const u of src.users) {
    if (u.role !== 'customer') continue; // сотрудники попадают в CRM только если сами покупали
    group(normEmail(u.email)).user = u;
  }
  for (const o of src.orders) {
    const u = byId.get(o.user_id);
    const email = normEmail(u?.email || o.data?.email);
    if (!email) continue;
    const g = group(email);
    if (u && !g.user) g.user = u;
    g.orders.push(o);
  }
  for (const r of src.requests) {
    const u = r.user_id ? byId.get(r.user_id) : undefined;
    const email = normEmail(u?.email || r.data?.email);
    if (!email) continue;
    const g = group(email);
    if (u && !g.user) g.user = u;
    g.requests.push(r);
  }
  for (const n of src.notes) groups.get(normEmail(n.email))?.notes.push(n);
  return groups;
}

function summarize(
  email: string,
  g: ReturnType<typeof collect> extends Map<string, infer V> ? V : never,
  profile: CrmProfile | undefined,
  now: number,
  marketing: Set<string>,
): CrmContact {
  const orders = [...g.orders].sort((a, b) => b.created - a.created);
  const requests = [...g.requests].sort((a, b) => b.created - a.created);
  const paidOrders = orders.filter((o) => o.payment === 'paid');
  const spent = paidOrders.reduce((s, o) => s + (o.total || 0), 0);
  const lastPaidAt = paidOrders[0]?.created ?? null;
  const stamps = [
    g.user?.created,
    ...orders.map((o) => o.created),
    ...requests.map((r) => r.created),
    ...g.notes.map((n) => n.created),
  ].filter((x): x is number => typeof x === 'number');
  return {
    email,
    name: g.user?.name || orders[0]?.data?.name || requests[0]?.data?.name || '',
    phone: g.user?.phone || orders.find((o) => o.data?.phone)?.data.phone || '',
    messenger: requests[0]?.data?.messenger || orders[0]?.data?.contactMethod || '',
    contact: requests[0]?.data?.contact || '',
    userId: g.user?.id || null,
    registered: g.user?.created ?? null,
    firstSeen: stamps.length ? Math.min(...stamps) : now,
    lastActivity: stamps.length ? Math.max(...stamps) : now,
    orders: orders.length,
    paid: paidOrders.length,
    spent,
    avgCheck: paidOrders.length ? Math.round(spent / paidOrders.length) : 0,
    lastPaidAt,
    requests: requests.length,
    openRequests: requests.filter((r) => isOpenRequest(r.status)).length,
    segment: segmentOf(paidOrders.length, spent, lastPaidAt, now),
    tags: profile?.tags || [],
    manager: profile?.manager || null,
    marketing: marketing.has(email),
  };
}

export function buildContacts(src: CrmSource, now = Date.now(), marketing: Set<string> = new Set()) {
  const profiles = new Map(src.profiles.map((p) => [normEmail(p.email), p]));
  return [...collect(src).entries()]
    .map(([email, g]) => summarize(email, g, profiles.get(email), now, marketing))
    .sort((a, b) => b.lastActivity - a.lastActivity);
}

export type TimelineItem = { at: number; kind: string; title: string; text?: string; ref?: string };

export function contactDetail(src: CrmSource, email: string, now = Date.now(), marketing: Set<string> = new Set()) {
  const key = normEmail(email);
  const g = collect(src).get(key);
  if (!g) return null;
  const profile = src.profiles.find((p) => normEmail(p.email) === key);
  const contact = summarize(key, g, profile, now, marketing);
  const orders = [...g.orders]
    .sort((a, b) => b.created - a.created)
    .map((o) => ({
      id: o.id,
      created: o.created,
      total: o.total,
      payment: o.payment,
      status: o.status,
      stage: o.data?.stage ?? 0,
      items: (o.data?.items || []).map((l: any) => ({ name: l.name, brand: l.brand, size: l.size, qty: l.qty })),
    }));
  const requests = [...g.requests]
    .sort((a, b) => b.created - a.created)
    .map((r) => ({
      id: r.id,
      created: r.created,
      status: r.status,
      description: r.data?.description || '',
      budget: r.data?.budget || '',
      size: r.data?.size || '',
      comment: r.comment || '',
    }));
  const notes = [...g.notes].sort((a, b) => b.created - a.created);
  const timeline: TimelineItem[] = [];
  if (g.user) timeline.push({ at: g.user.created, kind: 'user', title: 'Зарегистрировался на сайте' });
  for (const o of g.orders) {
    timeline.push({
      at: o.created,
      kind: o.payment === 'paid' ? 'paid' : 'order',
      title: (o.payment === 'paid' ? 'Оплатил заказ ' : 'Оформил заказ ') + o.id,
      text: (o.total || 0).toLocaleString('ru-RU') + ' ₽ · ' + o.status,
      ref: o.id,
    });
  }
  for (const r of g.requests)
    timeline.push({ at: r.created, kind: 'request', title: 'Заявка на поиск', text: r.data?.description || '', ref: r.id });
  for (const n of g.notes)
    timeline.push({
      at: n.created,
      kind: 'note-' + n.kind,
      title: noteKinds.find((k) => k.id === n.kind)?.label || 'Заметка',
      text: n.body,
      ref: n.id,
    });
  timeline.sort((a, b) => b.at - a.at);
  return { contact, orders, requests, notes, timeline };
}

/** Чистит теги: без пустых и повторов, до 12 штук по 30 символов. */
export function cleanTags(v: unknown) {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const t of v) {
    if (typeof t !== 'string') continue;
    const tag = t.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (tag && !out.some((x) => x.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out.slice(0, 12);
}
