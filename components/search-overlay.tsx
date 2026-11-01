'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { IconSearch } from './icons';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
const sections = [
  ['women', 'Женское'],
  ['men', 'Мужское'],
  ['unisex', 'Унисекс'],
];
const brands = [
  'Dolce&Gabbana',
  'Bottega Veneta',
  'Valentino',
  'Saint Laurent',
  'Burberry',
  'Balenciaga',
  'Gucci',
];
const categories = ['Футболки', 'Сумки', 'Кроссовки', 'Платья', 'Джинсы', 'Туфли', 'Очки', 'Юбки'];
export default function SearchOverlay({
  open,
  onOpenChange,
  seed = '',
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  /** Буквы, набранные в поле шапки до открытия окна, — переносим их сюда. */
  seed?: string;
  /** Куда вернуть фокус клавиатуры после закрытия. */
  returnFocus?: () => HTMLElement | null;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeBelowPanel = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const lastCategory = panelRef.current?.querySelector('.search-suggestions:last-child a:last-child');
      const bounds = lastCategory?.getBoundingClientRect();
      if (bounds && event.clientY >= bounds.bottom + 5) onOpenChange(false);
    };
    document.addEventListener('pointermove', closeBelowPanel);
    return () => document.removeEventListener('pointermove', closeBelowPanel);
  }, [open, onOpenChange]);
  const [section, setSection] = useState('women');
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open && seed) setQuery(seed);
  }, [open, seed]);
  const href = (q: string) => '/search?q=' + encodeURIComponent(q) + '&gender=' + section;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={panelRef}
        className="catalog-search-overlay"
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          // Radix выделяет текст поля при открытии — тогда следующая буква стёрла бы уже набранную
          e.preventDefault();
          const input = panelRef.current?.querySelector<HTMLInputElement>('input[name=q]');
          input?.focus();
          input?.setSelectionRange(input.value.length, input.value.length);
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus?.()?.focus({ preventScroll: true });
        }}
      >
        <DialogTitle className="logo">hauteline.</DialogTitle>
        <DialogDescription className="sr-only">Поиск вещей и брендов в каталоге</DialogDescription>
        <form action="/search" className="catalog-search-line">
          <IconSearch />
          <input
            name="q"
            aria-label="Поиск по каталогу"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={'Поиск по разделу «' + sections.find((s) => s[0] === section)?.[1] + '»'}
          />
          <input type="hidden" name="gender" value={section} />
          <button
            type="submit"
            className="search-run"
            disabled={!query.trim()}
            data-hint={!query.trim() ? 'Введите название вещи или бренд' : undefined}
          >
            Найти →
          </button>
          <button type="button" onClick={() => onOpenChange(false)}>
            Отменить
          </button>
        </form>
        <div className="search-sections" role="group" aria-label="Раздел поиска">
          {sections.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={section === value}
              onClick={() => setSection(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <section className="search-suggestions">
          <h3>ПОПУЛЯРНЫЕ БРЕНДЫ</h3>
          <div>
            {brands.map((brand) => (
              <Link href={href(brand)} key={brand} onClick={() => onOpenChange(false)}>
                {brand}
              </Link>
            ))}
          </div>
        </section>
        <section className="search-suggestions">
          <h3>ПОПУЛЯРНЫЕ КАТЕГОРИИ</h3>
          <div>
            {categories.map((category) => (
              <Link href={href(category)} key={category} onClick={() => onOpenChange(false)}>
                {category}
              </Link>
            ))}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
