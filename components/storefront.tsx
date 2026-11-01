'use client';
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from 'sonner';
import Footer from './site-footer';
import { initialProducts, Product, rub, nbspShort } from '@/lib/catalog';
import { promotionsFor, promotionBadge, type Promotion } from '@/lib/pricing';
import BannerCarousel from './banner-carousel';
import RequestForm from './request-form';
import SearchOverlay from './search-overlay';
import UnavailableHint from './unavailable-hint';
import { GlassChevrons } from './glass-chevrons';
import BrandMenu from './brand-menu';
import { IconChevronLeft, IconChevronRight } from './icons';
import { CartAddedControls, useCartQuantity, removeCartUnit } from './cart-feedback';
export function Icon({ name }: { name: string }) {
  const files: Record<string, string> = {
    menu: '3f869.svg',
    heart: 'cf89b.svg',
    profile: 'edd9e.svg',
    bag: '66a7f.svg',
    search: 'c0e11.svg',
    down: '5d0a6.svg',
    right: '29294.svg',
  };
  return <img className="icon" src={'/figma/init0/' + files[name]} alt="" />;
}
const searchHints = ['Поиск', 'Moncler', 'Balenciaga', 'Gucci', 'Valentino', 'Saint Laurent'];
function SearchHint() {
  const [step, setStep] = useState(0);
  const index = step % searchHints.length;
  useEffect(() => {
    // подсказки не листаются, если в системе включено «уменьшить движение»
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => setStep((value) => value + 1), index === 0 ? 7000 : 5000);
    return () => window.clearTimeout(timer);
  }, [step, index]);
  return (
    <span className="search-hint" aria-hidden="true">
      <span key={step} className={step ? 'search-hint-frame is-changing' : 'search-hint-frame'}>
        {step > 0 && <span className="search-hint-out">{searchHints[(step - 1) % searchHints.length]}</span>}
        <span className="search-hint-in">{searchHints[index]}</span>
      </span>
    </span>
  );
}
export function Header({ home = false, decorative = false }: { home?: boolean; decorative?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [footerShade, setFooterShade] = useState(0);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // Один пересчёт за кадр и только при изменении — без лишних перерисовок шапки во время прокрутки
    let frame = 0;
    let fadeHeight = 0;
    const measure = () => {
      const footer = document.querySelector('.site-footer');
      fadeHeight = footer ? parseFloat(getComputedStyle(footer, '::before').height) || 180 : 180;
    };
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 1);
      const footer = document.querySelector('.site-footer');
      const header = headerRef.current;
      if (!footer || !header) {
        setFooterShade(0);
        return;
      }
      if (!fadeHeight) measure();
      const distance = footer.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
      const progress = Math.max(0, Math.min(1, 1 - distance / fadeHeight));
      const shade = Math.round((1 - (1 - progress) ** 2) * 100) / 100;
      setFooterShade((prev) => (prev === shade ? prev : shade));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resize = () => {
      measure();
      schedule();
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', resize);
    };
  }, []);
  const [menu, setMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSeed, setSearchSeed] = useState('');
  const searchTrigger = useRef<HTMLElement | null>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  // Поиск открывается кликом, наведением или вводом — но не самим фокусом, иначе клавиатура застревает в шапке
  // фокус возвращаем в шапку только при работе с клавиатуры: после мыши поле не должно оставаться раскрытым
  const openSearch = (from: HTMLElement | null, seed = '', keyboard = false) => {
    searchTrigger.current = keyboard ? from : null;
    setSearchSeed(seed);
    setSearchOpen(true);
  };
  return (
    <>
      <header
        ref={headerRef}
        style={{ '--header-darkness': footerShade } as React.CSSProperties}
        className={
          'site-header ' +
          (home ? 'home-header ' : '') +
          (scrolled ? 'is-scrolled ' : '') +
          (footerShade >= 0.99 ? 'is-footer-dark' : '')
        }
      >
        <div className="nav-left">
          <button
            ref={burgerRef}
            aria-label="Открыть меню"
            onPointerEnter={(event) => {
              // меню открывается, только если курсор задержался на кнопке, а не пролетел мимо
              if (event.pointerType !== 'mouse') return;
              clearTimeout(hoverTimer.current);
              hoverTimer.current = window.setTimeout(() => setMenu(true), 160);
            }}
            onPointerLeave={() => clearTimeout(hoverTimer.current)}
            onClick={() => setMenu(true)}
          >
            <Icon name="menu" />
          </button>
          {/* на телефоне поле поиска скрыто — иконка рядом с меню открывает тот же поиск */}
          <button
            type="button"
            className="mobile-search-btn"
            aria-label="Поиск"
            onClick={(e) => openSearch(e.currentTarget, '', e.detail === 0)}
          >
            <Icon name="search" />
          </button>
          <Link href="/catalog">КАТАЛОГ</Link>
          <Link href="/brands">БРЕНДЫ</Link>
          <Link href="/sale" className="flow-gradient">
            СКИДКИ
          </Link>
        </div>
        <Link className="logo" href="/">
          hauteline.
        </Link>
        <div className="nav-right">
          <div className="search-slot">
            <form
              action="/search"
              className="search"
              onMouseEnter={() => openSearch(null)}
              onSubmit={(e) => {
                e.preventDefault();
                openSearch(document.getElementById('header-search'), '', true);
              }}
            >
              <label className="search-icon" htmlFor={decorative ? undefined : 'header-search'}>
                <Icon name="search" />
              </label>
              <SearchHint />
              <input
                onClick={() => openSearch(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    openSearch(e.currentTarget, '', true);
                  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    openSearch(e.currentTarget, e.key, true);
                  }
                }}
                autoComplete="off"
                id={decorative ? undefined : 'header-search'}
                name="q"
                placeholder="Поиск"
                aria-label="Поиск товаров"
              />
              <div className="search-panel">
                <span>Поиск по вещам и брендам</span>
                <button type="submit">Найти →</button>
              </div>
            </form>
          </div>
          <Link href="/favorites" aria-label="Избранное">
            <Icon name="heart" />
          </Link>
          <Link href="/profile" aria-label="Личный кабинет">
            <Icon name="profile" />
          </Link>
          <Link href="/cart" aria-label="Корзина">
            <Icon name="bag" />
          </Link>
        </div>
      </header>
      <BrandMenu open={menu} onOpenChange={setMenu} returnFocus={() => burgerRef.current} />
      <SearchOverlay
        open={searchOpen}
        onOpenChange={setSearchOpen}
        seed={searchSeed}
        returnFocus={() => searchTrigger.current}
      />
      <UnavailableHint />
    </>
  );
}
export function ProductImage({ p, className = '', src }: { p: Product; className?: string; src?: string }) {
  return p.sprite !== undefined && !src ? (
    <div
      role="img"
      aria-label={p.name}
      className={'product-image sprite sprite-' + p.sprite + ' ' + className}
      style={{ backgroundImage: `url(${p.image})` }}
    />
  ) : (
    <img className={'product-image ' + className} src={src || p.image} alt={p.name} />
  );
}
export function addCart(id: string, size = '') {
  const cart: { id: string; size: string; qty: number }[] = JSON.parse(
    localStorage.getItem('hl-cart') || '[]',
  );
  const row = cart.find((x) => x.id === id && x.size === size);
  if (row) row.qty++;
  else cart.push({ id, size, qty: 1 });
  localStorage.setItem('hl-cart', JSON.stringify(cart));
  syncState();
  trackCart(id);
  window.dispatchEvent(new Event('cart-change'));
}
/* Свет на кнопке «в корзину»: анимация продолжает бежать, пока блик плавно гаснет после ухода курсора,
   и начинается заново с верхней кромки (где блик нарисован в макете) при следующем наведении. */
const glowTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
function glowOn(e: ReactMouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  clearTimeout(glowTimers.get(el));
  // на телефонах подсветки нет — не запускаем анимацию впустую
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  el.dataset.glowing = '1';
}
function glowOff(e: ReactMouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  clearTimeout(glowTimers.get(el));
  glowTimers.set(
    el,
    setTimeout(() => delete el.dataset.glowing, 900),
  );
}

// Автоматические акции витрины (из /api/settings) — один запрос на страницу для всех карточек
let promotionsRequest: Promise<Promotion[]> | null = null;
export function usePromotions() {
  const [list, setList] = useState<Promotion[]>([]);
  useEffect(() => {
    promotionsRequest ??= fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => (Array.isArray(s.promotions) ? s.promotions : []))
      .catch(() => []);
    promotionsRequest.then(setList);
  }, []);
  return list;
}
/** Цена со старой (зачёркнутой) ценой и процентом скидки. */
export function PriceTag({ p, className }: { p: Product; className?: string }) {
  const price = p.promo ? 1 : p.price;
  const old = (p.compareAt || 0) > price ? p.compareAt! : p.promo ? p.price : 0;
  return (
    <span className={'price-tag ' + (className || '')}>
      {old > 0 && (
        <span className="price-old">
          <s aria-label={'Старая цена ' + rub(old)}>{rub(old)}</s>
          {/* скидка — вне <s>, иначе зачёркивание проходит и по плашке */}
          <em>−{Math.round((1 - price / old) * 100)}%</em>
        </span>
      )}
      <b>{rub(price)}</b>
    </span>
  );
}
export function ProductCard({ p, animate = false }: { p: Product; animate?: boolean }) {
  const [favorite, setFavorite] = useState(false);
  const promotions = usePromotions();
  const badges = promotionsFor(p, promotions, Date.now()).map(promotionBadge);
  const quantity = useCartQuantity(p.id);
  const [photo, setPhoto] = useState(0);
  const gallery = p.gallery?.length ? p.gallery : [p.image];
  useEffect(() => {
    setFavorite(JSON.parse(localStorage.getItem('hl-favorites') || '[]').includes(p.id));
  }, [p.id]);
  function toggle() {
    const ids: string[] = JSON.parse(localStorage.getItem('hl-favorites') || '[]');
    localStorage.setItem(
      'hl-favorites',
      JSON.stringify(favorite ? ids.filter((x) => x !== p.id) : [...ids, p.id]),
    );
    syncState();
    setFavorite(!favorite);
  }
  return (
    <article
      data-unavailable={p.stock <= 0 ? 'true' : undefined}
      className={'product-card ' + (animate ? 'first-reveal' : '')}
    >
      <div className="card-photo">
        {!!badges.length && (
          <div className="card-promo-tags">
            {badges.slice(0, 2).map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        )}
        <Link href={'/product/' + p.id}>
          <ProductImage p={p} src={p.gallery?.length ? gallery[photo] : undefined} />
        </Link>
        {gallery.length > 1 && (
          <>
            <button
              className="product-gallery-arrow previous"
              aria-label="Предыдущее фото товара"
              onClick={() => setPhoto((i) => (i - 1 + gallery.length) % gallery.length)}
            >
              <IconChevronLeft />
            </button>
            <button
              className="product-gallery-arrow next"
              aria-label="Следующее фото товара"
              onClick={() => setPhoto((i) => (i + 1) % gallery.length)}
            >
              <IconChevronRight />
            </button>
            <div className="product-gallery-dots">
              {gallery.map((_, i) => (
                <button
                  key={i}
                  aria-label={'Фото товара ' + (i + 1)}
                  aria-pressed={photo === i}
                  onClick={() => setPhoto(i)}
                />
              ))}
            </div>
          </>
        )}
        <button
          className={'favorite ' + (favorite ? 'is-favorite' : '')}
          aria-label={favorite ? 'Убрать из избранного' : 'В избранное'}
          aria-pressed={favorite}
          onClick={toggle}
        >
          <img src="/figma/init0/c3d11.svg" alt="" />
        </button>
        {p.promo && <span className="promo-badge">1 ₽</span>}
      </div>
      <Link href={'/product/' + p.id} className="product-name">
        {nbspShort(p.name)}
        {/* строка бренда есть всегда — иначе названия соседних карточек стоят на разной высоте */}
        {p.brand ? <small>{p.brand}</small> : <small className="is-empty" aria-hidden="true">{'\u00a0'}</small>}
      </Link>
      {p.color && p.colorHex && (
        <div className="product-color-row">
          <span
            className="product-color-swatch"
            style={{ backgroundColor: p.colorHex }}
            role="img"
            aria-label={p.color}
            title={p.color}
          />
          <span>{p.color}</span>
        </div>
      )}
      <div className={'card-bottom ' + (quantity ? 'has-cart-controls' : '')}>
        <strong className={(p.compareAt || 0) > p.price || p.promo ? 'has-old' : ''}>
          <PriceTag p={p} />
        </strong>
        <div className={'cart-toggle-slot ' + (quantity ? 'is-added' : '')}>
          <div className="cart-toggle-add" aria-hidden={quantity > 0} inert={quantity > 0}>
            <button
              className="cart-glow"
              onClick={() => addCart(p.id)}
              onMouseEnter={glowOn}
              onMouseLeave={glowOff}
              aria-label="Добавить в корзину"
            >
              <img className="cart-button-artwork" src="/figma/init0/723e6-notext.png" alt="" />
              <img className="cart-button-artwork-clean" src="/figma/init0/723e6-clean.png" alt="" />
              <span className="cart-run cart-run-halo" aria-hidden="true">
                <i />
              </span>
              <span className="cart-run cart-run-line" aria-hidden="true">
                <i />
              </span>
              <span className="cart-button-label">в корзину</span>
              <img className="cart-button-arrow" src="/figma/init0/0d7a2.svg" alt="" />
            </button>
          </div>
          <div className="cart-toggle-added" aria-hidden={!quantity} inert={!quantity}>
            <CartAddedControls
              compact
              onRemove={() => removeCartUnit(p.id)}
              quantity={quantity}
              disabled={quantity >= p.stock}
              onAdd={() => addCart(p.id)}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
export { Footer };
// цвета текста уведомлений чуть темнее стандартных sonner — контраст не ниже 4.5:1
const toastColors = {
  '--success-text': '#008529',
  '--info-text': '#0370d9',
  '--error-text': '#e0090d',
} as React.CSSProperties;
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main id="main" tabIndex={-1} className="page-content">
        {children}
      </main>
      <Footer />
      <Toaster position="bottom-right" richColors style={toastColors} />
    </>
  );
}
// Первый экран: плашка, крупный заголовок в две строки, короткое описание и пунктирный «маршрут» с самолётом.
// Всё выезжает, когда блок реально видно: вкладка открыта и он на экране. До этого анимация стоит
// на паузе в начальном кадре, поэтому её нельзя «пропустить», пока страница грузится в фоне.
function HeroIntro() {
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(matchMedia('(prefers-reduced-motion: reduce)').matches), []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let seen = false;
    const start = () => {
      if (seen && document.visibilityState === 'visible') {
        requestAnimationFrame(() => setRun(true));
        cleanup();
      }
    };
    const io = new IntersectionObserver((entries) => {
      seen = entries.some((e) => e.isIntersecting);
      start();
    });
    io.observe(el);
    document.addEventListener('visibilitychange', start);
    const cleanup = () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', start);
    };
    return cleanup;
  }, []);
  return (
    <div ref={ref} className={run ? 'hero-intro is-running' : 'hero-intro'}>
      <svg className="hero-route hero-route-left" viewBox="0 0 220 200" aria-hidden="true" focusable="false">
        <path id="hero-route-path" d="M200 18 C 90 10, 20 60, 30 120 C 36 160, 80 186, 150 182" />
        <g className="hero-plane" opacity={run && !reduced ? 0 : 1} transform={run && !reduced ? undefined : 'translate(150 182)'}>
          <path d="M-9 -2.5 L9 0 L-9 2.5 L-6 0 Z M-3 -1 L-7 -8 L-4 -8 L3 -1 Z M-3 1 L-7 8 L-4 8 L3 1 Z" />
          {run && !reduced && (
            <animateMotion dur="5s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
              <mpath href="#hero-route-path" />
            </animateMotion>
          )}
          {run && !reduced && (
            // в начале маршрута самолётик проявляется, в конце тает: без скачка из конца в начало
            <animate attributeName="opacity" values="0;0.35;1;1;0.35;0" keyTimes="0;0.12;0.3;0.7;0.88;1" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0 0 1 1;0.4 0 0.6 1;0.4 0 0.6 1" dur="5s" repeatCount="indefinite" />
          )}
        </g>
      </svg>
      <svg className="hero-route hero-route-right" viewBox="0 0 220 200" aria-hidden="true" focusable="false">
        <path id="hero-route-path-r" d="M20 182 C 130 190, 200 140, 190 80 C 184 40, 140 14, 70 18" />
        <g className="hero-plane" opacity={run && !reduced ? 0 : 1} transform={run && !reduced ? undefined : 'translate(70 18) rotate(180)'}>
          <path d="M-9 -2.5 L9 0 L-9 2.5 L-6 0 Z M-3 -1 L-7 -8 L-4 -8 L3 -1 Z M-3 1 L-7 8 L-4 8 L3 1 Z" />
          {run && !reduced && (
            <animateMotion dur="5s" begin="2.5s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
              <mpath href="#hero-route-path-r" />
            </animateMotion>
          )}
          {run && !reduced && (
            <animate attributeName="opacity" values="0;0.35;1;1;0.35;0" keyTimes="0;0.12;0.3;0.7;0.88;1" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0 0 1 1;0.4 0 0.6 1;0.4 0 0.6 1" dur="5s" begin="2.5s" repeatCount="indefinite" />
          )}
        </g>
      </svg>
      <span className="hero-spark" aria-hidden="true">
        ✦
      </span>
      <p className="hero-badge">
        Выкупаем в бутиках <span>Европы, США и Азии</span>
      </p>
      <h1 className="hero-title">
        <span>Оригинальная одежда,</span> <b>обувь и аксессуары</b>
      </h1>
      <p className="hero-lead">
        Проверяем подлинность и привозим в Россию. В наличии от 2 дней, под заказ около 15 дней.
      </p>
    </div>
  );
}
export default function Storefront() {
  const [products, setProducts] = useState(initialProducts);
  const [availability, setAvailability] = useState('preorder');
  const [limit, setLimit] = useState(8);
  useEffect(() => {
    fetch('/api/catalog')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setProducts(d);
      })
      .catch(() => {});
  }, []);
  const visible = products.filter((p) => p.availability === availability && p.published && p.stock > 0);
  return (
    <>
      <Header home />
      <main id="main" tabIndex={-1} className="home-main">
        <section className="hero">
          <HeroIntro />
          <Link href="#request" className="find-button">
            Найти любую позицию{' '}
            <GlassChevrons size={34} />
          </Link>
          <BannerCarousel />
        </section>
        <section className="catalog" id="catalog">
          <Tabs
            value={availability}
            onValueChange={(v) => {
              setAvailability(v);
              setLimit(8);
            }}
          >
            <TabsList className="availability-tabs">
              <TabsTrigger value="stock" aria-controls={undefined}>В наличии в РФ</TabsTrigger>
              <TabsTrigger value="preorder" aria-controls={undefined}>Под заказ</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="section-heading">
            <h2>НОВЫЕ ПОСТУПЛЕНИЯ</h2>
            <Link className="catalog-all" href={'/catalog?availability=' + availability}>
              Смотреть всё →
            </Link>
          </div>
          {visible.length ? (
            <div className="product-grid">
              {visible.slice(0, limit).map((p, i) => (
                <ProductCard key={p.id} p={p} animate={i < 4} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>Пока нет доступных вещей</h2>
              <p>Новые позиции скоро появятся здесь.</p>
            </div>
          )}
          {visible.length > limit && (
            <button className="pill more" onClick={() => setLimit((l) => l + 8)}>
              Показать ещё
            </button>
          )}
        </section>
        <RequestForm embedded />
        <section className="service-benefits" aria-label="О сервисе">
          <div>
            <span>01</span>
            <h3>Ищем по всему миру</h3>
            <p>Работаем с бутиками и официальными ритейлерами в Европе, США и Азии.</p>
          </div>
          <div>
            <span>02</span>
            <h3>Только оригинал</h3>
            <p>Проверенные поставщики и гарантия подлинности.</p>
          </div>
          <div>
            <span>03</span>
            <h3>Доставляем в РФ</h3>
            <p>Бережная логистика и поддержка на каждом этапе.</p>
          </div>
        </section>
      </main>
      <Footer />
      <Toaster position="bottom-right" richColors style={toastColors} />
    </>
  );
}

export function syncState() {
  return fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cart: JSON.parse(localStorage.getItem('hl-cart') || '[]'),
      favorites: JSON.parse(localStorage.getItem('hl-favorites') || '[]'),
    }),
  }).catch(() => {});
}
function trackCart(id: string) {
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visitor: sessionStorage.getItem('hl-visitor') || 'anonymous',
      type: 'cart',
      product: id,
    }),
  }).catch(() => {});
}
