'use client';
import React, { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Toaster, toast } from 'sonner';
import {
  BarChart3,
  Package,
  ShoppingBag,
  SearchCheck,
  Users,
  Image as ImageIcon,
  Mail,
  Settings as SettingsIcon,
  ShieldCheck,
  ScrollText,
  Search,
  Plus,
  ExternalLink,
  LogOut,
  Menu,
  X,
  Truck,
  Check,
  Upload,
  Trash2,
  Eye,
  MessageCircle,
  UserRound,
  Percent,
  Download,
} from 'lucide-react';
import { buildXlsx, downloadBytes } from '@/lib/xlsx';
import { Product, rub, stages } from '@/lib/catalog';
import { Badge, Chips, Drawer, Empty, Toolbar, fmtDate, fmtDateTime, matches, plural } from './admin-ui';
import { api } from '@/lib/client-api';
import { Choice } from './form-controls';
import { ProductImage } from './storefront';
import { Promotions } from './admin-promo';
import { CrmClients, RequestBoard, ViewToggle, requestFlow, requestTone } from './admin-crm';

// ───────────────────────── Разделы и права ─────────────────────────

type Area =
  | 'analytics'
  | 'products'
  | 'orders'
  | 'requests'
  | 'clients'
  | 'promotions'
  | 'banners'
  | 'campaigns'
  | 'settings'
  | 'roles'
  | 'audit';

const areaMeta: Record<Area, { title: string; icon: ReactNode; hint: string }> = {
  analytics: { title: 'Обзор', icon: <BarChart3 />, hint: 'Выручка, заказы и посетители' },
  orders: { title: 'Заказы', icon: <ShoppingBag />, hint: 'Оплаты и этапы доставки' },
  requests: { title: 'Поиск вещей', icon: <SearchCheck />, hint: 'Воронка заявок на персональный поиск' },
  products: { title: 'Товары', icon: <Package />, hint: 'Каталог, размеры и остатки' },
  clients: { title: 'Клиенты', icon: <Users />, hint: 'CRM: карточки, сегменты, заметки и ответственные' },
  promotions: { title: 'Акции', icon: <Percent />, hint: 'N по цене M, комплекты, скидки от суммы, доставка и промокоды' },
  banners: { title: 'Баннеры', icon: <ImageIcon />, hint: 'Три баннера на главной' },
  campaigns: { title: 'Рассылки', icon: <Mail />, hint: 'Письма подписчикам' },
  settings: { title: 'Настройки', icon: <SettingsIcon />, hint: 'Контакты, акция, реквизиты' },
  roles: { title: 'Команда', icon: <ShieldCheck />, hint: 'Роли и доступ' },
  audit: { title: 'Журнал', icon: <ScrollText />, hint: 'Кто и что менял' },
};
const navOrder: Area[] = [
  'analytics',
  'orders',
  'requests',
  'products',
  'clients',
  'promotions',
  'banners',
  'campaigns',
  'settings',
  'roles',
  'audit',
];
// Разделы меню сгруппированы по работе, а не свалены в один список.
const navGroups: { title: string; items: Area[] }[] = [
  { title: 'Продажи', items: ['analytics', 'orders'] },
  { title: 'CRM', items: ['clients', 'requests'] },
  { title: 'Витрина', items: ['products', 'promotions', 'banners', 'campaigns'] },
  { title: 'Система', items: ['roles', 'settings', 'audit'] },
];
const access: Record<string, Area[]> = {
  owner: navOrder,
  lead: ['analytics', 'products', 'orders', 'requests', 'clients', 'promotions', 'banners', 'campaigns', 'audit'],
  manager: ['orders', 'requests', 'clients'],
  content: ['products', 'banners'],
  marketing: ['analytics', 'promotions', 'banners', 'campaigns'],
};
const roleLabels: Record<string, string> = {
  owner: 'Владелец',
  lead: 'Руководитель',
  manager: 'Менеджер',
  content: 'Контент-менеджер',
  marketing: 'Маркетолог',
  customer: 'Покупатель',
};
const paymentLabels: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Ждёт оплаты', tone: 'warn' },
  paid: { label: 'Оплачен', tone: 'good' },
  failed: { label: 'Отказ оплаты', tone: 'bad' },
  expired: { label: 'Резерв истёк', tone: 'muted' },
};
const requestTones = requestTone;
const segmentLabels: Record<string, string> = {
  all: 'Все подписчики',
  new: 'Новые за 7 дней',
  buyers: 'Покупатели',
  'no-orders': 'Без заказов',
  promo: 'Участники акции',
};

async function fileToUpload(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (const x of bytes) bin += String.fromCharCode(x);
  return (await api('upload', { data: btoa(bin) })) as { url: string };
}

// ───────────────────────── Оболочка панели ─────────────────────────

export default function Admin({ user, setUser }: { user: any; setUser?: (u: any) => void }) {
  const router = useRouter();
  const areas = access[user?.role] || [];
  const [area, setArea] = useState<Area | ''>('');
  const [rows, setRows] = useState<any>(null);
  const [error, setError] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [period, setPeriod] = useState('week');
  const [reload, setReload] = useState(0);
  // Счётчики «что требует внимания» рядом с пунктами меню.
  const [counts, setCounts] = useState<{ orders?: number; requests?: number }>({});
  // Переход из одного раздела к конкретной записи другого: заказ → карточка клиента и обратно.
  const [focus, setFocus] = useState<{ area: Area; id: string } | null>(null);
  const goToItem = (a: Area, id: string) => {
    if (!areas.includes(a)) return;
    if (a !== area) setRows(null);
    setFocus({ area: a, id });
    setArea(a);
  };
  const openClient = areas.includes('clients') ? (email: string) => goToItem('clients', email) : undefined;
  useEffect(() => {
    if (!user) return;
    const can = access[user.role] || [];
    if (can.includes('orders'))
      api('admin/orders')
        .then((rows: any[]) =>
          setCounts((c) => ({
            ...c,
            orders: rows.filter((o) => o.payment === 'paid' && (o.data?.stage ?? 0) === 0).length,
          })),
        )
        .catch(() => {});
    if (can.includes('requests'))
      api('admin/requests')
        .then((rows: any[]) => setCounts((c) => ({ ...c, requests: rows.filter((r) => r.status === 'Новая').length })))
        .catch(() => {});
  }, [user, reload]);

  useEffect(() => {
    if (areas.length && !area) {
      let saved = '';
      try {
        saved = sessionStorage.getItem('hl-admin-area') || '';
      } catch {}
      setArea((areas.includes(saved as Area) ? saved : areas[0]) as Area);
    }
  }, [user]);
  useEffect(() => {
    if (!area) return;
    try {
      sessionStorage.setItem('hl-admin-area', area);
    } catch {}
    let cancelled = false;
    setError('');
    api('admin/' + area + (area === 'analytics' ? '?period=' + period : ''))
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [area, period, reload]);

  const refresh = () => setReload((n) => n + 1);
  async function save(body: any, target: Area | '' = area) {
    try {
      await api('admin/' + target, body);
      toast.success('Сохранено');
      refresh();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }

  if (user === undefined) return <div className="adm-boot">Загружаем панель…</div>;
  if (!user || !areas.length)
    return (
      <div className="adm-gate">
        <div className="adm-gate-card">
          <Link href="/" className="adm-logo">
            hauteline.
          </Link>
          <h1>{user ? 'Нет доступа к панели' : 'Панель команды'}</h1>
          <p>
            {user
              ? 'Ваш аккаунт — покупательский. Владелец магазина может выдать роль в разделе «Команда».'
              : 'Войдите аккаунтом сотрудника, чтобы управлять заказами, товарами и заявками.'}
          </p>
          {!user && (
            <Link href="/login?return=%2Fadmin" className="adm-btn is-primary">
              Войти
            </Link>
          )}
          <Link href="/" className="adm-link">
            Вернуться на сайт
          </Link>
        </div>
      </div>
    );

  const meta = area ? areaMeta[area] : null;
  return (
    <div className={'adm' + (navOpen ? ' nav-open' : '')}>
      <aside className="adm-side" aria-label="Разделы панели">
        <div className="adm-side-top">
          <Link href="/" className="adm-logo">
            hauteline.
          </Link>
          <span className="adm-side-caption">команда</span>
          <button className="adm-icon-btn adm-nav-close" aria-label="Закрыть меню" onClick={() => setNavOpen(false)}>
            <X />
          </button>
        </div>
        <nav className="adm-nav">
          {navGroups.map((g) => {
            const items = g.items.filter((a) => areas.includes(a));
            if (!items.length) return null;
            return (
              <div className="adm-nav-group" key={g.title}>
                <span className="adm-nav-label">{g.title}</span>
                {items.map((a) => {
                  const count = counts[a as 'orders' | 'requests'];
                  return (
                    <button
                      key={a}
                      className={a === area ? 'is-active' : ''}
                      aria-current={a === area ? 'page' : undefined}
                      onClick={() => {
                        if (a !== area) setRows(null);
                        setArea(a);
                        setNavOpen(false);
                      }}
                    >
                      <span>{areaMeta[a].title}</span>
                      {!!count && (
                        <em title={a === 'orders' ? 'Оплачены и ждут отправки' : 'Новые заявки'}>
                          {count}
                        </em>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="adm-side-user">
          <strong>{user.name || user.email}</strong>
          <small>
            {roleLabels[user.role]} · {user.email}
          </small>
        </div>
      </aside>
      <div className="adm-scrim" onClick={() => setNavOpen(false)} />
      <main className="adm-main">
        <header className="adm-top">
          <button className="adm-icon-btn adm-burger" aria-label="Открыть меню" onClick={() => setNavOpen(true)}>
            <Menu />
          </button>
          <div className="adm-title">
            <h1>{meta?.title}</h1>
            <p>{meta?.hint}</p>
          </div>
          <div className="adm-top-actions">
            <Link href="/" className="adm-btn is-ghost">
              <ExternalLink /> <span>На сайт</span>
            </Link>
            <button
              className="adm-btn is-ghost"
              onClick={async () => {
                try {
                  await api('auth/logout', {});
                } catch {}
                // Как при выходе из кабинета: корзина и избранное не должны достаться следующему аккаунту.
                for (const key of ['hl-cart', 'hl-favorites', 'hl-state-user']) {
                  try {
                    localStorage.removeItem(key);
                  } catch {}
                }
                window.dispatchEvent(new Event('cart-change'));
                setUser?.(null);
                router.push('/');
              }}
            >
              <LogOut /> <span>Выйти</span>
            </button>
          </div>
        </header>
        <div className="adm-content">
          {typeof window !== 'undefined' && (window as unknown as { __HL_DEMO?: boolean }).__HL_DEMO && (
            <div className="adm-demo-note">
              Демо-режим: данные примерные и хранятся только в этом браузере. Можно смело нажимать всё подряд.
            </div>
          )}
          {error ? (
            <div className="adm-error">{error}</div>
          ) : rows === null ? (
            <div className="adm-skeleton">
              {[0, 1, 2].map((i) => (
                <div key={i} />
              ))}
            </div>
          ) : area === 'analytics' ? (
            <Overview data={rows} period={period} setPeriod={setPeriod} areas={areas} goTo={(a) => {
                if (a !== area) setRows(null);
                setArea(a);
              }} />
          ) : area === 'products' ? (
            <Products rows={rows} save={save} />
          ) : area === 'orders' ? (
            <Orders
              rows={rows}
              save={save}
              focus={focus?.area === 'orders' ? focus.id : null}
              clearFocus={() => setFocus(null)}
              openClient={openClient}
            />
          ) : area === 'requests' ? (
            <Requests
              rows={rows}
              save={save}
              focus={focus?.area === 'requests' ? focus.id : null}
              clearFocus={() => setFocus(null)}
              openClient={openClient}
            />
          ) : area === 'clients' ? (
            <CrmClients
              rows={rows}
              me={user}
              refresh={refresh}
              focus={focus?.area === 'clients' ? focus.id : null}
              clearFocus={() => setFocus(null)}
              goTo={(a, id) => goToItem(a, id)}
            />
          ) : area === 'promotions' ? (
            <Promotions rows={rows} save={save} />
          ) : area === 'banners' ? (
            <Banners rows={rows} save={save} />
          ) : area === 'campaigns' ? (
            <Campaigns rows={rows} save={save} />
          ) : area === 'settings' ? (
            <SettingsForm rows={rows} save={save} />
          ) : area === 'roles' ? (
            <Team rows={rows} save={save} me={user} />
          ) : area === 'audit' ? (
            <Audit rows={rows} />
          ) : null}
        </div>
      </main>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}

// ───────────────────────── Общие куски ─────────────────────────

// ───────────────────────── Обзор ─────────────────────────

function Overview({
  data,
  period,
  setPeriod,
  areas,
  goTo,
}: {
  data: any;
  period: string;
  setPeriod: (v: string) => void;
  areas: Area[];
  goTo: (a: Area) => void;
}) {
  const series: { day: string; orders: number; revenue: number }[] = data.series || [];
  const max = Math.max(1, ...series.map((s) => s.revenue));
  const [hover, setHover] = useState<number | null>(null);
  const funnel = [
    ['Посетители', data.visits],
    ['Добавили в корзину', data.cart],
    ['Оформили заказ', data.orders],
    ['Оплатили', data.purchases],
  ] as [string, number][];
  const top = Math.max(1, funnel[0][1]);
  const avgCheck = data.purchases ? Math.round((data.revenue || 0) / data.purchases) : 0;
  return (
    <div className="adm-stack">
      <div className="adm-row-between">
        <Chips
          value={period}
          onChange={setPeriod}
          items={[
            { value: 'day', label: 'Сегодня' },
            { value: 'week', label: '7 дней' },
            { value: 'month', label: '30 дней' },
            { value: 'all', label: 'Всё время' },
          ]}
        />
      </div>
      {(data.pendingOrders > 0 || data.openRequests > 0) && (
        <div className="adm-alerts">
          {data.pendingOrders > 0 && areas.includes('orders') && (
            <button onClick={() => goTo('orders')}>
              <ShoppingBag />
              <span>
                <b>{data.pendingOrders}</b> {plural(data.pendingOrders, 'заказ ждёт', 'заказа ждут', 'заказов ждут')} оплаты
              </span>
            </button>
          )}
          {data.openRequests > 0 && areas.includes('requests') && (
            <button onClick={() => goTo('requests')}>
              <SearchCheck />
              <span>
                <b>{data.openRequests}</b> {plural(data.openRequests, 'заявка', 'заявки', 'заявок')} на поиск в работе
              </span>
            </button>
          )}
        </div>
      )}
      <div className="adm-kpis">
        <div className="adm-kpi is-hero">
          <span>Выручка</span>
          <strong>{rub(data.revenue || 0)}</strong>
          <small>
            {data.purchases} {plural(data.purchases, 'оплаченный заказ', 'оплаченных заказа', 'оплаченных заказов')}
          </small>
        </div>
        <div className="adm-kpi">
          <span>Средний чек</span>
          <strong>{avgCheck ? rub(avgCheck) : '—'}</strong>
        </div>
        <div className="adm-kpi">
          <span>Конверсия в покупку</span>
          <strong>{data.conversion}%</strong>
        </div>
        <div className="adm-kpi">
          <span>Регистрации</span>
          <strong>{data.registrations}</strong>
        </div>
        <div className="adm-kpi">
          <span>Заявки на поиск</span>
          <strong>{data.requests}</strong>
        </div>
        <div className="adm-kpi">
          <span>Время на сайте</span>
          <strong>
            {Math.floor((data.averageSeconds || 0) / 60)}:{String(Math.round(data.averageSeconds || 0) % 60).padStart(2, '0')}
          </strong>
          <small>мин:сек в среднем</small>
        </div>
      </div>
      <div className="adm-grid-2">
        <section className="adm-card">
          <div className="adm-card-head">
            <h2>Выручка по дням</h2>
            <span>{series.length ? fmtDate(new Date(series[0].day).getTime()) + ' — сегодня' : ''}</span>
          </div>
          {series.some((s) => s.revenue > 0) ? (
            <div className="adm-chart" onMouseLeave={() => setHover(null)}>
              <div className="adm-chart-grid" aria-hidden="true">
                <span>{rub(max)}</span>
                <span>{rub(Math.round(max / 2))}</span>
                <span>0</span>
              </div>
              <div className="adm-chart-bars" role="img" aria-label="Выручка по дням">
                {series.map((s, i) => (
                  <div
                    key={s.day}
                    className={'adm-bar' + (hover === i ? ' is-hover' : '')}
                    onMouseEnter={() => setHover(i)}
                  >
                    <i style={{ height: Math.max(s.revenue ? 3 : 0, (s.revenue / max) * 100) + '%' }} />
                  </div>
                ))}
              </div>
              {hover !== null && series[hover] && (
                <div className="adm-tip" style={{ left: ((hover + 0.5) / series.length) * 100 + '%' }}>
                  <b>{rub(series[hover].revenue)}</b>
                  <span>
                    {new Date(series[hover].day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} ·{' '}
                    {series[hover].orders} {plural(series[hover].orders, 'заказ', 'заказа', 'заказов')}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <Empty title="Оплат за период пока нет" text="График появится после первой оплаты." />
          )}
        </section>
        <section className="adm-card">
          <div className="adm-card-head">
            <h2>Воронка</h2>
            <span>уникальные посетители → оплата</span>
          </div>
          <div className="adm-funnel">
            {funnel.map(([label, value]) => (
              <div key={label}>
                <div className="adm-funnel-label">
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
                <div className="adm-funnel-track">
                  <i style={{ width: Math.max(value ? 2 : 0, (value / top) * 100) + '%' }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ───────────────────────── Товары ─────────────────────────

const emptyProduct = {
  name: '',
  brand: '',
  price: 7000,
  availability: 'preorder',
  condition: 'Новое',
  sizes: ['M'],
  stock: 1,
  image: '',
  gallery: [],
  description: '',
  published: false,
  promo: false,
  variants: [{ size: 'M', stock: 1 }],
};

function Products({ rows, save }: { rows: any[]; save: (b: any, a?: Area) => Promise<boolean> }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'published' | 'draft' | 'out'>('all');
  const [editing, setEditing] = useState<any>(null);
  const count = (f: typeof filter) =>
    rows.filter((p) => (f === 'all' ? true : f === 'published' ? p.published : f === 'draft' ? !p.published : p.stock <= 0)).length;
  const list = rows.filter(
    (p) =>
      matches({ n: p.name, b: p.brand, id: p.id, c: p.category }, search) &&
      (filter === 'all' ? true : filter === 'published' ? p.published : filter === 'draft' ? !p.published : p.stock <= 0),
  );
  return (
    <div className="adm-stack">
      <Toolbar search={search} setSearch={setSearch} placeholder="Название, бренд или артикул">
        <button className="adm-btn is-primary" onClick={() => setEditing({ ...emptyProduct })}>
          <Plus /> Добавить вещь
        </button>
      </Toolbar>
      <Chips
        value={filter}
        onChange={setFilter}
        items={[
          { value: 'all', label: 'Все', count: count('all') },
          { value: 'published', label: 'На витрине', count: count('published') },
          { value: 'draft', label: 'Черновики', count: count('draft') },
          { value: 'out', label: 'Нет в наличии', count: count('out') },
        ]}
      />
      {!list.length ? (
        <Empty
          title={rows.length ? 'Ничего не нашли' : 'Товаров пока нет'}
          text={rows.length ? 'Измените поиск или фильтр.' : 'Добавьте первую вещь — она появится в каталоге после публикации.'}
        />
      ) : (
        <div className="adm-card is-flush">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Вещь</th>
                <th>Наличие</th>
                <th className="num">Цена</th>
                <th className="num">Остаток</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="is-clickable" onClick={() => setEditing(p)}>
                  <td>
                    <div className="adm-item">
                      <ProductImage p={p} />
                      <div>
                        <b>{p.name}</b>
                        <small>
                          {[p.brand, p.id].filter(Boolean).join(' · ')}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge tone={p.availability === 'stock' ? 'good' : 'accent'}>
                      {p.availability === 'stock' ? 'В наличии в РФ' : 'Под заказ'}
                    </Badge>
                  </td>
                  <td className="num">{rub(p.price)}</td>
                  <td className="num">
                    {p.stock <= 0 ? <Badge tone="bad">0</Badge> : <span title={(p.variants || []).map((v: any) => v.size + ': ' + v.stock).join(', ')}>{p.stock} шт.</span>}
                  </td>
                  <td>
                    <div className="adm-badges">
                      <Badge tone={p.published ? 'good' : 'muted'}>{p.published ? 'На витрине' : 'Черновик'}</Badge>
                      {p.promo && <Badge tone="accent">1 ₽</Badge>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Редактирование вещи' : 'Новая вещь'}
        subtitle={editing?.id ? 'Артикул ' + editing.id : 'Заполните карточку и опубликуйте'}
      >
        {editing && (
          <ProductEditor
            key={editing.id || 'new'}
            initial={editing}
            onSave={async (p) => {
              if (await save(p, 'products')) setEditing(null);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

function ProductEditor({ initial, onSave }: { initial: any; onSave: (p: any) => void }) {
  const [p, setP] = useState<any>({ ...initial, gallery: initial.gallery || [] });
  const [uploading, setUploading] = useState(false);
  const field = (k: string, v: unknown) => setP((x: any) => ({ ...x, [k]: v }));
  const variants: { size: string; stock: number }[] =
    p.variants || p.sizes.map((s: string) => ({ size: s, stock: 0 }));
  const setVariants = (v: typeof variants) => field('variants', v);
  const gallery: string[] = p.gallery?.length ? p.gallery : p.image ? [p.image] : [];
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, 10)) urls.push((await fileToUpload(f)).url);
      setP((x: any) => {
        // У вещей из макета главное фото — общий «спрайт» на несколько товаров; его в галерею не переносим.
        const base = x.sprite !== undefined ? [] : x.gallery?.length ? x.gallery : x.image ? [x.image] : [];
        const g = [...base, ...urls].slice(0, 10);
        return { ...x, gallery: g, image: x.image && x.sprite === undefined ? x.image : g[0], sprite: undefined };
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <form
      className="adm-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...p,
          sizes: variants.map((v) => v.size),
          variants,
          stock: variants.reduce((n, v) => n + v.stock, 0),
        });
      }}
    >
      <fieldset>
        <legend>Фото</legend>
        <div className="adm-gallery">
          {gallery.map((src, i) => (
            <div key={src + i} className={'adm-thumb' + (src === p.image ? ' is-main' : '')}>
              {p.sprite !== undefined && i === 0 && src === p.image ? <ProductImage p={p} /> : <img src={src} alt="" />}
              <div className="adm-thumb-actions">
                {src !== p.image && (
                  <button type="button" title="Сделать главным" onClick={() => setP((x: any) => ({ ...x, image: src, sprite: undefined }))}>
                    <Check />
                  </button>
                )}
                <button
                  type="button"
                  title="Убрать"
                  onClick={() =>
                    setP((x: any) => {
                      const g = gallery.filter((_, j) => j !== i);
                      return { ...x, gallery: g, image: src === x.image ? g[0] || '' : x.image };
                    })
                  }
                >
                  <Trash2 />
                </button>
              </div>
              {src === p.image && <span>Главное</span>}
            </div>
          ))}
          <label className="adm-upload">
            <Upload />
            <span>{uploading ? 'Загружаем…' : 'Добавить фото'}</span>
            <small>JPG, PNG, WebP до 5 МБ</small>
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => upload(e.target.files)} />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Основное</legend>
        <label className="adm-field">
          <span>Название</span>
          <input required value={p.name} onChange={(e) => field('name', e.target.value)} placeholder="Техническая куртка с капюшоном" />
        </label>
        <div className="adm-fields-2">
          <label className="adm-field">
            <span>Бренд</span>
            <input value={p.brand} onChange={(e) => field('brand', e.target.value)} placeholder="Moncler" />
          </label>
          <label className="adm-field">
            <span>Цена, ₽</span>
            <input type="number" min="1" required value={p.price} onChange={(e) => field('price', Number(e.target.value))} />
          </label>
          <label className="adm-field">
            <span>Старая цена, ₽ — зачёркнутая</span>
            <input
              type="number"
              min="0"
              value={p.compareAt || ''}
              placeholder="Пусто — без скидки"
              onChange={(e) => field('compareAt', e.target.value ? Number(e.target.value) : undefined)}
            />
            {!!p.compareAt && p.compareAt <= p.price && <small className="adm-note">Должна быть больше цены — иначе не покажется</small>}
          </label>
          <div className="adm-field">
            <span>Наличие</span>
            <Choice label="Наличие" value={p.availability} onChange={(v) => field('availability', v)} items={['preorder', 'stock']} />
          </div>
          <div className="adm-field">
            <span>Состояние</span>
            <Choice label="Состояние" value={p.condition} onChange={(v) => field('condition', v)} items={['Новое', 'Идеальное', 'Хорошее']} />
          </div>
        </div>
        <label className="adm-field">
          <span>Описание</span>
          <textarea value={p.description} onChange={(e) => field('description', e.target.value)} placeholder="Материал, посадка, замеры" />
        </label>
      </fieldset>
      <fieldset>
        <legend>Для поиска и фильтров</legend>
        <div className="adm-fields-2">
          <label className="adm-field">
            <span>Тип вещи</span>
            <input value={p.category || ''} onChange={(e) => field('category', e.target.value)} placeholder="Кроссовки" />
          </label>
          <label className="adm-field">
            <span>Раздел</span>
            <select value={p.gender || ''} onChange={(e) => field('gender', e.target.value)}>
              <option value="">Не указан</option>
              <option value="women">Женское</option>
              <option value="men">Мужское</option>
              <option value="unisex">Унисекс</option>
            </select>
          </label>
          <label className="adm-field">
            <span>Цвет</span>
            <input value={p.color || ''} onChange={(e) => field('color', e.target.value)} placeholder="Графитовый" />
          </label>
          <label className="adm-field">
            <span>Образец цвета</span>
            <span className="adm-color">
              <input type="color" value={p.colorHex || '#000000'} onChange={(e) => field('colorHex', e.target.value)} />
              <code>{p.colorHex || '—'}</code>
            </span>
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Размеры и остатки</legend>
        <div className="adm-variants">
          {variants.map((v, i) => (
            <div className="adm-variant" key={i}>
              <input aria-label="Размер" value={v.size} required placeholder="M" onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, size: e.target.value } : x)))} />
              <div className="adm-stepper">
                <button type="button" aria-label="Меньше" onClick={() => setVariants(variants.map((x, j) => (j === i ? { ...x, stock: Math.max(0, x.stock - 1) } : x)))}>
                  −
                </button>
                <input aria-label="Остаток" type="number" min="0" value={v.stock} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, stock: Math.max(0, Number(e.target.value)) } : x)))} />
                <button type="button" aria-label="Больше" onClick={() => setVariants(variants.map((x, j) => (j === i ? { ...x, stock: x.stock + 1 } : x)))}>
                  +
                </button>
              </div>
              <button type="button" className="adm-icon-btn" aria-label="Убрать размер" onClick={() => setVariants(variants.filter((_, j) => j !== i))}>
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="adm-btn is-ghost" onClick={() => setVariants([...variants, { size: '', stock: 1 }])}>
          <Plus /> Добавить размер
        </button>
        <p className="adm-note">Всего: {variants.reduce((n, v) => n + v.stock, 0)} шт.</p>
      </fieldset>
      <fieldset>
        <legend>Публикация</legend>
        <label className="adm-switch">
          <input type="checkbox" checked={!!p.published} onChange={(e) => field('published', e.target.checked)} />
          <i />
          <span>
            <b>Показывать на витрине</b>
            <small>Без галочки вещь сохранится черновиком</small>
          </span>
        </label>
        <label className="adm-switch">
          <input type="checkbox" checked={!!p.promo} onChange={(e) => field('promo', e.target.checked)} />
          <i />
          <span>
            <b>Участвует в акции за 1 ₽</b>
            <small>Работает, только когда акция включена в настройках</small>
          </span>
        </label>
      </fieldset>
      <div className="adm-form-foot">
        {!p.image && <span className="adm-note">Добавьте хотя бы одно фото</span>}
        <button className="adm-btn is-primary" disabled={uploading || !p.image || !variants.length}>
          Сохранить вещь
        </button>
      </div>
    </form>
  );
}

// ───────────────────────── Заказы ─────────────────────────

function Orders({
  rows,
  save,
  focus,
  clearFocus,
  openClient,
}: {
  rows: any[];
  save: (b: any, a?: Area) => Promise<boolean>;
  focus?: string | null;
  clearFocus?: () => void;
  openClient?: (email: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (focus) {
      setOpenId(focus);
      clearFocus?.();
    }
  }, [focus]);
  // Массовая смена этапа: отмечаем несколько оплаченных заказов и ставим им один этап.
  const [picked, setPicked] = useState<string[]>([]);
  const [bulkStage, setBulkStage] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const open = rows.find((o) => o.id === openId) || null;
  const list = rows.filter(
    (o) =>
      (filter === 'all' || o.payment === filter) &&
      matches({ id: o.id, n: o.data.name, e: o.data.email, p: o.data.phone, i: o.data.items.map((l: any) => l.name) }, search),
  );
  const cnt = (f: string) => rows.filter((o) => f === 'all' || o.payment === f).length;
  const pickable = list.filter((o) => o.payment === 'paid');
  const pickedVisible = picked.filter((id) => pickable.some((o) => o.id === id));
  const allPicked = pickable.length > 0 && pickedVisible.length === pickable.length;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const steps = [...stages, 'Получен покупателем'];
  async function applyBulk() {
    if (!pickedVisible.length || bulkStage === '') return;
    setBulkBusy(true);
    const ok = await save({ ids: pickedVisible, stage: Number(bulkStage) }, 'orders');
    setBulkBusy(false);
    if (ok) {
      setPicked([]);
      setBulkStage('');
    }
  }
  return (
    <div className="adm-stack">
      <Toolbar search={search} setSearch={setSearch} placeholder="Номер, имя, телефон или вещь">
        <button
          className="adm-btn is-ghost"
          disabled={!list.length}
          title="Скачать заказы из списка ниже (с учётом поиска и фильтра) в Excel"
          onClick={() => exportOrders(list)}
        >
          <Download /> Excel · {list.length}
        </button>
      </Toolbar>
      <Chips
        value={filter}
        onChange={setFilter}
        items={[
          { value: 'all', label: 'Все', count: cnt('all') },
          { value: 'paid', label: 'Оплачены', count: cnt('paid') },
          { value: 'pending', label: 'Ждут оплаты', count: cnt('pending') },
          { value: 'failed', label: 'Отказ', count: cnt('failed') },
          { value: 'expired', label: 'Резерв истёк', count: cnt('expired') },
        ]}
      />
      {!list.length ? (
        <Empty title={rows.length ? 'Ничего не нашли' : 'Заказов пока нет'} text={rows.length ? 'Измените поиск или фильтр.' : 'Новые заказы появятся здесь сразу после оформления.'} />
      ) : (
        <div className="adm-card is-flush">
          <table className="adm-table has-pick">
            <thead>
              <tr>
                <th className="pick">
                  <input
                    type="checkbox"
                    aria-label="Отметить все оплаченные заказы в списке"
                    title={pickable.length ? 'Отметить все оплаченные' : 'В списке нет оплаченных заказов'}
                    disabled={!pickable.length}
                    checked={allPicked}
                    onChange={() => setPicked(allPicked ? [] : pickable.map((o) => o.id))}
                  />
                </th>
                <th>Заказ</th>
                <th>Покупатель</th>
                <th>Состав</th>
                <th className="num">Сумма</th>
                <th>Оплата</th>
                <th>Доставка</th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <tr
                  key={o.id}
                  className={'is-clickable' + (picked.includes(o.id) ? ' is-picked' : '')}
                  onClick={() => setOpenId(o.id)}
                >
                  <td className="pick" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={'Отметить заказ ' + o.id}
                      title={o.payment === 'paid' ? 'Отметить для смены этапа' : 'Этап можно менять только у оплаченных заказов'}
                      disabled={o.payment !== 'paid'}
                      checked={picked.includes(o.id)}
                      onChange={() => toggle(o.id)}
                    />
                  </td>
                  <td>
                    <b className="mono">{o.id}</b>
                    <small>{fmtDateTime(o.created)}</small>
                  </td>
                  <td>
                    <b>{o.data.name}</b>
                    <small>{o.data.phone}</small>
                  </td>
                  <td className="adm-cell-items">
                    {o.data.items.map((l: any) => l.name).join(', ')}
                    <small>
                      {o.data.items.reduce((n: number, l: any) => n + l.qty, 0)} шт.
                    </small>
                  </td>
                  <td className="num">
                    <b>{rub(o.total)}</b>
                  </td>
                  <td>
                    <Badge tone={paymentLabels[o.payment]?.tone}>{paymentLabels[o.payment]?.label || o.payment}</Badge>
                  </td>
                  <td>
                    {o.payment === 'paid' ? (
                      <span className="adm-stage-mini">
                        <Truck /> {o.data.stage >= 8 ? 'Получен' : stages[o.data.stage]}
                      </span>
                    ) : (
                      <span className="adm-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pickedVisible.length > 0 && (
        <div className="adm-bulk" role="region" aria-label="Действия с отмеченными заказами">
          <b>
            Выбрано: {pickedVisible.length} {plural(pickedVisible.length, 'заказ', 'заказа', 'заказов')}
          </b>
          <label className="adm-bulk-stage">
            <span>Новый этап</span>
            <select value={bulkStage} onChange={(e) => setBulkStage(e.target.value)}>
              <option value="">Выберите этап…</option>
              {steps.map((s, i) => (
                <option key={s} value={i}>
                  {String(i + 1).padStart(2, '0')} · {s}
                </option>
              ))}
            </select>
          </label>
          <button className="adm-btn is-primary" disabled={bulkStage === '' || bulkBusy} onClick={applyBulk}>
            {bulkBusy ? 'Сохраняем…' : 'Применить'}
          </button>
          <button className="adm-btn is-ghost" onClick={() => setPicked([])}>
            Снять выбор
          </button>
        </div>
      )}
      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open ? 'Заказ ' + open.id : ''} subtitle={open ? fmtDateTime(open.created) : ''}>
        {open && openClient && (
          <button className="adm-btn is-ghost is-small crm-open-client" onClick={() => openClient(open.user_email || open.data.email)}>
            <UserRound /> Карточка клиента
          </button>
        )}
        {open && (
          <OrderEditor
            key={open.id + open.data.history.length}
            order={open}
            onSave={async (body) => {
              await save(body, 'orders');
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

// Выгрузка заказов в Excel: лист «Заказы» (строка на заказ) и лист «Позиции» (строка на вещь)
function exportOrders(rows: any[]) {
  const pay = (o: any) => paymentLabels[o.payment]?.label || o.payment;
  const stage = (o: any) => (o.payment === 'paid' ? (o.data.stage >= 8 ? 'Получен покупателем' : stages[o.data.stage] || '') : '');
  const discounts = (o: any) => (o.data.discounts || []).reduce((s: number, d: any) => s + d.amount, 0);
  const bytes = buildXlsx([
    {
      name: 'Заказы',
      columns: [
        { title: 'Номер', width: 18 },
        { title: 'Дата (МСК)', width: 17 },
        { title: 'Оплата', width: 14 },
        { title: 'Этап доставки', width: 24 },
        { title: 'Покупатель', width: 22 },
        { title: 'Телефон', width: 18 },
        { title: 'Email', width: 26 },
        { title: 'Адрес / ПВЗ', width: 32 },
        { title: 'Доставка', width: 18 },
        { title: 'Способ оплаты', width: 14 },
        { title: 'Связь', width: 11 },
        { title: 'Состав', width: 48 },
        { title: 'Вещей, шт.', width: 10 },
        { title: 'Без скидок', width: 13 },
        { title: 'Скидки', width: 12 },
        { title: 'Акции и промокод', width: 30 },
        { title: 'Итого', width: 13 },
        { title: 'Комментарий покупателя', width: 30 },
        { title: 'Комментарий менеджера', width: 30 },
      ],
      rows: rows.map((o) => [
        o.id,
        new Date(o.created),
        pay(o),
        stage(o),
        o.data.name,
        o.data.phone,
        o.data.email,
        o.data.address,
        o.data.deliveryMode || o.data.carrier,
        o.data.paymentMethod,
        o.data.contactMethod,
        o.data.items.map((l: any) => `${l.brand ? l.brand + ' ' : ''}${l.name}, ${l.size} × ${l.qty}`).join('; '),
        o.data.items.reduce((n: number, l: any) => n + l.qty, 0),
        { money: o.data.subtotal ?? o.data.items.reduce((s: number, l: any) => s + l.price * l.qty, 0) },
        discounts(o) ? { money: discounts(o) } : null,
        [...(o.data.discounts || []).map((d: any) => d.label), o.data.freeDelivery ? 'Бесплатная доставка' : '']
          .filter(Boolean)
          .join('; '),
        { money: o.total },
        o.data.comment,
        o.data.managerComment,
      ]),
    },
    {
      name: 'Позиции',
      columns: [
        { title: 'Заказ', width: 18 },
        { title: 'Дата (МСК)', width: 17 },
        { title: 'Оплата', width: 14 },
        { title: 'Вещь', width: 36 },
        { title: 'Бренд', width: 16 },
        { title: 'Артикул', width: 16 },
        { title: 'Размер', width: 10 },
        { title: 'Кол-во', width: 8 },
        { title: 'Цена', width: 12 },
        { title: 'Скидка', width: 12 },
        { title: 'Сумма', width: 12 },
        { title: 'Покупатель', width: 22 },
      ],
      rows: rows.flatMap((o) =>
        o.data.items.map((l: any) => [
          o.id,
          new Date(o.created),
          pay(o),
          l.name,
          l.brand,
          l.id,
          l.size,
          l.qty,
          { money: l.price },
          l.discount ? { money: l.discount } : null,
          { money: l.price * l.qty - (l.discount || 0) },
          o.data.name,
        ]),
      ),
    },
  ]);
  const d = new Date();
  downloadBytes(
    bytes,
    `hauteline-orders-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.xlsx`,
  )
    .then(() => toast.success('Файл Excel готов: ' + rows.length + ' ' + plural(rows.length, 'заказ', 'заказа', 'заказов')))
    .catch((e: { code?: string }) => {
      if (e?.code !== 'declined') toast.error('Не удалось сохранить файл');
    });
}
function OrderEditor({ order, onSave }: { order: any; onSave: (b: any) => void }) {
  const d = order.data;
  const [stage, setStage] = useState<number>(d.stage);
  const [delay, setDelay] = useState(d.delay || '');
  const [comment, setComment] = useState(d.managerComment || '');
  const paid = order.payment === 'paid';
  const steps = [...stages, 'Получен покупателем'];
  return (
    <div className="adm-form">
      <div className="adm-order-head">
        <Badge tone={paymentLabels[order.payment]?.tone}>{paymentLabels[order.payment]?.label}</Badge>
        <strong>{rub(order.total)}</strong>
      </div>
      {(d.discounts?.length > 0 || d.promoCode || d.freeDelivery) && (
        <fieldset>
          <legend>Акции и скидки</legend>
          <dl className="adm-dl">
            {d.subtotal !== undefined && (
              <>
                <dt>Без скидок</dt>
                <dd>{rub(d.subtotal)}</dd>
              </>
            )}
            {(d.discounts || []).map((x: any) => (
              <React.Fragment key={x.id}>
                <dt>{x.label}</dt>
                <dd>−{rub(x.amount)}</dd>
              </React.Fragment>
            ))}
            {d.freeDelivery && (
              <>
                <dt>Доставка</dt>
                <dd>Бесплатно</dd>
              </>
            )}
          </dl>
        </fieldset>
      )}
      <fieldset>
        <legend>Покупатель</legend>
        <dl className="adm-dl">
          <dt>Имя</dt>
          <dd>{d.name}</dd>
          <dt>Телефон</dt>
          <dd>
            <a href={'tel:' + d.phone}>{d.phone}</a>
          </dd>
          <dt>Email</dt>
          <dd>{d.email}</dd>
          {d.contactMethod && (
            <>
              <dt>Связь</dt>
              <dd>
                <Badge tone="accent">
                  <MessageCircle /> {d.contactMethod}
                </Badge>
              </dd>
            </>
          )}
        </dl>
      </fieldset>
      <fieldset>
        <legend>Состав</legend>
        <div className="adm-lines">
          {d.items.map((l: any, i: number) => (
            <div key={i} className="adm-line">
              <ProductImage p={l as Product} />
              <div>
                <b>{l.name}</b>
                <small>
                  {[l.brand, 'Размер ' + l.size, l.qty + ' шт.'].filter(Boolean).join(' · ')}
                  {l.promo && ' · акция 1 ₽'}
                </small>
              </div>
              <span>{rub(l.price * l.qty)}</span>
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Доставка и оплата</legend>
        <dl className="adm-dl">
          <dt>Способ</dt>
          <dd>{d.deliveryMode || d.carrier}</dd>
          <dt>Адрес</dt>
          <dd>{d.address}</dd>
          <dt>ПВЗ</dt>
          <dd>{d.pvzId || 'Тестовое оформление'}</dd>
          {d.paymentMethod && (
            <>
              <dt>Оплата</dt>
              <dd>{d.paymentMethod}</dd>
            </>
          )}
          {d.comment && (
            <>
              <dt>Комментарий</dt>
              <dd>{d.comment}</dd>
            </>
          )}
        </dl>
      </fieldset>
      <fieldset>
        <legend>Этап доставки</legend>
        {!paid && <p className="adm-note">Этапы доступны после оплаты заказа.</p>}
        <ol className={'adm-steps' + (paid ? '' : ' is-disabled')}>
          {steps.map((s, i) => (
            <li key={s} className={(i < stage ? 'is-done' : '') + (i === stage ? ' is-current' : '')}>
              <button type="button" disabled={!paid} onClick={() => setStage(i)}>
                <i>{i < stage ? <Check /> : i + 1}</i>
                <span>{s}</span>
              </button>
            </li>
          ))}
        </ol>
        <label className="adm-field">
          <span>Сообщение о задержке · покупатель увидит его в кабинете</span>
          <input value={delay} disabled={!paid} onChange={(e) => setDelay(e.target.value)} placeholder="Задержка на таможне до 4 дней" />
        </label>
        <label className="adm-field">
          <span>Комментарий менеджера · попадёт в историю заказа</span>
          <textarea value={comment} disabled={!paid} onChange={(e) => setComment(e.target.value)} />
        </label>
        <div className="adm-form-foot">
          <button type="button" className="adm-btn is-primary" disabled={!paid} onClick={() => onSave({ id: order.id, stage, delay, managerComment: comment })}>
            Сохранить этап
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend>История</legend>
        <ul className="adm-timeline">
          {[...d.history].reverse().map((h: any, i: number) => (
            <li key={i}>
              <time>{fmtDateTime(h.date)}</time>
              <span>{h.note}</span>
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );
}

// ───────────────────────── Заявки на поиск ─────────────────────────

const requestStatuses = requestFlow;
function Requests({
  rows,
  save,
  focus,
  clearFocus,
  openClient,
}: {
  rows: any[];
  save: (b: any, a?: Area) => Promise<boolean>;
  focus?: string | null;
  clearFocus?: () => void;
  openClient?: (email: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('open');
  const [view, setView] = useState<'board' | 'list'>(() => {
    try {
      return (localStorage.getItem('hl-admin-requests-view') as 'board' | 'list') || 'board';
    } catch {
      return 'board';
    }
  });
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (focus) {
      setOpenId(focus);
      clearFocus?.();
    }
  }, [focus]);
  const changeView = (v: 'board' | 'list') => {
    setView(v);
    try {
      localStorage.setItem('hl-admin-requests-view', v);
    } catch {}
  };
  const open = rows.find((r) => r.id === openId) || null;
  const inFilter = (r: any, f: string) => (f === 'all' ? true : f === 'open' ? ['Новая', 'В работе'].includes(r.status) : r.status === f);
  const found = rows.filter((r) => matches(r.data, search));
  const list = found.filter((r) => inFilter(r, filter));
  return (
    <div className="adm-stack">
      <Toolbar search={search} setSearch={setSearch} placeholder="Имя, контакт или что ищут">
        <ViewToggle value={view} onChange={changeView} />
      </Toolbar>
      {view === 'board' ? (
        rows.length ? (
          <>
            <RequestBoard
              rows={found}
              onOpen={setOpenId}
              onMove={(r, status) => save({ id: r.id, status, comment: r.comment || '' }, 'requests')}
            />
            <p className="adm-muted crm-board-hint">Перетащите карточку в другую колонку, чтобы сменить этап. На телефоне — откройте заявку и выберите этап.</p>
          </>
        ) : (
          <Empty title="Заявок пока нет" text="Заявки приходят из формы «Найдём любую позицию» на главной." />
        )
      ) : (
        <>
          <Chips
            value={filter}
            onChange={setFilter}
            items={[
              { value: 'open', label: 'Активные', count: rows.filter((r) => inFilter(r, 'open')).length },
              ...requestStatuses.map((s) => ({ value: s, label: s, count: rows.filter((r) => r.status === s).length })),
              { value: 'all', label: 'Все', count: rows.length },
            ]}
          />
          {!list.length ? (
            <Empty title={rows.length ? 'В этом статусе заявок нет' : 'Заявок пока нет'} text="Заявки приходят из формы «Найдём любую позицию» на главной." />
          ) : (
            <div className="adm-cards">
              {list.map((r) => (
                <button key={r.id} className="adm-req" onClick={() => setOpenId(r.id)}>
                  <div className="adm-req-top">
                    <Badge tone={requestTones[r.status]}>{r.status}</Badge>
                    <time>{fmtDateTime(r.created)}</time>
                  </div>
                  <b>{r.data.name}</b>
                  <p>{r.data.description || 'Без описания — уточните в мессенджере'}</p>
                  <small>
                    <MessageCircle /> {r.data.messenger} · {r.data.contact}
                  </small>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <Drawer open={!!open} onClose={() => setOpenId(null)} title="Заявка на поиск" subtitle={open ? fmtDateTime(open.created) : ''}>
        {open && openClient && (
          <button className="adm-btn is-ghost is-small crm-open-client" onClick={() => openClient(open.user_email || open.data.email)}>
            <UserRound /> Карточка клиента
          </button>
        )}
        {open && (
          <RequestEditor
            key={open.id + open.status}
            request={open}
            onSave={async (b) => {
              if (await save(b, 'requests')) setOpenId(null);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}
function RequestEditor({ request, onSave }: { request: any; onSave: (b: any) => void }) {
  const [status, setStatus] = useState(request.status);
  const [comment, setComment] = useState(request.comment || '');
  const d = request.data;
  const href =
    d.messenger === 'WhatsApp'
      ? 'https://wa.me/' + String(d.contact).replace(/\D/g, '')
      : 'https://t.me/' + String(d.contact).replace(/^@|^https:\/\/t.me\//g, '').replace(/[^\w]/g, '');
  return (
    <div className="adm-form">
      <fieldset>
        <legend>Покупатель</legend>
        <dl className="adm-dl">
          <dt>Имя</dt>
          <dd>{d.name}</dd>
          <dt>Email</dt>
          <dd>{d.email}</dd>
          <dt>{d.messenger}</dt>
          <dd>{d.contact}</dd>
        </dl>
        <a href={href} target="_blank" rel="noreferrer" className="adm-btn is-ghost">
          <MessageCircle /> Написать в {d.messenger}
        </a>
      </fieldset>
      <fieldset>
        <legend>Что ищут</legend>
        <p className="adm-quote">{d.description || 'Описание не указано'}</p>
        <dl className="adm-dl">
          <dt>Размер</dt>
          <dd>{d.size || 'Не указан'}</dd>
          <dt>Бюджет</dt>
          <dd>{d.budget || 'Не указан'}</dd>
          {d.reference && (
            <>
              <dt>Ссылка</dt>
              <dd>{d.reference}</dd>
            </>
          )}
        </dl>
        {d.attachment && <img src={'/api/files/' + d.attachment} alt="Референс покупателя" className="adm-ref" />}
      </fieldset>
      <fieldset>
        <legend>Обработка</legend>
        <div className="adm-seg">
          {requestStatuses.map((s) => (
            <button key={s} type="button" className={status === s ? 'is-active' : ''} onClick={() => setStatus(s)}>
              {s}
            </button>
          ))}
        </div>
        <label className="adm-field">
          <span>Комментарий менеджера</span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Нашли в Mytheresa, 43 размер, 42 000 ₽ с доставкой" />
        </label>
        <div className="adm-form-foot">
          <button type="button" className="adm-btn is-primary" onClick={() => onSave({ id: request.id, status, comment })}>
            Сохранить
          </button>
        </div>
      </fieldset>
    </div>
  );
}

// ───────────────────────── Клиенты, команда, журнал ─────────────────────────

function Team({ rows, save, me }: { rows: any[]; save: (b: any, a?: Area) => Promise<boolean>; me: any }) {
  const [search, setSearch] = useState('');
  const [onlyStaff, setOnlyStaff] = useState(true);
  const list = rows.filter((r) => (!onlyStaff || r.role !== 'customer') && matches({ n: r.name, e: r.email }, search));
  return (
    <div className="adm-stack">
      <Toolbar search={search} setSearch={setSearch} placeholder="Найти человека по имени или email">
        <label className="adm-switch is-inline">
          <input type="checkbox" checked={onlyStaff} onChange={(e) => setOnlyStaff(e.target.checked)} />
          <i />
          <span>Только команда</span>
        </label>
      </Toolbar>
      <div className="adm-roles-help">
        {Object.entries(access).map(([role, list]) => (
          <div key={role}>
            <b>{roleLabels[role]}</b>
            <span>{list.map((a) => areaMeta[a].title).join(', ')}</span>
          </div>
        ))}
      </div>
      {!list.length ? (
        <Empty title="Никого не нашли" text={onlyStaff ? 'Чтобы выдать роль покупателю, выключите «Только команда» и найдите его по email.' : undefined} />
      ) : (
        <div className="adm-card is-flush">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Человек</th>
                <th>Роль</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="adm-person">
                      <div className="adm-avatar is-soft">{(r.name || r.email).slice(0, 1).toUpperCase()}</div>
                      <div>
                        <b>
                          {r.name || 'Без имени'} {r.id === me.id && <Badge tone="accent">это вы</Badge>}
                        </b>
                        <small>{r.email}</small>
                      </div>
                    </div>
                  </td>
                  <td className="adm-role-cell">
                    <Choice label="Роль" value={r.role} onChange={(role) => save({ id: r.id, role }, 'roles')} items={Object.keys(roleLabels)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoginBans />
    </div>
  );
}

// Блокировки входа: 10 неверных паролей подряд закрывают вход с адреса на сутки, потом на неделю, потом на месяц.
const banSteps = ['сутки', 'неделю', 'месяц'];
function LoginBans() {
  const [rows, setRows] = useState<any[] | null>(null);
  const load = () =>
    api('admin/roles/bans')
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch(() => setRows([]));
  useEffect(() => {
    load();
  }, []);
  const unban = async (key: string) => {
    try {
      await api('admin/roles/bans', { key });
      toast.success('Блокировка снята');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const now = Date.now();
  const active = (rows || []).filter((r) => r.banned_until > now);
  const watch = (rows || []).filter((r) => r.banned_until <= now);
  return (
    <section className="adm-card adm-bans" aria-labelledby="adm-bans-title">
      <div className="adm-bans-head">
        <h2 id="adm-bans-title">Блокировки входа</h2>
        <p>
          После 10 неверных паролей подряд вход с этого адреса закрывается на сутки, при повторе на неделю, дальше на
          месяц. Здесь можно снять блокировку вручную, например если сотрудник забыл пароль.
        </p>
      </div>
      {rows === null ? (
        <p className="adm-muted">Загружаем…</p>
      ) : !active.length && !watch.length ? (
        <p className="adm-muted">Подозрительных попыток входа нет.</p>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th>Адрес</th>
              <th>Последняя почта</th>
              <th>Состояние</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...active, ...watch].map((r) => (
              <tr key={r.key}>
                <td>
                  <code>{String(r.key).replace(/^ip:/, '').replace(/^email:/, 'почта: ')}</code>
                </td>
                <td>{r.last_email || '—'}</td>
                <td>
                  {r.banned_until > now ? (
                    <Badge tone="bad">
                      Заблокирован до {fmtDateTime(r.banned_until)} · {r.level}-й раз
                    </Badge>
                  ) : (
                    <span className="adm-muted">
                      {r.fails ? `Ошибок подряд: ${r.fails} из 10` : 'Ошибок нет'}
                      {r.level ? ` · следующая блокировка на ${banSteps[Math.min(r.level, 2)]}` : ''}
                    </span>
                  )}
                </td>
                <td>
                  <button type="button" className="adm-btn is-small" onClick={() => unban(r.key)}>
                    {r.banned_until > now ? 'Разблокировать' : 'Сбросить'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Audit({ rows }: { rows: any[] }) {
  const [search, setSearch] = useState('');
  const list = rows.filter((r) => matches(r, search));
  return (
    <div className="adm-stack">
      <Toolbar search={search} setSearch={setSearch} placeholder="Сотрудник, действие или объект" />
      {!list.length ? (
        <Empty title="Записей нет" text="Здесь появятся изменения товаров, заказов, ролей и настроек." />
      ) : (
        <div className="adm-card">
          <ul className="adm-timeline is-audit">
            {list.map((r) => (
              <li key={r.id}>
                <time>{fmtDateTime(r.created)}</time>
                <span>
                  <b>{r.email}</b> · {r.action} · <code>{r.object}</code>
                </span>
                {r.details && r.details !== 'null' && (
                  <details>
                    <summary>Подробности</summary>
                    <pre>{(() => {
                      try {
                        return JSON.stringify(JSON.parse(r.details), null, 2);
                      } catch {
                        return r.details;
                      }
                    })()}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Рассылки ─────────────────────────

function Campaigns({ rows, save }: { rows: any[]; save: (b: any, a?: Area) => Promise<boolean> }) {
  const [editing, setEditing] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  return (
    <div className="adm-stack">
      <div className="adm-toolbar">
        <p className="adm-note">Письма уходят только подписчикам с действующим согласием, в каждом есть ссылка «Отписаться».</p>
        <button className="adm-btn is-primary" onClick={() => setEditing({ subject: '', body: '', segment: 'all' })}>
          <Plus /> Новое письмо
        </button>
      </div>
      {!rows.length ? (
        <Empty title="Писем пока нет" text="Создайте черновик — посмотрите, сколько получателей в выбранной аудитории." />
      ) : (
        <div className="adm-cards">
          {rows.map((c) => (
            <div key={c.id} className="adm-req is-static">
              <div className="adm-req-top">
                <Badge tone={c.status === 'Отправлено' ? 'good' : 'muted'}>{c.status}</Badge>
                <time>{c.created ? fmtDateTime(c.created) : ''}</time>
              </div>
              <b>{c.data.subject}</b>
              <p>{c.data.body}</p>
              <div className="adm-req-foot">
                <small>{segmentLabels[c.data.segment] || c.data.segment}</small>
                <button
                  className="adm-btn is-ghost is-small"
                  onClick={async () => {
                    try {
                      setPreview(await api('admin/campaigns/preview?id=' + c.id));
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Eye /> Предпросмотр
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Drawer open={!!editing} onClose={() => setEditing(null)} title="Новое письмо" subtitle="Сохраняется черновиком">
        {editing && (
          <CampaignEditor
            initial={editing}
            onSave={async (b) => {
              if (await save(b, 'campaigns')) setEditing(null);
            }}
          />
        )}
      </Drawer>
      <Drawer open={!!preview} onClose={() => setPreview(null)} title={preview?.subject || 'Письмо'} subtitle={preview ? 'Получателей: ' + preview.audience : ''}>
        {preview && (
          <div className="adm-form">
            <div className="adm-mail">
              <div className="adm-mail-head">hauteline.</div>
              <h3>{preview.subject}</h3>
              <p>{preview.body}</p>
              <small>Вы получили письмо, потому что подписались на новости Hauteline. Отписаться</small>
            </div>
            <p className="adm-note">Отправка включится после подключения почтового сервиса.</p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
function CampaignEditor({ initial, onSave }: { initial: any; onSave: (b: any) => void }) {
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [segment, setSegment] = useState(initial.segment);
  return (
    <form
      className="adm-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ subject, body, segment });
      }}
    >
      <fieldset>
        <legend>Письмо</legend>
        <label className="adm-field">
          <span>Тема</span>
          <input required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Новые поступления: Moncler и Balenciaga" />
        </label>
        <label className="adm-field">
          <span>Текст</span>
          <textarea required rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
      </fieldset>
      <fieldset>
        <legend>Кому</legend>
        <div className="adm-seg is-wrap">
          {Object.entries(segmentLabels).map(([k, v]) => (
            <button key={k} type="button" className={segment === k ? 'is-active' : ''} onClick={() => setSegment(k)}>
              {v}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="adm-form-foot">
        <button className="adm-btn is-primary">Сохранить черновик</button>
      </div>
    </form>
  );
}

// ───────────────────────── Баннеры и настройки ─────────────────────────

const defaultBanners = [
  { image: '/figma/init0/27831.png', href: '/sale', title: 'Твой темп' },
  { image: '/figma/init0/18970.png', href: '/catalog', title: 'Новая классика' },
  { image: '/figma/init0/fc6ee.png', href: '/brands?view=new', title: 'Городской ритм' },
];
function Banners({ rows, save }: { rows: any; save: (b: any, a?: Area) => Promise<boolean> }) {
  const [banners, setBanners] = useState<any[]>(rows.banners?.length === 3 ? rows.banners : defaultBanners);
  const [seconds, setSeconds] = useState<number>(rows.bannerSeconds || 12);
  const [busy, setBusy] = useState(-1);
  const set = (i: number, k: string, v: string) => setBanners(banners.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  const names = ['Левый', 'Центральный', 'Правый'];
  return (
    <form
      className="adm-stack"
      onSubmit={(e) => {
        e.preventDefault();
        save({ banners, bannerSeconds: seconds }, 'banners');
      }}
    >
      <div className="adm-banners">
        {banners.map((b, i) => (
          <section className="adm-card" key={i}>
            <div className="adm-card-head">
              <h2>{names[i]} баннер</h2>
            </div>
            <label className="adm-banner-preview">
              <img src={b.image} alt={b.title} />
              <span>
                <Upload /> {busy === i ? 'Загружаем…' : 'Заменить картинку'}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(i);
                  try {
                    set(i, 'image', (await fileToUpload(file)).url);
                    toast.success('Картинка загружена — не забудьте сохранить');
                  } catch (err) {
                    toast.error((err as Error).message);
                  } finally {
                    setBusy(-1);
                  }
                }}
              />
            </label>
            <label className="adm-field">
              <span>Подпись (для незрячих и поиска)</span>
              <input value={b.title} onChange={(e) => set(i, 'title', e.target.value)} />
            </label>
            <label className="adm-field">
              <span>Куда ведёт</span>
              <input value={b.href} onChange={(e) => set(i, 'href', e.target.value)} placeholder="/catalog" />
            </label>
          </section>
        ))}
      </div>
      <section className="adm-card adm-inline-form">
        <label className="adm-field">
          <span>Смена центрального баннера, секунд</span>
          <input type="number" min="8" max="120" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
        </label>
        <button className="adm-btn is-primary">Сохранить баннеры</button>
      </section>
    </form>
  );
}

async function exportConsents() {
  try {
    const rows: { subject: string; kind: string; granted: number; doc: string; source: string; ip: string; created: number }[] =
      await api('admin/settings/consents');
    const kinds: Record<string, string> = {
      pd: 'Обработка персональных данных',
      marketing: 'Реклама и рассылки',
      cookies: 'Файлы cookie',
      recommendations: 'Персональные рекомендации',
    };
    const sources: Record<string, string> = {
      register: 'Регистрация',
      checkout: 'Оформление заказа',
      request: 'Заявка на поиск',
      newsletter: 'Подписка в подвале',
      profile: 'Личный кабинет',
      banner: 'Плашка cookie',
      'account-delete': 'Удаление аккаунта',
    };
    const bytes = buildXlsx([
      {
        name: 'Согласия',
        columns: [
          { title: 'Дата', width: 18 },
          { title: 'Кто', width: 32 },
          { title: 'Согласие', width: 30 },
          { title: 'Решение', width: 12 },
          { title: 'Где', width: 22 },
          { title: 'Редакция документа', width: 18 },
          { title: 'IP', width: 16 },
        ],
        rows: rows.map((r) => [
          new Date(r.created),
          r.subject,
          kinds[r.kind] || r.kind,
          r.granted ? 'дано' : 'отозвано',
          sources[r.source] || r.source,
          r.doc,
          r.ip,
        ]),
      },
    ]);
    await downloadBytes(bytes, 'hauteline-consents-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  } catch (e) {
    toast.error((e as Error).message);
  }
}

function SettingsForm({ rows, save }: { rows: any; save: (b: any, a?: Area) => Promise<boolean> }) {
  const [enabled, setEnabled] = useState<boolean>(!!rows.promoEnabled);
  return (
    <form
      className="adm-stack"
      onSubmit={(e) => {
        e.preventDefault();
        save({ ...Object.fromEntries(new FormData(e.currentTarget)), promoEnabled: enabled, banners: rows.banners, bannerSeconds: rows.bannerSeconds }, 'settings');
      }}
    >
      <div className="adm-grid-2">
        <section className="adm-card">
          <div className="adm-card-head">
            <h2>Контакты поддержки</h2>
            <span>Показываются в подвале и на странице «Контакты»</span>
          </div>
          <div className="adm-fields-2">
            <label className="adm-field">
              <span>Telegram менеджера</span>
              <input name="telegram" type="url" defaultValue={rows.telegram} placeholder="https://t.me/manager_ale" />
            </label>
            <label className="adm-field">
              <span>Telegram-канал</span>
              <input name="telegramChannel" type="url" defaultValue={rows.telegramChannel} placeholder="https://t.me/hauteline" />
            </label>
            <label className="adm-field">
              <span>MAX</span>
              <input name="max" type="url" defaultValue={rows.max} placeholder="https://max.ru/…" />
            </label>
            <label className="adm-field">
              <span>WhatsApp — номер</span>
              <input name="whatsapp" defaultValue={rows.whatsapp} placeholder="+7 900 000-00-00" />
            </label>
            <label className="adm-field">
              <span>Почта поддержки</span>
              <input name="email" type="email" defaultValue={rows.email} placeholder="support@…" />
            </label>
            <label className="adm-field">
              <span>TikTok</span>
              <input name="tiktok" type="url" defaultValue={rows.tiktok} placeholder="https://www.tiktok.com/@…" />
            </label>
            <label className="adm-field">
              <span>YouTube</span>
              <input name="youtube" type="url" defaultValue={rows.youtube} placeholder="https://youtube.com/…" />
            </label>
          </div>
          <label className="adm-field">
            <span>Часы поддержки</span>
            <input name="hours" defaultValue={rows.hours} placeholder="ежедневно 09:00 – 21:00 (МСК)" />
          </label>
          <input type="hidden" name="legal" defaultValue={rows.legal} />
        </section>
        <section className="adm-card">
          <div className="adm-card-head">
            <h2>Продавец и правовые данные</h2>
            <span>Обязательны на сайте по закону: подвал, оферта, политика и согласия подставляют их сами</span>
          </div>
          <div className="adm-fields-2">
            <label className="adm-field">
              <span>Продавец</span>
              <input name="sellerName" defaultValue={rows.sellerName} placeholder="ИП Иванов Иван Иванович" />
            </label>
            <label className="adm-field">
              <span>ИНН</span>
              <input name="sellerInn" inputMode="numeric" defaultValue={rows.sellerInn} placeholder="12 цифр" />
            </label>
            <label className="adm-field">
              <span>ОГРНИП / ОГРН</span>
              <input name="sellerOgrn" inputMode="numeric" defaultValue={rows.sellerOgrn} placeholder="15 цифр" />
            </label>
            <label className="adm-field">
              <span>Телефон продавца</span>
              <input name="sellerPhone" defaultValue={rows.sellerPhone} placeholder="+7 900 000-00-00" />
            </label>
          </div>
          <label className="adm-field">
            <span>Адрес (для претензий и возвратов)</span>
            <input name="sellerAddress" defaultValue={rows.sellerAddress} placeholder="123456, г. Москва, ул. …" />
          </label>
          <div className="adm-fields-2">
            <label className="adm-field">
              <span>Email для запросов по данным</span>
              <input name="legalEmail" type="email" defaultValue={rows.legalEmail} placeholder="privacy@…" />
            </label>
            <label className="adm-field">
              <span>Номер в реестре операторов ПДн</span>
              <input name="rknNumber" defaultValue={rows.rknNumber} placeholder="после уведомления Роскомнадзора" />
            </label>
          </div>
          <div className="adm-row-between">
            <small className="adm-muted">Журнал согласий: кто, когда и на какую редакцию документа согласился.</small>
            <button type="button" className="adm-btn" onClick={exportConsents}>
              Журнал согласий в Excel
            </button>
          </div>
        </section>
        <div className="adm-stack">
          <section className="adm-card">
            <div className="adm-card-head">
              <h2>Акция «вещь за 1 ₽»</h2>
              <span>Одна вещь покупателю без оплаченных заказов, доставка бесплатно</span>
            </div>
            <label className="adm-switch">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <i />
              <span>
                <b>Акция включена</b>
                <small>Акционные вещи отмечаются в карточке товара</small>
              </span>
            </label>
            <div className="adm-fields-2">
              <label className="adm-field">
                <span>Начало</span>
                <input name="promoStart" type="datetime-local" defaultValue={rows.promoStart} />
              </label>
              <label className="adm-field">
                <span>Окончание</span>
                <input name="promoEnd" type="datetime-local" defaultValue={rows.promoEnd} />
              </label>
            </div>
            <label className="adm-field">
              <span>Лимит участников</span>
              <input name="promoLimit" type="number" min="1" defaultValue={rows.promoLimit} />
            </label>
          </section>
          <section className="adm-card">
            <div className="adm-card-head">
              <h2>Подключения</h2>
            </div>
            <ul className="adm-integrations">
              {['Приём оплаты', 'СДЭК', 'Яндекс Доставка', 'Отправка писем', 'Яндекс ID и VK ID', 'Вход по коду из СМС'].map((s) => (
                <li key={s}>
                  <span>{s}</span>
                  <Badge tone="warn">Ждёт доступов</Badge>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      <div className="adm-sticky-save">
        <button className="adm-btn is-primary">Сохранить настройки</button>
      </div>
    </form>
  );
}
