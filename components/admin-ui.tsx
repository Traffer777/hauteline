'use client';
// Общие элементы панели команды: значки, поиск, чипы, пустые состояния, выезжающая панель, форматирование.
import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';

export const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateTime = (t: number) =>
  new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const plural = (n: number, one: string, few: string, many: string) =>
  n % 100 >= 11 && n % 100 <= 14
    ? many
    : n % 10 === 1
      ? one
      : n % 10 >= 2 && n % 10 <= 4
        ? few
        : many;

export function Badge({ tone = 'muted', children }: { tone?: string; children: ReactNode }) {
  return <span className={'adm-badge is-' + tone}>{children}</span>;
}

export function Toolbar({
  search,
  setSearch,
  placeholder,
  children,
}: {
  search: string;
  setSearch: (v: string) => void;
  placeholder: string;
  children?: ReactNode;
}) {
  return (
    <div className="adm-toolbar">
      <label className="adm-search">
        <Search aria-hidden="true" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        {search && (
          <button type="button" aria-label="Очистить" onClick={() => setSearch('')}>
            <X />
          </button>
        )}
      </label>
      {children}
    </div>
  );
}
export function Chips<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="adm-chips" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          className={value === it.value ? 'is-active' : ''}
          onClick={() => onChange(it.value)}
        >
          {it.label}
          {it.count !== undefined && <em>{it.count}</em>}
        </button>
      ))}
    </div>
  );
}
export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="adm-empty">
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className={'adm-drawer' + (wide ? ' is-wide' : '')} showCloseButton={false}>
        <div className="adm-drawer-head">
          <div>
            <SheetTitle>{title}</SheetTitle>
            {subtitle ? <SheetDescription>{subtitle}</SheetDescription> : <SheetDescription className="sr-only">{title}</SheetDescription>}
          </div>
          <button className="adm-icon-btn" aria-label="Закрыть" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="adm-drawer-body">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
export const matches = (row: unknown, q: string) => !q || JSON.stringify(row).toLowerCase().includes(q.trim().toLowerCase());

