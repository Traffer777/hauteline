'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProductCard } from './storefront';
import { Choice } from './form-controls';
import { Product } from '@/lib/catalog';
import { IconClose, IconSearch } from './icons';

export default function Catalog({ products }: { products: Product[] }) {
  const params = useSearchParams();
  const [availability, setAvailability] = useState(
    params.get('availability') === 'stock' ? 'stock' : 'preorder',
  );
  const [sort, setSort] = useState('Сначала новые');
  const [limit, setLimit] = useState(12);
  const [query, setQuery] = useState('');
  const availabilityParam = params.get('availability');
  useEffect(() => {
    setAvailability(availabilityParam === 'stock' ? 'stock' : 'preorder');
    setLimit(12);
  }, [availabilityParam]);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = products.filter(
    (p) =>
      p.availability === availability &&
      words.every((w) =>
        [p.name, p.brand, p.category, p.color].filter(Boolean).join(' ').toLowerCase().includes(w),
      ),
  );
  if (sort === 'Сначала дешевле') list.sort((a, b) => a.price - b.price);
  if (sort === 'Сначала дороже') list.sort((a, b) => b.price - a.price);
  return (
    <section className="catalog-screen">
      <div className="breadcrumb">
        <Link href="/">Главная</Link> / Каталог
      </div>
      <h1>Каталог</h1>
      <form
        className="catalog-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur();
        }}
      >
        <IconSearch />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(12);
          }}
          placeholder="Поиск по каталогу"
          aria-label="Поиск по каталогу"
          enterKeyHint="search"
        />
        {query && (
          <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}>
            <IconClose />
          </button>
        )}
      </form>
      <div className="catalog-toolbar">
        <Tabs
          value={availability}
          onValueChange={(value) => {
            setAvailability(value);
            setLimit(12);
          }}
        >
          <TabsList className="availability-tabs">
            <TabsTrigger value="stock" aria-controls={undefined}>В наличии в РФ</TabsTrigger>
            <TabsTrigger value="preorder" aria-controls={undefined}>Под заказ</TabsTrigger>
          </TabsList>
        </Tabs>
        <Choice
          label="Порядок товаров"
          value={sort}
          onChange={setSort}
          items={['Сначала новые', 'Сначала дешевле', 'Сначала дороже']}
        />
      </div>
      <p className="subdued">
        {availability === 'stock' ? 'Со склада в РФ от 2 дней' : 'Под заказ из-за рубежа за 15 дней'} ·{' '}
        {list.length}{' '}
        {list.length % 100 >= 11 && list.length % 100 <= 14
          ? 'вещей'
          : list.length % 10 === 1
            ? 'вещь'
            : list.length % 10 >= 2 && list.length % 10 <= 4
              ? 'вещи'
              : 'вещей'}
      </p>
      {list.length ? (
        <div className="product-grid">
          {list.slice(0, limit).map((p, i) => (
            <ProductCard p={p} animate={i < 4} key={p.id} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>{query ? 'Ничего не нашли' : 'Пока нет доступных вещей'}</h2>
          <p>
            {query ? (
              <>
                Попробуйте другое название или{' '}
                <Link href="/request" className="outline-link">
                  оставьте запрос на поиск
                </Link>
                .
              </>
            ) : (
              'Новые позиции скоро появятся здесь.'
            )}
          </p>
        </div>
      )}
      {list.length > limit && (
        <button className="pill more" onClick={() => setLimit((n) => n + 12)}>
          Показать ещё
        </button>
      )}
    </section>
  );
}
