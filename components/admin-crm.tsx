'use client';
// CRM в панели команды: клиенты с сегментами и карточкой, воронка заявок.
import { useEffect, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import {
  Mail,
  Phone,
  MessageCircle,
  Plus,
  Trash2,
  ExternalLink,
  LayoutGrid,
  List,
} from 'lucide-react';
import { rub, stages } from '@/lib/catalog';
import { api } from '@/lib/client-api';
import { crmSegments, noteKinds, type CrmContact, type CrmSegment, type NoteKind } from '@/lib/crm';
import { Badge, Chips, Drawer, Empty, Toolbar, fmtDate, fmtDateTime, matches, plural } from './admin-ui';

type Staff = { id: string; name: string; email: string; role: string };
const DAY = 86_400_000;

export const segmentTone: Record<CrmSegment, string> = {
  lead: 'muted',
  new: 'accent',
  repeat: 'good',
  vip: 'vip',
  sleeping: 'warn',
};
const segmentShort: Record<CrmSegment, string> = {
  lead: 'Лид',
  new: 'Новый',
  repeat: 'Постоянный',
  vip: 'VIP',
  sleeping: 'Спящий',
};

const startOfDay = (t = Date.now()) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
export function ago(t: number) {
  const days = Math.floor((startOfDay() - startOfDay(t)) / DAY);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days < 30) return days + ' ' + plural(days, 'день', 'дня', 'дней') + ' назад';
  return fmtDate(t);
}
const initial = (c: { name: string; email: string }) =>
  (c.name.replace(/^Пример:\s*/, '') || c.email).slice(0, 1).toUpperCase();
const staffName = (staff: Staff[], id: string | null) => {
  const s = staff.find((x) => x.id === id);
  return s ? s.name || s.email : '';
};
function messengerHref(messenger: string, contact: string) {
  if (!contact) return '';
  if (messenger === 'WhatsApp') return 'https://wa.me/' + contact.replace(/\D/g, '');
  if (messenger === 'Telegram')
    return 'https://t.me/' + contact.replace(/^@|^https:\/\/t\.me\//g, '').replace(/[^\w]/g, '');
  return '';
}

// ───────────────────────── Клиенты ─────────────────────────

export function CrmClients({
  rows,
  me,
  refresh,
  focus,
  clearFocus,
  goTo,
}: {
  rows: { contacts: CrmContact[]; staff: Staff[] };
  me: any;
  refresh: () => void;
  focus?: string | null;
  clearFocus?: () => void;
  goTo?: (area: 'orders' | 'requests', id: string) => void;
}) {
  const contacts = rows.contacts || [];
  const staff = rows.staff || [];
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<'all' | 'mine' | CrmSegment>('all');
  const [sort, setSort] = useState<'activity' | 'spent' | 'orders'>('activity');
  const [openEmail, setOpenEmail] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (focus) {
      setOpenEmail(focus);
      clearFocus?.();
    }
  }, [focus]);
  const inSegment = (c: CrmContact, s: typeof segment) =>
    s === 'all' ? true : s === 'mine' ? c.manager === me?.id : c.segment === s;
  const list = contacts
    .filter((c) => inSegment(c, segment) && matches({ n: c.name, e: c.email, p: c.phone, c: c.contact, t: c.tags }, search))
    .sort((a, b) =>
      sort === 'spent' ? b.spent - a.spent : sort === 'orders' ? b.paid - a.paid : b.lastActivity - a.lastActivity,
    );
  const buyers = contacts.filter((c) => c.paid > 0);
  const revenue = buyers.reduce((s, c) => s + c.spent, 0);
  const subscribed = contacts.filter((c) => c.marketing).length;
  return (
    <div className="adm-stack">
      <div className="crm-kpis">
        <div className="adm-kpi">
          <span>Контактов</span>
          <strong>{contacts.length}</strong>
          <small>
            {(() => {
              const leads = contacts.filter((c) => c.segment === 'lead').length;
              return (
                leads +
                ' ' +
                plural(leads, 'лид', 'лида', 'лидов') +
                ' · ' +
                buyers.length +
                ' ' +
                plural(buyers.length, 'покупатель', 'покупателя', 'покупателей')
              );
            })()}
          </small>
        </div>
        <div className="adm-kpi">
          <span>Выручка с клиентов</span>
          <strong>{rub(revenue)}</strong>
          <small>средний чек {rub(buyers.length ? Math.round(revenue / Math.max(1, buyers.reduce((s, c) => s + c.paid, 0))) : 0)}</small>
        </div>
        <div className="adm-kpi">
          <span>Повторные покупки</span>
          <strong>{buyers.length ? Math.round((buyers.filter((c) => c.paid > 1).length / buyers.length) * 100) : 0}%</strong>
          <small>купили больше одного раза</small>
        </div>
        <div className="adm-kpi">
          <span>Согласны на рассылку</span>
          <strong>{subscribed}</strong>
          <small>только им можно писать о скидках</small>
        </div>
      </div>
      <Toolbar search={search} setSearch={setSearch} placeholder="Имя, email, телефон, тег">
        <label className="crm-sort">
          <span>Сортировка</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="activity">По активности</option>
            <option value="spent">По сумме покупок</option>
            <option value="orders">По числу заказов</option>
          </select>
        </label>
      </Toolbar>
      <Chips
        value={segment}
        onChange={setSegment}
        items={[
          { value: 'all', label: 'Все', count: contacts.length },
          ...crmSegments.map((s) => ({ value: s.id, label: s.label, count: contacts.filter((c) => c.segment === s.id).length })),
          { value: 'mine', label: 'Мои', count: contacts.filter((c) => c.manager === me?.id).length },
        ]}
      />
      {!list.length ? (
        <Empty
          title={contacts.length ? 'Никого не нашли' : 'Клиентов пока нет'}
          text={
            contacts.length
              ? crmSegments.find((s) => s.id === segment)?.hint
              : 'Клиенты появятся после регистрации, заказа или заявки на поиск.'
          }
        />
      ) : (
        <div className="adm-card is-flush">
          <table className="adm-table crm-table">
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Сегмент</th>
                <th className="num">Заказы</th>
                <th className="num">Сумма</th>
                <th>Активность</th>
                <th>Ответственный</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.email} className="is-clickable" onClick={() => setOpenEmail(c.email)}>
                  <td>
                    <div className="adm-person">
                      <div className={'adm-avatar is-soft crm-avatar is-' + c.segment}>
                        {initial(c)}
                      </div>
                      <div>
                        <b>{c.name || 'Без имени'}</b>
                        <small>{c.email}</small>
                        {!!c.tags.length && (
                          <span className="crm-tags is-inline">
                            {c.tags.slice(0, 3).map((t) => (
                              <i key={t}>{t}</i>
                            ))}
                            {c.tags.length > 3 && <i>+{c.tags.length - 3}</i>}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge tone={segmentTone[c.segment]}>{segmentShort[c.segment]}</Badge>
                  </td>
                  <td className="num">
                    {c.paid}
                    {c.orders > c.paid && <small>всего {c.orders}</small>}
                  </td>
                  <td className="num">
                    <b>{c.spent ? rub(c.spent) : '—'}</b>
                  </td>
                  <td>
                    {ago(c.lastActivity)}
                    {c.openRequests > 0 && (
                      <small>{c.openRequests + ' ' + plural(c.openRequests, 'заявка', 'заявки', 'заявок') + ' в работе'}</small>
                    )}
                  </td>
                  <td>{staffName(staff, c.manager) || <span className="adm-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Drawer
        wide
        open={!!openEmail}
        onClose={() => setOpenEmail(null)}
        title={contacts.find((c) => c.email === openEmail)?.name || openEmail || ''}
        subtitle={openEmail || ''}
      >
        {openEmail && (
          <ClientCard
            key={openEmail}
            email={openEmail}
            version={version}
            me={me}
            onChanged={() => {
              setVersion((v) => v + 1);
              refresh();
            }}
            goTo={(a, id) => {
              setOpenEmail(null);
              goTo?.(a, id);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

// ───────────────────────── Карточка клиента ─────────────────────────

type Detail = {
  contact: CrmContact;
  orders: any[];
  requests: any[];
  notes: { id: string; kind: NoteKind; body: string; author: string; created: number }[];
  timeline: { at: number; kind: string; title: string; text?: string; ref?: string }[];
  staff: Staff[];
};
const tagIdeas = ['Обувь', 'Сумки', 'Верхняя одежда', 'Под заказ', 'Блогер', 'Опт', 'Подарок', 'Торгуется'];

function ClientCard({
  email,
  version,
  me,
  onChanged,
  goTo,
}: {
  email: string;
  version: number;
  me: any;
  onChanged: () => void;
  goTo: (area: 'orders' | 'requests', id: string) => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [failed, setFailed] = useState('');
  const [tab, setTab] = useState<'feed' | 'orders' | 'requests'>('feed');
  useEffect(() => {
    let cancelled = false;
    api('admin/clients/' + encodeURIComponent(email))
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setFailed((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [email, version]);
  if (failed) return <div className="adm-error">{failed}</div>;
  if (!data)
    return (
      <div className="adm-skeleton">
        <div />
        <div />
      </div>
    );
  const c = data.contact;
  const href = messengerHref(c.messenger, c.contact);
  async function call(path: string, body: any, ok = 'Сохранено') {
    try {
      await api('admin/' + path, body);
      toast.success(ok);
      onChanged();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }
  return (
    <div className="crm-card">
      <section className="crm-head">
        <div className={'crm-avatar-lg is-' + c.segment}>{initial(c)}</div>
        <div className="crm-head-main">
          <div className="adm-badges">
            <Badge tone={segmentTone[c.segment]}>{segmentShort[c.segment]}</Badge>
            {c.userId ? <Badge tone="muted">Есть аккаунт</Badge> : <Badge tone="muted">Без аккаунта</Badge>}
            {c.marketing && <Badge tone="good">Подписан на рассылку</Badge>}
          </div>
          <p>
            С нами с {fmtDate(c.firstSeen)} · последняя активность {ago(c.lastActivity)}
          </p>
          <div className="crm-actions">
            <a className="adm-btn is-ghost is-small" href={'mailto:' + c.email}>
              <Mail /> Письмо
            </a>
            {c.phone && (
              <a className="adm-btn is-ghost is-small" href={'tel:' + c.phone.replace(/[^\d+]/g, '')}>
                <Phone /> {c.phone}
              </a>
            )}
            {href && (
              <a className="adm-btn is-ghost is-small" href={href} target="_blank" rel="noreferrer">
                <MessageCircle /> {c.messenger}
              </a>
            )}
          </div>
        </div>
      </section>
      <div className="crm-mini-kpis">
        <div>
          <span>Оплачено заказов</span>
          <b>{c.paid}</b>
        </div>
        <div>
          <span>Сумма покупок</span>
          <b>{c.spent ? rub(c.spent) : '—'}</b>
        </div>
        <div>
          <span>Средний чек</span>
          <b>{c.avgCheck ? rub(c.avgCheck) : '—'}</b>
        </div>
        <div>
          <span>Последняя покупка</span>
          <b>{c.lastPaidAt ? ago(c.lastPaidAt) : '—'}</b>
        </div>
      </div>
      <ProfileEditor
        key={JSON.stringify([c.manager, c.tags])}
        contact={c}
        staff={data.staff}
        onSave={(b) => call('clients/profile', { email: c.email, ...b })}
      />
      <div className="adm-seg crm-tabs" role="tablist">
        {(
          [
            ['feed', 'Лента', data.timeline.length],
            ['orders', 'Заказы', data.orders.length],
            ['requests', 'Заявки', data.requests.length],
          ] as const
        ).map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
            {label}
            {!!n && <em>{n}</em>}
          </button>
        ))}
      </div>
      {tab === 'feed' && (
        <>
          <NoteComposer onAdd={(kind, body) => call('clients/note', { email: c.email, kind, body }, 'Запись добавлена')} />
          <ul className="crm-feed">
            {data.timeline.map((t, i) => {
              const note = t.kind.startsWith('note-') ? data.notes.find((n) => n.id === t.ref) : null;
              const canDelete = note && (note.author === me?.id || me?.role === 'owner');
              return (
                <li key={i} className={'is-' + t.kind}>
                  <div className="crm-feed-head">
                    <b>{t.title}</b>
                    <time>{fmtDateTime(t.at)}</time>
                    {note && (
                      <small className="adm-muted">
                        {staffName(data.staff, note.author) || 'Сотрудник'}
                      </small>
                    )}
                    {canDelete && (
                      <button
                        className="crm-icon"
                        aria-label="Удалить запись"
                        onClick={() => call('clients/note-delete', { id: note!.id }, 'Запись удалена')}
                      >
                        <Trash2 />
                      </button>
                    )}
                  </div>
                  {t.text && <p>{t.text}</p>}
                  {t.ref && ['order', 'paid', 'request'].includes(t.kind) && (
                    <button className="crm-link" onClick={() => goTo(t.kind === 'request' ? 'requests' : 'orders', t.ref!)}>
                      Открыть {t.kind === 'request' ? 'заявку' : 'заказ'} <ExternalLink />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {tab === 'orders' &&
        (data.orders.length ? (
          <div className="crm-list">
            {data.orders.map((o) => (
              <button key={o.id} className="crm-row" onClick={() => goTo('orders', o.id)}>
                <div>
                  <b className="mono">{o.id}</b>
                  <small>
                    {fmtDate(o.created)} · {o.items.map((l: any) => l.name + ' · ' + l.size).join(', ')}
                  </small>
                </div>
                <div className="crm-row-end">
                  <b>{rub(o.total)}</b>
                  <Badge tone={o.payment === 'paid' ? 'good' : o.payment === 'pending' ? 'warn' : 'muted'}>
                    {o.payment === 'paid' ? stages[o.stage] || o.status : o.status}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Empty title="Заказов пока нет" text="Когда клиент оформит заказ, он появится здесь." />
        ))}
      {tab === 'requests' &&
        (data.requests.length ? (
          <div className="crm-list">
            {data.requests.map((r) => (
              <button key={r.id} className="crm-row" onClick={() => goTo('requests', r.id)}>
                <div>
                  <b>{r.description || 'Без описания'}</b>
                  <small>
                    {fmtDate(r.created)}
                    {r.budget && ' · бюджет ' + r.budget}
                    {r.comment && ' · ' + r.comment}
                  </small>
                </div>
                <Badge tone={requestTone[r.status] || 'muted'}>{r.status}</Badge>
              </button>
            ))}
          </div>
        ) : (
          <Empty title="Заявок нет" text="Заявки на поиск вещей из формы на главной." />
        ))}
    </div>
  );
}

function ProfileEditor({
  contact,
  staff,
  onSave,
}: {
  contact: CrmContact;
  staff: Staff[];
  onSave: (b: { manager: string | null; tags: string[] }) => void;
}) {
  const [manager, setManager] = useState(contact.manager || '');
  const [tags, setTags] = useState<string[]>(contact.tags);
  const [draft, setDraft] = useState('');
  const dirty = manager !== (contact.manager || '') || JSON.stringify(tags) !== JSON.stringify(contact.tags);
  const add = (t: string) => {
    const tag = t.trim().replace(/,$/, '');
    if (tag && !tags.some((x) => x.toLowerCase() === tag.toLowerCase()) && tags.length < 12) setTags([...tags, tag.slice(0, 30)]);
    setDraft('');
  };
  return (
    <section className="crm-profile">
      <label className="adm-field">
        <span>Ответственный</span>
        <select value={manager} onChange={(e) => setManager(e.target.value)}>
          <option value="">Не назначен</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || s.email}
            </option>
          ))}
        </select>
      </label>
      <div className="adm-field">
        <span>Теги</span>
        <div className="crm-tag-input">
          {tags.map((t) => (
            <span key={t} className="crm-tag">
              {t}
              <button type="button" aria-label={'Убрать тег ' + t} onClick={() => setTags(tags.filter((x) => x !== t))}>
                ×
              </button>
            </span>
          ))}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                add(draft);
              } else if (e.key === 'Backspace' && !draft && tags.length) setTags(tags.slice(0, -1));
            }}
            onBlur={() => draft && add(draft)}
            placeholder={tags.length ? 'Ещё тег' : 'Например: Обувь, 43 размер'}
            aria-label="Новый тег"
          />
        </div>
        <div className="crm-tag-ideas">
          {tagIdeas
            .filter((t) => !tags.includes(t))
            .slice(0, 6)
            .map((t) => (
              <button key={t} type="button" onClick={() => add(t)}>
                + {t}
              </button>
            ))}
        </div>
      </div>
      {dirty && (
        <div className="crm-profile-save">
          <button className="adm-btn is-primary is-small" onClick={() => onSave({ manager: manager || null, tags })}>
            Сохранить карточку
          </button>
          <button
            className="adm-btn is-ghost is-small"
            onClick={() => {
              setManager(contact.manager || '');
              setTags(contact.tags);
            }}
          >
            Отменить
          </button>
        </div>
      )}
    </section>
  );
}

function NoteComposer({ onAdd }: { onAdd: (kind: NoteKind, body: string) => Promise<boolean> }) {
  const [kind, setKind] = useState<NoteKind>('note');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const placeholders: Record<NoteKind, string> = {
    note: 'Например: носит 43, любит New Balance, бюджет до 40 000 ₽',
    call: 'О чём договорились по телефону',
    message: 'Итог переписки в Telegram или WhatsApp',
    meeting: 'Встреча, примерка, передача заказа',
  };
  return (
    <form
      className="crm-composer"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        if (await onAdd(kind, body)) setBody('');
        setBusy(false);
      }}
    >
      <div className="adm-seg">
        {noteKinds.map((k) => (
          <button key={k.id} type="button" className={kind === k.id ? 'is-active' : ''} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholders[kind]} aria-label="Текст записи" />
      <div className="crm-composer-foot">
        <small className="adm-muted">Запись видят все, у кого есть доступ к клиентам</small>
        <button className="adm-btn is-primary is-small" disabled={busy || !body.trim()}>
          <Plus /> Добавить
        </button>
      </div>
    </form>
  );
}

// ───────────────────────── Задачи ─────────────────────────

export const requestFlow = ['Новая', 'В работе', 'Согласовано', 'Закрыта', 'Отказ'];
export const requestTone: Record<string, string> = {
  Новая: 'accent',
  'В работе': 'warn',
  Согласовано: 'good',
  Закрыта: 'muted',
  Отказ: 'bad',
};
const flowHint: Record<string, string> = {
  Новая: 'Ещё не связались',
  'В работе': 'Ищем вещь',
  Согласовано: 'Клиент согласен на вариант',
  Закрыта: 'Выкупили и передали',
  Отказ: 'Не подошло или передумал',
};

export function RequestBoard({
  rows,
  onMove,
  onOpen,
}: {
  rows: any[];
  onMove: (r: any, status: string) => void;
  onOpen: (id: string) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  return (
    <div className="crm-board" role="list">
      {requestFlow.map((status) => {
        const items = rows.filter((r) => r.status === status);
        return (
          <section
            key={status}
            className={'crm-col' + (over === status ? ' is-over' : '')}
            onDragOver={(e: DragEvent) => {
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={() => setOver((s) => (s === status ? null : s))}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setOver(null);
              const r = rows.find((x) => x.id === (dragId || e.dataTransfer.getData('text/plain')));
              if (r && r.status !== status) onMove(r, status);
              setDragId(null);
            }}
          >
            <header>
              <Badge tone={requestTone[status]}>{status}</Badge>
              <em>{items.length}</em>
              <small>{flowHint[status]}</small>
            </header>
            <div className="crm-col-body">
              {items.map((r) => (
                <button
                  key={r.id}
                  className={'crm-deal' + (dragId === r.id ? ' is-dragging' : '')}
                  draggable
                  onDragStart={(e) => {
                    setDragId(r.id);
                    e.dataTransfer.setData('text/plain', r.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                  onClick={() => onOpen(r.id)}
                >
                  <b>{r.data.name}</b>
                  <p>{r.data.description || 'Без описания — уточнить'}</p>
                  <small>
                    {r.data.budget ? r.data.budget + ' · ' : ''}
                    {ago(r.created)}
                  </small>
                </button>
              ))}
              {!items.length && <div className="crm-col-empty">Перетащите сюда заявку</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ViewToggle({ value, onChange }: { value: 'board' | 'list'; onChange: (v: 'board' | 'list') => void }) {
  return (
    <div className="adm-seg crm-view" role="tablist" aria-label="Вид">
      <button className={value === 'board' ? 'is-active' : ''} onClick={() => onChange('board')} aria-selected={value === 'board'}>
        <LayoutGrid /> Воронка
      </button>
      <button className={value === 'list' ? 'is-active' : ''} onClick={() => onChange('list')} aria-selected={value === 'list'}>
        <List /> Список
      </button>
    </div>
  );
}
