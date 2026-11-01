'use client';
// Панель: автоматические акции (N по цене M, комплект, скидка от суммы, бесплатная доставка от суммы) и промокоды.
import { useMemo, useState } from 'react';
import { Plus, Trash2, Percent, Gift, Truck, Layers, Ticket, Shuffle } from 'lucide-react';
import { departments, rub } from '@/lib/catalog';
import { moscowDay, promotionBadge, type PromoCode, type Promotion, type PromotionType } from '@/lib/pricing';
import { Badge, Drawer, Empty, fmtDate, matches } from './admin-ui';

type Prod = { id: string; name: string; brand: string; price: number; category?: string };
type Rows = { promotions: Promotion[]; promoCodes: PromoCode[]; usage: Record<string, number>; products: Prod[] };

const typeMeta: Record<PromotionType, { title: string; hint: string; icon: React.ReactNode; example: string }> = {
  bundle: {
    title: 'N по цене M',
    hint: 'Например, 2 по цене 1 или 3 по цене 2: самые дешёвые вещи в наборе — бесплатно',
    icon: <Layers />,
    example: '2 по цене 1 на кроссовки',
  },
  set: {
    title: 'Комплект',
    hint: 'Например, «костюм по цене брюк»: купили брюки — пиджак к ним бесплатно или со скидкой',
    icon: <Gift />,
    example: 'Костюм по цене брюк',
  },
  threshold: {
    title: 'Скидка от суммы заказа',
    hint: 'Например, −10% от 50 000 ₽ или −5 000 ₽ от 80 000 ₽',
    icon: <Percent />,
    example: '−10% от 50 000 ₽',
  },
  shipping: {
    title: 'Бесплатная доставка от суммы',
    hint: 'Например, доставка 0 ₽ при заказе от 30 000 ₽',
    icon: <Truck />,
    example: 'Бесплатная доставка от 30 000 ₽',
  },
};
const blank = (type: PromotionType): Promotion => ({
  id: 'p' + Math.random().toString(36).slice(2, 9),
  type,
  title: '',
  active: true,
  start: '',
  end: '',
  ...(type === 'bundle' ? { buy: 2, pay: 1, scope: { kind: 'all', values: [] } } : {}),
  ...(type === 'set' ? { main: [], extra: [], extraPercent: 100 } : {}),
  ...(type === 'threshold' ? { minTotal: 50000, percent: 10, amount: 0 } : {}),
  ...(type === 'shipping' ? { minTotal: 30000 } : {}),
});
const blankCode = (): PromoCode => ({
  code: '',
  active: true,
  kind: 'percent',
  value: 10,
  minTotal: 0,
  start: '',
  end: '',
  limit: 0,
  perCustomer: true,
  note: '',
});
function status(x: { active: boolean; start: string; end: string }) {
  const today = moscowDay(Date.now());
  if (!x.active) return { label: 'Выключена', tone: 'muted' };
  if (x.start && today < x.start) return { label: 'Запланирована', tone: 'accent' };
  if (x.end && today > x.end) return { label: 'Завершена', tone: 'muted' };
  return { label: 'Действует', tone: 'good' };
}
const period = (x: { start: string; end: string }) =>
  x.start || x.end
    ? (x.start ? 'с ' + fmtDate(new Date(x.start + 'T12:00').getTime()) : '') +
      (x.end ? ' по ' + fmtDate(new Date(x.end + 'T12:00').getTime()) : '')
    : 'Без срока';

export function Promotions({ rows, save }: { rows: Rows; save: (b: any, a?: any) => Promise<boolean> }) {
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [editingCode, setEditingCode] = useState<{ code: PromoCode; index: number } | null>(null);
  const [picker, setPicker] = useState(false);
  const promotions = rows.promotions || [];
  const codes = rows.promoCodes || [];
  const products = rows.products || [];
  const persist = (next: { promotions?: Promotion[]; promoCodes?: PromoCode[] }) =>
    save({ promotions: next.promotions ?? promotions, promoCodes: next.promoCodes ?? codes }, 'promotions');
  const name = (id: string) => products.find((p) => p.id === id)?.name || id;
  function scopeText(p: Promotion) {
    if (p.type === 'bundle') {
      const s = p.scope;
      if (!s || s.kind === 'all') return 'На все вещи';
      if (s.kind === 'brand') return 'Бренды: ' + s.values.join(', ');
      if (s.kind === 'department') return 'Разделы: ' + s.values.join(', ');
      return 'Вещи: ' + s.values.map(name).join(', ');
    }
    if (p.type === 'set')
      return (
        'Покупают: ' +
        (p.main || []).map(name).join(', ') +
        ' → ' +
        (p.extraPercent === 100 ? 'бесплатно: ' : `−${p.extraPercent}%: `) +
        (p.extra || []).map(name).join(', ')
      );
    if (p.type === 'threshold') return 'Не суммируется с промокодом — применяется бóльшая скидка';
    return p.minTotal ? 'От ' + rub(p.minTotal) + ' после скидок' : 'На любой заказ';
  }
  return (
    <div className="adm-stack">
      <div className="adm-card promo-intro">
        <p>
          Акции применяются в корзине и при оформлении сами, промокод покупатель вводит при оформлении. Окончательную
          цену всегда пересчитывает сервер. Скидка от суммы и промокод не суммируются — покупатель получает бóльшую.
          Вещь за 1 ₽ в других акциях не участвует; сама акция «1 ₽» настраивается в «Настройках».
        </p>
      </div>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2>Автоматические акции</h2>
          <button className="adm-btn is-primary is-small" onClick={() => setPicker(true)}>
            <Plus /> Новая акция
          </button>
        </div>
        {!promotions.length ? (
          <Empty
            title="Акций пока нет"
            text="2 по цене 1, костюм по цене брюк, скидка от суммы или бесплатная доставка от суммы."
          />
        ) : (
          <div className="promo-list">
            {promotions.map((p, i) => {
              const st = status(p);
              return (
                <div key={p.id} className="promo-item" role="button" tabIndex={0} onClick={() => setEditing(p)} onKeyDown={(e) => e.key === 'Enter' && setEditing(p)}>
                  <div className="promo-item-icon">{typeMeta[p.type].icon}</div>
                  <div className="promo-item-main">
                    <b>{p.title || promotionBadge(p)}</b>
                    <small>
                      {typeMeta[p.type].title} · {promotionBadge(p)} · {period(p)}
                    </small>
                    <small className="promo-scope">{scopeText(p)}</small>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <label className="adm-switch is-inline" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={p.active}
                      aria-label={p.active ? 'Выключить акцию' : 'Включить акцию'}
                      onChange={(e) => persist({ promotions: promotions.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)) })}
                    />
                    <i />
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="adm-card is-flush promo-codes">
        <div className="adm-card-head">
          <h2>Промокоды</h2>
          <button className="adm-btn is-primary is-small" onClick={() => setEditingCode({ code: blankCode(), index: -1 })}>
            <Ticket /> Новый промокод
          </button>
        </div>
        {!codes.length ? (
          <Empty title="Промокодов пока нет" text="Скидка в процентах, на сумму или бесплатная доставка — с лимитом и сроком." />
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>Код</th>
                <th>Скидка</th>
                <th>Условия</th>
                <th>Срок</th>
                <th className="num">Использован</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c, i) => {
                const st = status(c);
                const used = rows.usage?.[c.code] || 0;
                return (
                  <tr key={c.code} className="is-clickable" onClick={() => setEditingCode({ code: c, index: i })}>
                    <td>
                      <b className="mono">{c.code}</b>
                      {c.note && <small>{c.note}</small>}
                    </td>
                    <td>{c.kind === 'percent' ? `−${c.value}%` : c.kind === 'fixed' ? '−' + rub(c.value) : 'Доставка 0 ₽'}</td>
                    <td>
                      {c.minTotal ? 'от ' + rub(c.minTotal) : 'на любой заказ'}
                      <small>{c.perCustomer ? 'один раз на покупателя' : 'можно повторно'}</small>
                    </td>
                    <td>{period(c)}</td>
                    <td className="num">
                      {used}
                      {c.limit ? ' / ' + c.limit : ''}
                    </td>
                    <td>
                      <Badge tone={c.limit && used >= c.limit ? 'muted' : st.tone}>
                        {c.limit && used >= c.limit ? 'Закончился' : st.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <Drawer open={picker} onClose={() => setPicker(false)} title="Новая акция" subtitle="Выберите механику">
        <div className="promo-types">
          {(Object.keys(typeMeta) as PromotionType[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setPicker(false);
                setEditing(blank(t));
              }}
            >
              <span className="promo-item-icon">{typeMeta[t].icon}</span>
              <span>
                <b>{typeMeta[t].title}</b>
                <small>{typeMeta[t].hint}</small>
              </span>
            </button>
          ))}
        </div>
      </Drawer>
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? typeMeta[editing.type].title : ''}
        subtitle={editing ? typeMeta[editing.type].hint : ''}
      >
        {editing && (
          <PromotionEditor
            key={editing.id}
            initial={editing}
            products={products}
            isNew={!promotions.some((p) => p.id === editing.id)}
            onSave={async (p) => {
              const exists = promotions.some((x) => x.id === p.id);
              const next = exists ? promotions.map((x) => (x.id === p.id ? p : x)) : [...promotions, p];
              if (await persist({ promotions: next })) setEditing(null);
            }}
            onDelete={async () => {
              if (await persist({ promotions: promotions.filter((x) => x.id !== editing.id) })) setEditing(null);
            }}
          />
        )}
      </Drawer>
      <Drawer
        open={!!editingCode}
        onClose={() => setEditingCode(null)}
        title={editingCode?.index === -1 ? 'Новый промокод' : 'Промокод ' + (editingCode?.code.code || '')}
        subtitle="Покупатель вводит его при оформлении заказа"
      >
        {editingCode && (
          <CodeEditor
            key={editingCode.index + editingCode.code.code}
            initial={editingCode.code}
            used={rows.usage?.[editingCode.code.code] || 0}
            isNew={editingCode.index === -1}
            onSave={async (c) => {
              const next =
                editingCode.index === -1 ? [...codes, c] : codes.map((x, j) => (j === editingCode.index ? c : x));
              if (await persist({ promoCodes: next })) setEditingCode(null);
            }}
            onDelete={async () => {
              if (await persist({ promoCodes: codes.filter((_, j) => j !== editingCode.index) })) setEditingCode(null);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

function Dates({ value, onChange }: { value: { start: string; end: string }; onChange: (v: { start: string; end: string }) => void }) {
  return (
    <div className="adm-fields-2">
      <label className="adm-field">
        <span>Начало (по Москве)</span>
        <input type="date" value={value.start} onChange={(e) => onChange({ ...value, start: e.target.value })} />
      </label>
      <label className="adm-field">
        <span>Окончание включительно</span>
        <input type="date" value={value.end} onChange={(e) => onChange({ ...value, end: e.target.value })} />
      </label>
    </div>
  );
}
function ProductPicker({
  products,
  value,
  onChange,
  label,
}: {
  products: Prod[];
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
}) {
  const [q, setQ] = useState('');
  const list = products.filter((p) => matches({ n: p.name, b: p.brand, c: p.category, id: p.id }, q));
  return (
    <div className="adm-field">
      <span>
        {label} {value.length > 0 && <em className="promo-count">выбрано {value.length}</em>}
      </span>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти вещь: название, бренд, артикул" />
      <div className="promo-picker">
        {list.map((p) => (
          <label key={p.id} className={value.includes(p.id) ? 'is-on' : ''}>
            <input
              type="checkbox"
              checked={value.includes(p.id)}
              onChange={(e) => onChange(e.target.checked ? [...value, p.id] : value.filter((x) => x !== p.id))}
            />
            <span>
              <b>{p.name}</b>
              <small>
                {p.brand} · {rub(p.price)} · {p.id}
              </small>
            </span>
          </label>
        ))}
        {!list.length && <p className="adm-muted">Ничего не нашли</p>}
      </div>
    </div>
  );
}
function Chooser({ items, value, onChange }: { items: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="promo-chooser">
      {items.map((x) => (
        <button
          type="button"
          key={x}
          className={value.includes(x) ? 'is-on' : ''}
          onClick={() => onChange(value.includes(x) ? value.filter((v) => v !== x) : [...value, x])}
        >
          {x}
        </button>
      ))}
    </div>
  );
}

function PromotionEditor({
  initial,
  products,
  isNew,
  onSave,
  onDelete,
}: {
  initial: Promotion;
  products: Prod[];
  isNew: boolean;
  onSave: (p: Promotion) => void;
  onDelete: () => void;
}) {
  const [p, setP] = useState<Promotion>(initial);
  const set = (patch: Partial<Promotion>) => setP((x) => ({ ...x, ...patch }));
  const brands = useMemo(() => [...new Set(products.map((x) => x.brand).filter(Boolean))].sort(), [products]);
  const scope = p.scope || { kind: 'all', values: [] };
  return (
    <form
      className="adm-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(p);
      }}
    >
      <fieldset>
        <legend>Как называется</legend>
        <label className="adm-field">
          <span>Название — видят покупатели в корзине</span>
          <input value={p.title} onChange={(e) => set({ title: e.target.value })} placeholder={typeMeta[p.type].example} maxLength={80} />
        </label>
        <Dates value={p} onChange={(v) => set(v)} />
        <label className="adm-switch">
          <input type="checkbox" checked={p.active} onChange={(e) => set({ active: e.target.checked })} />
          <i />
          <span>
            <b>Акция включена</b>
            <small>Выключенная акция сохраняется, но не применяется</small>
          </span>
        </label>
      </fieldset>

      {p.type === 'bundle' && (
        <fieldset>
          <legend>Условия</legend>
          <div className="adm-fields-2">
            <label className="adm-field">
              <span>Покупатель берёт</span>
              <select value={p.buy} onChange={(e) => set({ buy: Number(e.target.value), pay: Math.min(p.pay || 1, Number(e.target.value) - 1) })}>
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} вещи
                  </option>
                ))}
              </select>
            </label>
            <label className="adm-field">
              <span>А платит за</span>
              <select value={p.pay} onChange={(e) => set({ pay: Number(e.target.value) })}>
                {Array.from({ length: (p.buy || 2) - 1 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="adm-note">
            Бесплатными становятся самые дешёвые вещи из каждого набора. Сейчас: <b>{promotionBadge(p)}</b>.
          </p>
          <div className="adm-field">
            <span>На какие вещи действует</span>
            <div className="adm-seg is-wrap">
              {(
                [
                  ['all', 'Все вещи'],
                  ['brand', 'Бренды'],
                  ['department', 'Разделы'],
                  ['products', 'Отдельные вещи'],
                ] as const
              ).map(([k, l]) => (
                <button type="button" key={k} className={scope.kind === k ? 'is-active' : ''} onClick={() => set({ scope: { kind: k, values: [] } })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {scope.kind === 'brand' && <Chooser items={brands} value={scope.values} onChange={(v) => set({ scope: { kind: 'brand', values: v } })} />}
          {scope.kind === 'department' && (
            <Chooser items={[...departments]} value={scope.values} onChange={(v) => set({ scope: { kind: 'department', values: v } })} />
          )}
          {scope.kind === 'products' && (
            <ProductPicker products={products} value={scope.values} label="Вещи в акции" onChange={(v) => set({ scope: { kind: 'products', values: v } })} />
          )}
        </fieldset>
      )}

      {p.type === 'set' && (
        <fieldset>
          <legend>Комплект</legend>
          <ProductPicker products={products} value={p.main || []} label="1. Что покупают — за это платят" onChange={(v) => set({ main: v })} />
          <ProductPicker
            products={products}
            value={p.extra || []}
            label="2. Что к нему со скидкой"
            onChange={(v) => set({ extra: v })}
          />
          <label className="adm-field">
            <span>Скидка на вторую часть, %</span>
            <input type="number" min={1} max={100} value={p.extraPercent} onChange={(e) => set({ extraPercent: Number(e.target.value) })} />
          </label>
          <p className="adm-note">
            «Костюм по цене брюк»: в первом списке — брюки, во втором — пиджак, скидка 100%. На каждую вещь из первого
            списка — одна вещь из второго.
          </p>
        </fieldset>
      )}

      {p.type === 'threshold' && (
        <fieldset>
          <legend>Условия</legend>
          <label className="adm-field">
            <span>При заказе от, ₽</span>
            <input type="number" min={1} value={p.minTotal} onChange={(e) => set({ minTotal: Number(e.target.value) })} />
          </label>
          <div className="adm-field">
            <span>Скидка</span>
            <div className="adm-seg">
              <button type="button" className={p.percent ? 'is-active' : ''} onClick={() => set({ percent: p.percent || 10, amount: 0 })}>
                В процентах
              </button>
              <button type="button" className={!p.percent ? 'is-active' : ''} onClick={() => set({ percent: 0, amount: p.amount || 3000 })}>
                Суммой
              </button>
            </div>
          </div>
          {p.percent ? (
            <label className="adm-field">
              <span>Скидка, % (до 90)</span>
              <input type="number" min={1} max={90} value={p.percent} onChange={(e) => set({ percent: Number(e.target.value) })} />
            </label>
          ) : (
            <label className="adm-field">
              <span>Скидка, ₽</span>
              <input type="number" min={1} value={p.amount} onChange={(e) => set({ amount: Number(e.target.value) })} />
            </label>
          )}
          <p className="adm-note">
            Сейчас: <b>{promotionBadge(p)}</b>. Можно сделать несколько ступеней отдельными акциями — покупатель получит
            лучшую подходящую.
          </p>
        </fieldset>
      )}

      {p.type === 'shipping' && (
        <fieldset>
          <legend>Условия</legend>
          <label className="adm-field">
            <span>Бесплатная доставка при заказе от, ₽ (0 — всегда)</span>
            <input type="number" min={0} value={p.minTotal} onChange={(e) => set({ minTotal: Number(e.target.value) })} />
          </label>
          <p className="adm-note">Сумма считается после скидок. В корзине покупатель видит, сколько осталось добавить.</p>
        </fieldset>
      )}

      <div className="adm-form-foot">
        {!isNew && (
          <button type="button" className="adm-btn is-ghost promo-delete" onClick={onDelete}>
            <Trash2 /> Удалить
          </button>
        )}
        <button className="adm-btn is-primary">{isNew ? 'Создать акцию' : 'Сохранить'}</button>
      </div>
    </form>
  );
}

function CodeEditor({
  initial,
  used,
  isNew,
  onSave,
  onDelete,
}: {
  initial: PromoCode;
  used: number;
  isNew: boolean;
  onSave: (c: PromoCode) => void;
  onDelete: () => void;
}) {
  const [c, setC] = useState<PromoCode>(initial);
  const set = (patch: Partial<PromoCode>) => setC((x) => ({ ...x, ...patch }));
  const generate = () => {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    set({ code: 'HL' + Array.from({ length: 6 }, () => abc[Math.floor(Math.random() * abc.length)]).join('') });
  };
  return (
    <form
      className="adm-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...c, code: c.code.trim().toUpperCase() });
      }}
    >
      <fieldset>
        <legend>Код</legend>
        <div className="promo-code-row">
          <label className="adm-field">
            <span>Промокод</span>
            <input
              value={c.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s+/g, '') })}
              placeholder="WELCOME10"
              maxLength={30}
              required
              className="mono"
            />
          </label>
          <button type="button" className="adm-btn is-ghost" onClick={generate}>
            <Shuffle /> Придумать
          </button>
        </div>
        <label className="adm-field">
          <span>Заметка для команды</span>
          <input value={c.note} onChange={(e) => set({ note: e.target.value })} placeholder="Для блогера, рассылка ноября…" maxLength={200} />
        </label>
      </fieldset>
      <fieldset>
        <legend>Что даёт</legend>
        <div className="adm-seg">
          {(
            [
              ['percent', 'Процент'],
              ['fixed', 'Сумма'],
              ['shipping', 'Бесплатная доставка'],
            ] as const
          ).map(([k, l]) => (
            <button type="button" key={k} className={c.kind === k ? 'is-active' : ''} onClick={() => set({ kind: k, value: k === 'percent' ? 10 : k === 'fixed' ? 3000 : 0 })}>
              {l}
            </button>
          ))}
        </div>
        {c.kind !== 'shipping' && (
          <label className="adm-field">
            <span>{c.kind === 'percent' ? 'Скидка, % (до 90)' : 'Скидка, ₽'}</span>
            <input type="number" min={1} max={c.kind === 'percent' ? 90 : undefined} value={c.value} onChange={(e) => set({ value: Number(e.target.value) })} />
          </label>
        )}
        <label className="adm-field">
          <span>Действует при заказе от, ₽ (0 — на любой)</span>
          <input type="number" min={0} value={c.minTotal} onChange={(e) => set({ minTotal: Number(e.target.value) })} />
        </label>
      </fieldset>
      <fieldset>
        <legend>Ограничения</legend>
        <Dates value={c} onChange={(v) => set(v)} />
        <label className="adm-field">
          <span>Сколько раз можно применить всего (0 — без лимита)</span>
          <input type="number" min={0} value={c.limit} onChange={(e) => set({ limit: Number(e.target.value) })} />
          {!isNew && <small className="adm-note">Уже использован в оплаченных заказах: {used}</small>}
        </label>
        <label className="adm-switch">
          <input type="checkbox" checked={c.perCustomer} onChange={(e) => set({ perCustomer: e.target.checked })} />
          <i />
          <span>
            <b>Один раз на покупателя</b>
            <small>Повторно тот же аккаунт применить не сможет</small>
          </span>
        </label>
        <label className="adm-switch">
          <input type="checkbox" checked={c.active} onChange={(e) => set({ active: e.target.checked })} />
          <i />
          <span>
            <b>Промокод включён</b>
          </span>
        </label>
      </fieldset>
      <div className="adm-form-foot">
        {!isNew && (
          <button type="button" className="adm-btn is-ghost promo-delete" onClick={onDelete}>
            <Trash2 /> Удалить
          </button>
        )}
        <button className="adm-btn is-primary">{isNew ? 'Создать промокод' : 'Сохранить'}</button>
      </div>
    </form>
  );
}
