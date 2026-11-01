'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sheet, SheetContent, SheetTitle } from './ui/sheet';
const categories = ['Одежда', 'Обувь', 'Аксессуары', 'Парфюмерия'];
const genders = [
  ['men', 'мужские'],
  ['women', 'женские'],
  ['unisex', 'унисекс'],
];
const brands = ['maison margiela', 'gucci', 'balenciaga', 'nike', 'chanel', 'prada'];
export default function BrandMenu({
  open,
  onOpenChange,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus?: () => HTMLElement | null;
}) {
  const [category, setCategory] = useState('');
  const [flyoutTop, setFlyoutTop] = useState(104);
  const [gender, setGender] = useState('men');
  const [query, setQuery] = useState('');
  // ссылка на Telegram-канал магазина из настроек панели
  const [channel, setChannel] = useState('');
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => setChannel(s.telegramChannel || s.telegram || ''))
      .catch(() => {});
  }, []);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const keepFlyout = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  // на телефоне «уход мыши» — это эмуляция после касания: панель не должна от неё закрываться
  const canHover = () =>
    typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const leaveMenu = () => {
    if (!canHover()) return;
    keepFlyout();
    closeTimer.current = setTimeout(() => {
      onOpenChange(false);
      setCategory('');
    }, 90);
  };
  const leaveFlyout = () => {
    if (!canHover()) return;
    keepFlyout();
    closeTimer.current = setTimeout(() => setCategory(''), 90);
  };
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  const activate = (item: string, button: HTMLButtonElement) => {
    keepFlyout();
    setCategory(item);
    setFlyoutTop(button.offsetTop);
    // на телефоне панель брендов открывается под меню — плавно прокручиваем к ней
    if (!canHover())
      setTimeout(() => flyoutRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  };
  const close = () => {
    onOpenChange(false);
    setCategory('');
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) setCategory('');
      }}
    >
      <SheetContent
        side="left"
        className="brand-menu-sheet"
        showCloseButton={false}
        onMouseEnter={keepFlyout}
        onMouseLeave={leaveMenu}
        aria-describedby={undefined}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus?.()?.focus({ preventScroll: true });
        }}
      >
        <div className="brand-menu-main">
          <div className="brand-menu-top">
            <button className="brand-menu-close" type="button" aria-label="Закрыть меню" onClick={close}>
              ×
            </button>
            <form action="/search" className="brand-menu-search">
              <img src="/figma/init0/c0e11.svg" alt="" />
              <input
                name="q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Поиск в меню"
                placeholder="Поиск"
              />
            </form>
          </div>
          <SheetTitle className="brand-menu-title">
            <Link href="/catalog" onClick={close}>
              Все товары
            </Link>
          </SheetTitle>
          <nav className="brand-menu-categories" aria-label="Категории" onMouseLeave={leaveFlyout}>
            {categories.map((item) => (
              <button
                type="button"
                key={item}
                className={category === item ? 'active' : ''}
                onMouseEnter={(event) => canHover() && activate(item, event.currentTarget)}
                onFocus={(event) => activate(item, event.currentTarget)}
                onClick={(event) => activate(item, event.currentTarget)}
                aria-expanded={category === item}
              >
                {item}
                <span>›</span>
              </button>
            ))}
          </nav>
          <nav className="brand-menu-availability" aria-label="Наличие">
            <Link href="/catalog?availability=stock" onClick={close}>
              Наличие в РФ
            </Link>
            <Link href="/catalog?availability=preorder" onClick={close}>
              Под заказ
            </Link>
          </nav>
          <nav className="brand-menu-info" aria-label="Информация">
            {[
              ['Как заказать', '/info/how-to-order'],
              ['Оригинальность', '/info/authenticity'],
              ['Доставка и оплата', '/info/delivery'],
              ['Отзывы наших клиентов', '/info/reviews'],
            ].map(([label, url]) => (
              <Link key={url} href={url} onClick={close}>
                {label}
              </Link>
            ))}
          </nav>
          <Link className="brand-menu-find" href="/request" onClick={close}>
            Найти вещь <span>→</span>
          </Link>
          <nav className="brand-menu-bottom" aria-label="Сервисные ссылки">
            {[
              ['Войти в аккаунт', '/profile'],
              ['связь с нами', '/info/contacts'],
              ['о нас', '/info/about'],
            ].map(([label, url]) => (
              <Link key={label} href={url} onClick={close}>
                {label}
              </Link>
            ))}
            {channel ? (
              <a href={channel} target="_blank" rel="noreferrer" onClick={close}>
                Telegram
              </a>
            ) : (
              <Link href="/info/contacts" onClick={close}>
                Telegram
              </Link>
            )}
          </nav>
        </div>
        <div
          ref={flyoutRef}
          className="brand-menu-flyout"
          data-state={category ? 'open' : 'closed'}
          aria-hidden={!category}
          inert={!category}
          onMouseEnter={keepFlyout}
          onMouseLeave={leaveFlyout}
          style={{ '--flyout-top': flyoutTop + 'px' } as React.CSSProperties}
          aria-label={'Бренды: ' + category}
        >
          {/* Пол — сразу ссылка на всю категорию (например «Одежда · мужские»);
              наведение заодно показывает бренды этого раздела справа */}
          <div className="brand-menu-genders">
            {genders.map(([value, label]) => (
              <Link
                key={value}
                href={'/search?dept=' + encodeURIComponent(category) + '&gender=' + value}
                className={gender === value ? 'active' : ''}
                onMouseEnter={() => setGender(value)}
                onFocus={() => setGender(value)}
                onClick={close}
              >
                {label}
              </Link>
            ))}
            <Link className="brand-menu-all" href={'/search?dept=' + encodeURIComponent(category)} onClick={close}>
              Смотреть всё
            </Link>
          </div>
          <nav className="brand-menu-brands" aria-label="Бренды">
            {brands.map((brand) => (
              <Link
                key={brand}
                href={
                  '/search?q=' + encodeURIComponent(brand) + '&dept=' + encodeURIComponent(category) + '&gender=' + gender
                }
                onClick={close}
              >
                {brand}
              </Link>
            ))}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
}
