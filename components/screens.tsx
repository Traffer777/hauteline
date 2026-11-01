'use client';
import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Shell, ProductImage, ProductCard, addCart, syncState, PriceTag, usePromotions } from './storefront';
import { Product, rub, nbspShort, stages, departments, department, matchesQuery, genderLabels } from '@/lib/catalog';
import { priceCart, promotionsFor, promotionBadge, type PricingResult, type Promotion } from '@/lib/pricing';
/** Акции на странице товара: «Акция: 2 по цене 1 — на все кроссовки Nike» */
function ProductPromotions({ p }: { p: Product }) {
  const list = promotionsFor(p, usePromotions(), Date.now());
  if (!list.length) return null;
  return (
    <div className="product-promos">
      {list.map((x) => (
        <p key={x.id}>
          <b>{promotionBadge(x)}</b>
          {x.title && x.title !== promotionBadge(x) && <span>{x.title}</span>}
          {x.end && <small>до {new Date(x.end + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</small>}
        </p>
      ))}
    </div>
  );
}
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import Admin from './admin';
import { api } from '@/lib/client-api';
import { Choice, Consent, Field, PhoneField, PhoneVerify } from './form-controls';
import RequestForm from './request-form';
import Catalog from './catalog-screen';
import { CartAddedControls, useCartQuantity, removeCartUnit } from './cart-feedback';
import { InfoContent, Requisites, infoTitles } from './info-content';
import { setRecommendationChoice } from './experience';
import { IconExpand, IconTruck } from './icons';
export { api, Choice, Consent };
function Recommendations({ products, exclude }: { products: Product[]; exclude?: string }) {
  const personal = typeof window !== 'undefined' && localStorage.getItem('hl-cookie-choice') === 'yes';
  const ids: string[] = personal ? JSON.parse(localStorage.getItem('hl-history') || '[]') : [];
  const cart: CartRow[] = personal ? JSON.parse(localStorage.getItem('hl-cart') || '[]') : [];
  const preferences = products.filter((p) => ids.includes(p.id) || cart.some((r) => r.id === p.id));
  const score = (p: Product) =>
    preferences.reduce(
      (n, x) => n + (x.brand && x.brand === p.brand ? 3 : 0) + (x.availability === p.availability ? 1 : 0),
      0,
    );
  const sorted = [...products.filter((p) => p.id !== exclude)].sort((a, b) => score(b) - score(a));
  return (
    <section className="recommendations">
      <h2>Вам может понравиться</h2>
      <div className="product-grid">
        {sorted.slice(0, 4).map((p) => (
          <ProductCard p={p} key={p.id} />
        ))}
      </div>
    </section>
  );
}
export default function Screens({ path }: { path: string[] }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [user, setUser] = useState<any>(undefined);
  const [settings, setSettings] = useState<any>({});
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([api('catalog'), api('auth/me'), api('settings')])
      .then(([p, u, s]) => {
        setProducts(p);
        setUser(u);
        setSettings(s);
      })
      .catch((e) => setError(e.message));
  }, []);
  const name = path[0];
  // Панель команды — отдельное приложение со своей боковой навигацией, без шапки и подвала витрины.
  if (name === 'admin') return <Admin user={error ? null : user} setUser={setUser} />;
  return (
    <Shell>
      {error && <p className="error" role="alert">{error}</p>}
      {user === undefined && !error ? (
        <section className="page-loading" role="status" aria-label="Загрузка страницы">
          <span className="skel skel-line" style={{ width: 180 }} />
          <div className="product-grid" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div className="loading-card" key={i} />
            ))}
          </div>
        </section>
      ) : name === 'product' ? (
        <ProductDetail id={path[1]} products={products} />
      ) : name === 'catalog' ? (
        <Catalog products={products} />
      ) : name === 'cart' ? (
        <Cart products={products} settings={settings} />
      ) : name === 'checkout' ? (
        <Checkout products={products} user={user} settings={settings} />
      ) : name === 'request' ? (
        <RequestForm />
      ) : ['login', 'register', 'forgot', 'reset', 'setup'].includes(name) ? (
        <Auth name={name} setUser={setUser} />
      ) : name === 'profile' ? (
        <Profile user={user} setUser={setUser} />
      ) : name === 'orders' ? (
        <Orders user={user} settings={settings} id={path[1]} />
      ) : name === 'payment' ? (
        <Payment settings={settings} />
      ) : name === 'success' ? (
        <Success />
      ) : ['search', 'favorites', 'brands', 'sale'].includes(name) ? (
        <Listing kind={name} products={products} />
      ) : name === 'unsubscribe' ? (
        <Unsubscribe />
      ) : name === 'info' ? (
        <Info topic={path[1]} settings={settings} />
      ) : (
        <div className="empty-state">
          <h1>Страница не найдена</h1>
          <Link className="pill" href="/">
            На главную
          </Link>
        </div>
      )}
    </Shell>
  );
}
function ProductDetail({ id, products }: { id: string; products: Product[] }) {
  const p = products.find((p) => p.id === id);
  const [size, setSize] = useState('');
  const added = useCartQuantity(id, size);
  const totalAdded = useCartQuantity(id);
  const { cart: detailCart } = useCart();
  const [photo, setPhoto] = useState(0);
  const [zoom, setZoom] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (!p) return;
    const ids = JSON.parse(localStorage.getItem('hl-history') || '[]');
    if (localStorage.getItem('hl-cookie-choice') === 'yes')
      localStorage.setItem(
        'hl-history',
        JSON.stringify([id, ...ids.filter((x: string) => x !== id)].slice(0, 20)),
      );
    setSize(p.sizes.length === 1 ? p.sizes[0] : '');
  }, [id, p]);
  if (!p)
    return (
      products.length ? (
        <div className="empty-state">
          <h1>Товар недоступен</h1>
          <Link href="/">В каталог</Link>
        </div>
      ) : (
        <PageSkeleton label="Загрузка товара" variant="product" />
      )
    );
  const variants = (p as any).variants;
  const selectedStock = variants?.find((v: any) => v.size === size)?.stock;
  const atLimit =
    !!size && (typeof selectedStock === 'number' ? added >= selectedStock : totalAdded >= p.stock);
  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Главная</Link> / {p.availability === 'stock' ? 'В наличии в РФ' : 'Под заказ'} /{' '}
        {p.name}
      </div>
      <div className="product-detail">
        <div className="gallery">
          <div className="thumbnails">
            {(p.gallery?.length ? p.gallery : [p.image]).map((src, i) => (
              <button
                key={src}
                className={photo === i ? 'selected' : ''}
                aria-label={'Фото ' + (i + 1)}
                onClick={() => setPhoto(i)}
              >
                <ProductImage p={p} src={p.gallery?.length ? src : undefined} />
              </button>
            ))}
          </div>
          <button
            data-unavailable={p.stock <= 0 ? 'true' : undefined}
            className="main-photo"
            id="main-photo"
            aria-label="Увеличить фото"
            onClick={() => setZoom(true)}
          >
            <ProductImage p={p} src={p.gallery?.[photo]} />
            <span className="main-photo-zoom" aria-hidden="true">
              <IconExpand />
            </span>
          </button>
        </div>
        <div className="product-info">
          <h1>{nbspShort(p.name)}</h1>
          <div className="row">
            <strong>{p.brand}</strong>
            <small>Артикул: {p.id}</small>
          </div>
          <h2 className="product-price">
            <PriceTag p={p} />
          </h2>
          <ProductPromotions p={p} />
          <p className="subdued">
            {p.condition} ·{' '}
            {p.availability === 'stock' ? 'В наличии в РФ · от 2 дней' : 'Под заказ · 15 дней'}
          </p>
          {p.color && p.colorHex && (
            <div className="product-color-row">
              <span
                className="product-color-swatch"
                style={{ backgroundColor: p.colorHex }}
                role="img"
                aria-label={p.color}
              />
              <span>{p.color}</span>
            </div>
          )}
          <strong id="size-label">Размер</strong>
          <div className="size-row" role="group" aria-labelledby="size-label">
            {p.sizes.map((s) => {
              const stock = variants?.find((v: any) => v.size === s)?.stock;
              const count = detailCart
                .filter((row) => row.id === id && row.size === s)
                .reduce((sum, row) => sum + row.qty, 0);
              const unavailable = p.stock <= 0 || stock === 0;
              const inCart = !unavailable && typeof stock === 'number' && count >= stock;
              return (
                <button
                  className={inCart ? 'size-exhausted' : size === s ? 'selected' : ''}
                  key={s}
                  data-unavailable={unavailable ? 'true' : undefined}
                  data-cart-limit={inCart ? 'true' : undefined}
                  aria-pressed={size === s}
                  onClick={() => setSize(s)}
                  disabled={unavailable || inCart}
                >
                  {s}
                </button>
              );
            })}
          </div>
          {!totalAdded ? (
            <div className="stack">
              <button
                className="pill"
                disabled={!size || atLimit}
                data-hint={
                  !size ? 'Сначала выберите размер' : atLimit ? 'Этот размер уже весь в корзине' : undefined
                }
                onClick={() => {
                  addCart(id, size);
                  router.push(
                    '/checkout?buy=' + encodeURIComponent(id) + '&size=' + encodeURIComponent(size),
                  );
                }}
              >
                Заказать в 1 клик →
              </button>
              <button
                className="pill solid"
                disabled={!size || atLimit}
                data-hint={
                  !size ? 'Сначала выберите размер' : atLimit ? 'Этот размер уже весь в корзине' : undefined
                }
                onClick={() => {
                  addCart(id, size);
                  // кнопка заменяется блоком «в корзине» — переносим фокус клавиатуры на него
                  requestAnimationFrame(() =>
                    document.querySelector<HTMLElement>('.cart-added-controls button')?.focus({ preventScroll: true }),
                  )
                }}
              >
                В КОРЗИНУ
              </button>
            </div>
          ) : (
            <CartAddedControls
              onRemove={() => removeCartUnit(id)}
              quantity={totalAdded}
              disabled={!size || atLimit}
              disabledReason={
                !size
                  ? 'Выберите размер'
                  : atLimit
                    ? 'Размер ' + size + ' уже в корзине: ' + added + ' шт.'
                    : undefined
              }
              onAdd={() => addCart(id, size)}
            />
          )}
          {!size && <p className="subdued">Выберите размер, чтобы добавить вещь.</p>}
          <div className="product-accordions">
            <details>
              <summary>О ВЕЩИ</summary>
              <p>{p.description}</p>
              <p>Состояние: {p.condition}. Размеры указаны по маркировке бренда.</p>
            </details>
            <details>
              <summary>ДОСТАВКА</summary>
              <p>
                {p.availability === 'stock' ? 'Со склада в РФ от 2 дней.' : 'Доставка в РФ за 15 дней.'}{' '}
                Доставка СДЭК или Яндексом по РФ оплачивается отдельно перевозчику.
              </p>
            </details>
            <details>
              <summary>ОРИГИНАЛЬНОСТЬ</summary>
              <p>Перед покупкой вы можете запросить фотографии бирок и уточнить детали у менеджера.</p>
            </details>
          </div>
        </div>
      </div>
      <Recommendations products={products} exclude={id} />
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent
          className="zoom-dialog"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById('main-photo')?.focus({ preventScroll: true });
          }}
        >
          <DialogTitle>{p.name}</DialogTitle>
          <ProductImage p={p} src={p.gallery?.[photo]} />
        </DialogContent>
      </Dialog>
    </>
  );
}
export type CartRow = { id: string; size: string; qty: number };
function useCart() {
  const [cart, setCart] = useState<CartRow[]>([]);
  useEffect(() => {
    const load = () => {
      try {
        setCart(JSON.parse(localStorage.getItem('hl-cart') || '[]'));
      } catch {
        setCart([]);
      }
    };
    load();
    window.addEventListener('cart-change', load);
    window.addEventListener('cart-hydrated', load);
    return () => {
      window.removeEventListener('cart-change', load);
      window.removeEventListener('cart-hydrated', load);
    };
  }, []);
  function save(rows: CartRow[]) {
    setCart(rows);
    localStorage.setItem('hl-cart', JSON.stringify(rows));
    syncState();
    window.dispatchEvent(new Event('cart-change'));
  }
  return { cart, save };
}
function Cart({ products, settings }: { products: Product[]; settings: any }) {
  const { cart, save } = useCart();
  const prices = linePrices(cart, products);
  const lines = cart.map((r, i) => ({ r, i, p: products.find((p) => p.id === r.id), price: prices[i] }));
  const pricing = localPricing(cart, products, settings?.promotions || []);
  const hasUnavailable = lines.some((l) => !l.p);
  const missingSize = lines.some((l) => l.p && !l.r.size);
  // Сколько ещё можно добавить этого размера: остаток размера минус уже лежащее в других строках корзины.
  const sizeRoom = (i: number) => {
    const row = cart[i];
    const p = products.find((x) => x.id === row.id) as (Product & { variants?: { size: string; stock: number }[] }) | undefined;
    if (!p) return 0;
    const stock = p.variants?.find((v) => v.size === row.size)?.stock ?? p.stock;
    const others = cart.reduce((n, x, j) => (j !== i && x.id === row.id && x.size === row.size ? n + x.qty : n), 0);
    return stock - others - row.qty;
  };
  return (
    <section className="cart-page">
      <div className="breadcrumb">Главная / Корзина</div>
      <h1 className="section-title">Корзина</h1>
      {!cart.length ? (
        <div className="empty-state">
          <h2>В корзине пока пусто</h2>
          <Link href="/#catalog" className="pill">
            Выбрать вещь
          </Link>
        </div>
      ) : (
        <div className="split">
          <div>
            {['preorder', 'stock', 'unavailable'].map((group) => {
              const rows = lines.filter((l) =>
                group === 'unavailable' ? !l.p : l.p?.availability === group,
              );
              if (!rows.length) return null;
              return (
                <section className="cart-group" key={group}>
                  <h2>
                    {group === 'stock'
                      ? 'В наличии в РФ'
                      : group === 'preorder'
                        ? 'Под заказ из-за рубежа'
                        : 'Недоступные вещи'}
                  </h2>
                  <p className="subdued">
                    {group === 'preorder'
                      ? 'Приедут в РФ за 15 дней. Отдельная посылка.'
                      : group === 'stock'
                        ? 'Доставка от 2 дней. Отдельная посылка.'
                        : 'Удалите недоступные позиции перед оформлением.'}
                  </p>
                  {rows.map(({ p, r, i }) => (
                    <div className="cart-row" key={i}>
                      {p ? (
                        <Link href={'/product/' + p.id}>
                          <ProductImage p={p} />
                        </Link>
                      ) : (
                        <div />
                      )}
                      <div>
                        <Link href={p ? '/product/' + p.id : '#'}>
                          <strong>{nbspShort(p?.name || r.id)}</strong>
                        </Link>
                        <p className="subdued">{p?.condition}</p>
                        {p && (
                          <Choice
                            label="Размер"
                            value={r.size}
                            onChange={(v) => save(cart.map((x, j) => (j === i ? { ...x, size: v } : x)))}
                            items={p.sizes.filter(
                              (s) => (p as any).variants?.find((v: any) => v.size === s)?.stock !== 0,
                            )}
                          />
                        )}
                      </div>
                      <div className="cart-controls">
                        <strong className="cart-line-price">
                          {p && (pricing.lineDiscounts[i] > 0 || (p.compareAt || 0) > p.price) && (
                            <s>{rub(((p.compareAt || 0) > p.price ? p.compareAt! : lines[i].price) * r.qty)}</s>
                          )}
                          {p ? rub(lines[i].price * r.qty - (pricing.lineDiscounts[i] || 0)) : '—'}
                        </strong>
                        {p?.promo && lines[i].price === 1 && <small className="subdued">по акции</small>}
                        {pricing.lineDiscounts[i] > 0 && <small className="cart-line-promo">по акции</small>}
                        <div className="quantity-control">
                          <button
                            aria-label={'Уменьшить количество: ' + (p?.name || r.id)}
                            onClick={() =>
                              save(cart.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))
                            }
                          >
                            −
                          </button>
                          <span aria-live="polite">{r.qty}</span>
                          <button
                            aria-label={'Увеличить количество: ' + (p?.name || r.id)}
                            disabled={!p || sizeRoom(i) <= 0}
                            data-hint={p && sizeRoom(i) <= 0 ? 'Больше нет в наличии в этом размере' : undefined}
                            onClick={() => save(cart.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))}
                          >
                            +
                          </button>
                        </div>
                        <button
                          className="remove"
                          aria-label={'Удалить из корзины: ' + (p?.name || r.id) + ', размер ' + r.size}
                          onClick={() => {
                            const before = cart;
                            save(cart.filter((_, j) => j !== i));
                            toast('Вещь удалена из корзины', {
                              action: { label: 'Вернуть', onClick: () => save(before) },
                            });
                            // фокус — на соседнюю вещь или на заголовок, а не в пустоту
                            requestAnimationFrame(() =>
                              (
                                document.querySelectorAll('.cart-row')[i]?.querySelector<HTMLElement>('a') ||
                                document.querySelectorAll('.cart-row')[i - 1]?.querySelector<HTMLElement>('a') ||
                                document.getElementById('main')
                              )?.focus({ preventScroll: true }),
                            );
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
          <aside className="panel summary">
            <h2>Ваш заказ</h2>
            <PricingRows pricing={pricing} oneRubleDelivery={cart.length === 1 && prices[0] === 1} />
            <p className="subdued">
              {pricing.freeShipping
                ? 'Доставка бесплатная: ' + pricing.shippingReason + '.'
                : 'Доставка оплачивается отдельно в приложении перевозчика за каждую посылку. Для акционного товара за 1 ₽ доставка бесплатная.'}{' '}
              Промокод можно ввести при оформлении.
            </p>
            {hasUnavailable || missingSize ? (
              <button
                className="pill"
                disabled
                data-hint={hasUnavailable ? 'Удалите недоступные вещи из корзины' : 'Выберите размер для каждой вещи'}
              >
                Оформить заказ →
              </button>
            ) : (
              <Link className="pill" href="/checkout">
                Оформить заказ →
              </Link>
            )}
            {hasUnavailable && <p className="error">В корзине есть вещи, которых больше нет. Удалите их перед оформлением.</p>}
            {missingSize && <p className="subdued">Перед оплатой выберите размеры.</p>}
          </aside>
        </div>
      )}
      <Recommendations products={products} />
    </section>
  );
}
function Auth({ name, setUser }: { name: string; setUser: (u: any) => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // Вход: по российскому номеру с SMS-кодом или по email и паролю (149-ФЗ ст. 8 ч. 10)
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [needPhone, setNeedPhone] = useState(false);
  const setup = name === 'setup',
    register = name === 'register',
    login = name === 'login';
  const byPhone = login && mode === 'phone';
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (register && !consent) {
      setMessage('Отметьте согласие на обработку персональных данных.');
      e.currentTarget.querySelector<HTMLElement>('.consent [role=checkbox]')?.focus();
      return;
    }
    setBusy(true);
    setMessage('');
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const path = setup
        ? 'setup'
        : name === 'reset'
          ? 'reset'
          : name === 'forgot'
            ? 'forgot'
            : register
              ? 'register'
              : byPhone
                ? 'phone-login'
                : 'login';
      const r = await fetch('/api/auth/' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, consent, marketing, token: params.get('token') }),
      });
      const result = await r.json().catch(() => ({}));
      if (r.status === 428 && result.needPhone) {
        setNeedPhone(true);
        setMessage('');
        return;
      }
      if (!r.ok) throw new Error(result.error || 'Не получилось. Попробуйте ещё раз');
      if (name === 'forgot') {
        setMessage('Восстановить пароль по почте пока нельзя. Войдите по номеру телефона или напишите менеджеру.');
      } else if (name === 'reset') {
        router.push('/login');
      } else {
        setUser(result);
        const ret = params.get('return');
        router.push(setup ? '/admin' : safeReturn(ret, '/profile'));
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-card panel">
      <small>HAUTELINE</small>
      <h1>
        {setup
          ? 'Создать владельца'
          : register
            ? 'Создать аккаунт'
            : name === 'forgot'
              ? 'Восстановить доступ'
              : name === 'reset'
                ? 'Новый пароль'
                : 'Вход'}
      </h1>
      {setup && (
        <p className="notice">
          Первичная настройка доступна только локально и только до создания первого владельца.
        </p>
      )}
      {login && (
        <div className="auth-modes" role="tablist" aria-label="Способ входа">
          {(
            [
              ['phone', 'По номеру телефона'],
              ['email', 'По почте и паролю'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              className={mode === id ? 'is-active' : ''}
              onClick={() => {
                setMode(id);
                setMessage('');
                setNeedPhone(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={submit} key={login ? mode : name}>
        {byPhone ? (
          <PhoneVerify purpose="login" />
        ) : (
          <>
            {name !== 'reset' && (
              <Field
                label="Электронная почта"
                name="email"
                type="email"
                autoComplete={login ? 'username' : 'email'}
                required
              />
            )}
            {(register || setup) && <Field label="Как вас зовут" name="name" autoComplete="name" required />}
            {name !== 'forgot' && (
              <label className="form-field">
                Пароль
                <input
                  name="password"
                  type="password"
                  required
                  minLength={setup ? 12 : register || name === 'reset' ? 10 : 1}
                  maxLength={128}
                  autoComplete={login ? 'current-password' : 'new-password'}
                />
              </label>
            )}
            {register && <PhoneVerify purpose="register" />}
            {login && needPhone && (
              <div className="auth-link-phone">
                <p className="notice">
                  По закону вход на российские сайты подтверждается российским номером телефона. Привяжите номер один
                  раз, и дальше можно входить и по нему, и по паролю.
                </p>
                <PhoneVerify purpose="link" />
              </div>
            )}
          </>
        )}
        {register && (
          <div className="stack consent-stack">
            <Consent checked={consent} onChange={setConsent} />
            <Consent checked={marketing} onChange={setMarketing} marketing />
          </div>
        )}
        {message && (
          <p className={name === 'forgot' ? 'notice' : 'error'} role={name === 'forgot' ? 'status' : 'alert'}>
            {message}
          </p>
        )}
        <button
          className="pill"
          disabled={busy}
          aria-disabled={register && !consent}
          data-hint={
            !busy && register && !consent ? 'Отметьте согласие на обработку персональных данных' : undefined
          }
        >
          {busy
            ? 'Подождите…'
            : register || setup
              ? 'Создать аккаунт'
              : name === 'forgot'
                ? 'Отправить письмо'
                : name === 'reset'
                  ? 'Сохранить пароль'
                  : 'Войти'}
        </button>
        {register && (
          <p className="auth-legal">
            Регистрируясь, вы принимаете условия <Link href="/info/offer">публичной оферты</Link>. Данные обрабатываем по{' '}
            <Link href="/info/privacy">политике</Link>.
          </p>
        )}
      </form>
      {login && (
        <>
          <div className="auth-links">
            <Link href={'/register?return=' + encodeURIComponent(params.get('return') || '/profile')}>
              Регистрация
            </Link>
            {mode === 'email' && <Link href="/forgot">Забыли пароль?</Link>}
          </div>
          <div className="identity-divider">
            <span>или через</span>
          </div>
          <div className="identity-providers">
            <button
              className="identity-button identity-yandex"
              aria-label="Войти через Яндекс ID"
              title="Яндекс ID"
              onClick={() => toast.info('Вход через Яндекс ID скоро появится. Пока войдите по номеру телефона')}
            >
              <span aria-hidden="true">Я</span>
            </button>
            <button
              className="identity-button identity-vk"
              aria-label="Войти через VK ID"
              title="VK ID"
              onClick={() => toast.info('Вход через VK ID скоро появится. Пока войдите по номеру телефона')}
            >
              <span aria-hidden="true">VK</span>
            </button>
          </div>
        </>
      )}
    </section>
  );
}
function Checkout({ products, user, settings }: { products: Product[]; user: any; settings: any }) {
  const { cart, save } = useCart();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftReady, setDraftReady] = useState(false);
  const [authStep, setAuthStep] = useState(false);
  const [carrier, setCarrier] = useState('СДЭК');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const params = useSearchParams();
  const router = useRouter();
  const direct = params.get('buy');
  const returnUrl =
    '/checkout' +
    (direct
      ? '?buy=' + encodeURIComponent(direct) + '&size=' + encodeURIComponent(params.get('size') || '')
      : '');
  const draftKey = 'hl-checkout-draft:' + returnUrl;
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) || '{}');
      setDraft(saved.fields || {});
      setCarrier(saved.carrier || 'СДЭК');
      setConsent(!!saved.consent);
    } catch {}
    setDraftReady(true);
  }, [draftKey]);
  const persistDraft = (form: HTMLFormElement) => {
    const fields = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setDraft(fields);
    sessionStorage.setItem(draftKey, JSON.stringify({ fields, carrier, consent }));
  };
  const directProduct = products.find((p) => p.id === direct);
  const directSize = params.get('size') || '';
  const lines = direct
    ? directProduct && directProduct.sizes.includes(directSize)
      ? [{ id: direct, size: directSize, qty: 1 }]
      : []
    : cart;
  const localPrices = linePrices(lines, products);
  // Когда покупатель вошёл, цены подтверждает сервер (/quote) — показываем их, а не локальный расчёт.
  const priceOf = (i: number) => (quote?.items?.[i]?.available ? quote.items[i].price : localPrices[i]);
  const unavailable = lines.some(
    (r, i) => !products.find((p) => p.id === r.id) || quote?.items?.[i]?.available === false,
  );
  // Промокод: применённый код хранится вместе с черновиком оформления
  const codeKey = draftKey + ':code';
  const [promoCode, setPromoCode] = useState('');
  const [promoInput, setPromoInput] = useState('');
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(codeKey) || '';
      setPromoCode(saved);
      setPromoInput(saved);
    } catch {}
  }, [codeKey]);
  const applyCode = (value: string) => {
    const v = value.trim().toUpperCase();
    setPromoCode(v);
    setPromoInput(v);
    try {
      if (v) sessionStorage.setItem(codeKey, v);
      else sessionStorage.removeItem(codeKey);
    } catch {}
  };
  useEffect(() => {
    if (lines.length)
      api('quote', { items: lines, promoCode })
        .then(setQuote)
        .catch(() => setQuote(null));
  }, [user, JSON.stringify(lines), promoCode]);
  // Цены и скидки подтверждает сервер (/quote); пока ответа нет — тот же расчёт в браузере, без кода.
  const pricing: PricingResult = quote?.pricing ?? localPricing(lines, products, settings?.promotions || []);
  if (user === undefined || !draftReady) return <PageSkeleton label="Загрузка оформления" variant="form" />;
  if (authStep && !user)
    return (
      <section className="empty-state">
        <h1>Завершите оформление</h1>
        <p>Данные заказа сохранены. Создайте аккаунт или войдите, чтобы продолжить к оплате.</p>
        <Link className="pill" href={'/register?return=' + encodeURIComponent(returnUrl)}>
          Создать аккаунт и продолжить →
        </Link>
        <p>
          <Link className="outline-link" href={'/login?return=' + encodeURIComponent(returnUrl)}>
            Уже есть аккаунт? Войти
          </Link>
        </p>
        <button className="pill secondary" onClick={() => setAuthStep(false)}>
          Вернуться к данным заказа
        </button>
      </section>
    );
  if (!lines.length)
    return (
      <div className="empty-state">
        <h1>В корзине пока пусто</h1>
        <Link href="/catalog" className="pill">
          Выбрать вещь
        </Link>
      </div>
    );
  return (
    <>
      <div className="breadcrumb">Корзина / Оформление заказа</div>
      <h1 className="checkout-title">
        <span className="figma-art checkout-heading-art" role="img" aria-label="Оформление заказа" />
      </h1>
      <form
        className="split figma-checkout"
        onChange={(e) => persistDraft(e.currentTarget)}
        onSubmit={async (e) => {
          e.preventDefault();
          persistDraft(e.currentTarget);
          // кнопка не отключается совсем, чтобы до неё доходила клавиатура; причину показываем и ведём к полю
          if (busy || unavailable || lines.some((r) => !r.size)) return;
          if (!consent) {
            setError('Отметьте согласие на обработку персональных данных под кнопкой.');
            document.querySelector<HTMLInputElement>('.checkout-consent-input')?.focus();
            return;
          }
          if (!user) {
            setAuthStep(true);
            return;
          }
          setBusy(true);
          setError('');
          try {
            const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
            // Один ключ на попытку оформления: повтор после обрыва связи вернёт тот же заказ, а не новый.
            const keyName = draftKey + ':key';
            const key = sessionStorage.getItem(keyName) || newKey();
            sessionStorage.setItem(keyName, key);
            const deliveryCarrier = (data.deliveryMode || '').includes('Яндекс') ? 'Яндекс Доставка' : 'СДЭК';
            const result = await api('orders', {
              ...data,
              key,
              items: lines,
              carrier: deliveryCarrier,
              consent,
              promoCode: pricing.code?.ok ? promoCode : '',
            });
            sessionStorage.setItem('hl-payment', JSON.stringify(result));
            // Черновик формы оставляем до успешной оплаты: если оплата не пройдёт, заново вводить ничего не нужно.
            sessionStorage.removeItem(keyName);
            router.push('/payment');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="stack">
          <section className="panel">
            <h2>
              <em>01</em>
              <span className="figma-art checkout-personal-art" role="img" aria-label="Личные данные" />
            </h2>
            <div className="form-grid">
              <Field
                label="Имя и фамилия"
                name="name"
                autoComplete="name"
                placeholder="Как к вам обращаться"
                defaultValue={draft.name ?? user?.name ?? ''}
                required
              />
              <PhoneField
                label="Телефон"
                name="phone"
                defaultValue={draft.phone ?? user?.phone ?? ''}
                defaultCountry={draft.phoneCountry}
                required
              />
              <Field
                label="Почта"
                name="email"
                autoComplete="email"
                placeholder="example@mail.ru"
                type="email"
                defaultValue={draft.email ?? user?.email ?? ''}
                required
              />
            </div>
            <fieldset className="checkout-contact">
              <legend className="sr-only">Как с вами связаться</legend>
              <small className="checkout-contact-label" aria-hidden="true">
                Как с вами связаться
              </small>
              {['Почта', 'Telegram', 'MAX'].map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="contactMethod"
                    value={value}
                    defaultChecked={(draft.contactMethod || 'Telegram') === value}
                  />
                  <span>{value}</span>
                </label>
              ))}
            </fieldset>
          </section>
          <section className="panel">
            <h2>
              <em>02</em>
              <span className="figma-art checkout-delivery-art" role="img" aria-label="Доставка" />
            </h2>
            <fieldset className="checkout-delivery-options" aria-label="Способ доставки">
              {[
                ['Курьер Яндекс', 'Яндекс Доставка'],
                ['Курьер СДЭК', 'СДЭК'],
                ['ПВЗ СДЭК', 'СДЭК'],
                ['ПВЗ Яндекс', 'Яндекс Доставка'],
              ].map(([label, provider]) => (
                <label key={label}>
                  <input
                    type="radio"
                    name="deliveryMode"
                    value={label}
                    defaultChecked={(draft.deliveryMode || 'Курьер СДЭК') === label}
                    onChange={() => setCarrier(provider)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <Field
              label="Адрес"
              name="address"
              autoComplete="shipping street-address"
              placeholder="Город, улица, дом, квартира"
              defaultValue={draft.address ?? user?.address ?? ''}
              required
            />
            <p className="checkout-address-help">Укажите адрес для расчёта доступных способов доставки.</p>
            <Field
              label="Комментарий к заказу · необязательно"
              name="comment"
              placeholder="Например, как найти вход"
              defaultValue={draft.comment || ''}
            />
          </section>
          <section className="panel checkout-payment">
            <h2>
              <em>03</em>
              <span className="figma-art checkout-payment-art" role="img" aria-label="Способ оплаты" />
            </h2>
            <div className="checkout-payment-grid" role="radiogroup" aria-label="Способ оплаты">
              {['СБП', 'Картой', 'Сплит', 'Долями'].map((method, i) => (
                <label key={method}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={method}
                    defaultChecked={(draft.paymentMethod || 'СБП') === method}
                  />
                  <span>
                    <b>
                      <img
                        src={
                          '/figma/checkout/' +
                          ['d800b.svg', 'c4c8a.svg', 'ab725.svg', 'b6213.svg'][i]
                        }
                        alt=""
                      />
                    </b>
                    <strong>{method}</strong>
                    <small>
                      {
                        [
                          'Быстрый перевод',
                          'Банковская карта',
                          'Яндекс Пэй',
                          'Оплата частями',
                        ][i]
                      }
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <p className="checkout-payment-help">Выберите удобный способ оплаты заказа.</p>
          </section>
        </div>
        <aside className="panel summary checkout-summary">
          <h2>
            <span className="figma-art checkout-summary-art" role="img" aria-label="Ваш заказ" />
          </h2>
          <div className="checkout-order-items">
            {lines.map((row, i) => {
              const product = products.find((p) => p.id === row.id);
              return (
                <div className="checkout-order-item" key={i}>
                  {product && <ProductImage p={product} />}
                  <div>
                    <strong>{nbspShort(product?.name || '')}</strong>
                    <b>{product?.brand}</b>
                    <small>
                      Размер: {row.size} · {row.qty} шт.
                    </small>
                    <strong className="cart-line-price">
                      {product && (pricing.lineDiscounts[i] > 0 || (product.compareAt || 0) > product.price) && (
                        <s>
                          {rub(((product.compareAt || 0) > product.price ? product.compareAt! : priceOf(i)) * row.qty)}
                        </s>
                      )}
                      {product ? rub(priceOf(i) * row.qty - (pricing.lineDiscounts[i] || 0)) : 'Недоступна'}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="promo-field">
            <label htmlFor="promo-code">Промокод</label>
            <div>
              <input
                id="promo-code"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyCode(promoInput);
                  }
                }}
                placeholder="Если есть"
                autoComplete="off"
                spellCheck={false}
              />
              {promoCode && promoInput === promoCode ? (
                <button type="button" onClick={() => applyCode('')}>
                  Убрать
                </button>
              ) : (
                <button type="button" disabled={!promoInput.trim()} onClick={() => applyCode(promoInput)}>
                  Применить
                </button>
              )}
            </div>
            <p role="status" className="promo-status">
              {pricing.code && (
                <small className={pricing.code.ok ? 'is-ok' : 'is-error'}>{pricing.code.message}</small>
              )}
            </p>
          </div>
          <PricingRows pricing={pricing} oneRubleDelivery={!!quote?.freeDelivery} />
          {error && <p className="error" role="alert">{error}</p>}
          {unavailable && (
            <p className="error">
              Некоторых вещей больше нет в наличии. <Link href="/cart">Вернитесь в корзину</Link> и удалите их.
            </p>
          )}
          <button
            className="pill"
            aria-disabled={busy || !consent || unavailable || lines.some((r) => !r.size)}
            data-hint={
              busy
                ? undefined
                : unavailable
                  ? 'Удалите из корзины вещи, которых нет в наличии'
                  : lines.some((r) => !r.size)
                  ? 'Выберите размер для каждой вещи в корзине'
                  : !consent
                    ? 'Отметьте согласие на обработку персональных данных'
                    : undefined
            }
          >
            <span
              className="figma-art checkout-submit-art"
              role="img"
              aria-label={busy ? 'Проверяем наличие' : 'Оформить заказ'}
            />
            <img className="checkout-submit-arrow" src="/figma/checkout/d9f6d.svg" alt="" />
          </button>
          <label className="consent checkout-consent">
            <input
              className="checkout-consent-input"
              type="checkbox"
              name="checkoutConsent"
              checked={consent}
              onChange={(event) => {
                setConsent(event.target.checked);
                if (event.target.checked) setError('');
              }}
            />
            <span>
              Даю{' '}
              <Link href="/info/consent" className="outline-link" target="_blank">
                согласие на обработку
                <br />
                персональных данных
              </Link>
            </span>
          </label>
          <p className="checkout-privacy-note">
            Нажимая кнопку, вы принимаете условия <Link href="/info/offer">публичной оферты</Link> и{' '}
            <Link href="/info/returns">возврата</Link>.
          </p>
        </aside>
      </form>
      <div className="checkout-help">
        <strong>Есть вопрос по заказу?</strong>
        <span>Поможем с оплатой и доставкой.</span>
        {settings?.telegram ? (
          <a className="pill" href={settings.telegram} target="_blank" rel="noreferrer">
            Задать вопрос менеджеру
          </a>
        ) : (
          <Link className="pill" href="/info/contacts">
            Задать вопрос менеджеру
          </Link>
        )}
      </div>
    </>
  );
}
function Payment({ settings }: { settings: any }) {
  const [order, setOrder] = useState<any>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => {
    setOrder(JSON.parse(sessionStorage.getItem('hl-payment') || 'null'));
  }, []);
  useEffect(() => {
    if (!order) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((order.expires - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [order]);
  async function pay(result: string) {
    setBusy(true);
    setError('');
    try {
      const r = await api(settings.testMode ? 'orders/test-payment' : 'payment', { id: order.id, result });
      if (!r.ok) {
        setError(r.error);
        setLeft(0);
        return;
      }
      const remaining: CartRow[] = JSON.parse(localStorage.getItem('hl-cart') || '[]');
      for (const item of order.data.items) {
        const row = remaining.find((x) => x.id === item.id && x.size === item.size);
        if (row) row.qty = Math.max(0, row.qty - item.qty);
      }
      localStorage.setItem('hl-cart', JSON.stringify(remaining.filter((x) => x.qty > 0)));
      await syncState();
      window.dispatchEvent(new Event('cart-change'));
      sessionStorage.setItem('hl-last-order', order.id);
      sessionStorage.removeItem('hl-payment');
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith('hl-checkout-draft:')) sessionStorage.removeItem(key);
      router.push('/success');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-card panel">
      <h1>Оплата заказа</h1>
      {order ? (
        <>
          <p>Заказ {order.id}</p>
          <h2>{rub(order.total)}</h2>
          <p>
            Резерв:{' '}
            <strong>
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            </strong>
          </p>
          {order.data.freeDelivery && <p>Доставка бесплатная.</p>}
          {error && <p className="error" role="alert">{error}</p>}
          {settings.testMode ? (
            <>
              <p className="notice">Тестовый режим. Эти кнопки проверяют сценарий; деньги не списываются.</p>
              <div className="stack">
                <button
                  className="pill"
                  disabled={!left || busy}
                  data-hint={!left ? 'Время резерва истекло. Оформите заказ снова' : undefined}
                  onClick={() => pay('success')}
                >
                  Проверить успешную оплату
                </button>
                <button
                  className="pill secondary"
                  disabled={!left || busy}
                  data-hint={!left ? 'Время резерва истекло. Оформите заказ снова' : undefined}
                  onClick={() => pay('fail')}
                >
                  Проверить отказ оплаты
                </button>
              </div>
            </>
          ) : (
            <button className="pill" onClick={() => pay('success')}>
              Перейти к оплате
            </button>
          )}
          {!left && (
            <Link href="/checkout" className="outline-link">
              Проверить наличие и оформить снова
            </Link>
          )}
        </>
      ) : (
        <p>
          Нет заказа для оплаты. <Link href="/cart">Откройте корзину.</Link>
        </p>
      )}
    </section>
  );
}
function Success() {
  // номер только что оплаченного заказа: кнопка статуса ведёт прямо к нему
  const [orderId, setOrderId] = useState('');
  useEffect(() => {
    setOrderId(sessionStorage.getItem('hl-last-order') || '');
  }, []);
  return (
    <>
      <div className="breadcrumb">Корзина / Оформление заказа / Заказ оформлен</div>
      <section className="figma-success">
        <div className="success-badge" aria-hidden="true">
          <svg viewBox="0 0 34 34">
            <path d="M8 17.5 14.5 24 26.5 10.5" />
          </svg>
        </div>
        <h1 className="success-title">Спасибо за заказ</h1>
        <p className="success-lead">Ваш заказ оформлен.</p>
        <p className="success-sub">Спасибо, что выбираете Hauteline.</p>
        <Link className="success-status" href={orderId ? '/orders/' + encodeURIComponent(orderId) : '/orders'}>
          <span>Статус заказа вы сможете увидеть здесь</span>
          <img src="/figma/checkout/d9f6d.svg" alt="" />
        </Link>
        <p className="success-note">Все этапы доставки от зарубежного склада до вас.</p>
        <Link className="success-continue" href="/catalog">
          Продолжить покупки
          <svg viewBox="0 0 16 14" aria-hidden="true">
            <path d="M1 7h13M9 2l5 5-5 5" />
          </svg>
        </Link>
      </section>
      <div className="checkout-help success-help">
        <strong>Есть вопрос по заказу?</strong>
        <span>Поможем с оплатой и доставкой.</span>
        <Link className="pill" href="/info/contacts">
          Задать вопрос менеджеру
        </Link>
      </div>
    </>
  );
}
function Profile({ user, setUser }: { user: any; setUser: (u: any) => void }) {
  const router = useRouter();
  if (user === undefined) return <PageSkeleton label="Загрузка профиля" variant="form" />;
  if (!user) return <Auth name="login" setUser={setUser} />;
  return (
    <>
      <h1>Личный кабинет</h1>
      <div className="profile-layout">
        <nav className="profile-nav">
          <Link href="/profile">Личные данные</Link>
          <Link href="/orders">Мои посылки</Link>
          <Link href="/favorites">Избранное</Link>
          {user.role !== 'customer' && <Link href="/admin">Панель команды</Link>}
          <button
            onClick={async () => {
              await api('auth/logout', {});
              for (const key of ['hl-cart', 'hl-favorites', 'hl-state-user']) localStorage.removeItem(key);
              window.dispatchEvent(new Event('cart-change'));
              setUser(null);
              router.push('/');
            }}
          >
            Выйти
          </button>
        </nav>
        <section className="panel">
          <h2>Личные данные</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api('profile', Object.fromEntries(new FormData(e.currentTarget)));
                setUser(await api('auth/me'));
                toast.success('Данные сохранены');
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <Field label="ФИО" name="name" autoComplete="name" defaultValue={user.name} />
            <PhoneField label="Телефон" name="phone" defaultValue={user.phone} />
            <Field label="Адрес доставки" name="address" autoComplete="shipping street-address" defaultValue={user.address} />
            <p className="subdued">
              Почта: {user.email}. Изменения профиля не меняют ранее оформленные заказы.
            </p>
            <button className="pill profile-save">Сохранить</button>
          </form>
        </section>
        <ProfilePrivacy user={user} setUser={setUser} />
      </div>
    </>
  );
}
/** Согласия и данные: отзыв рассылки и рекомендаций, удаление аккаунта (152-ФЗ ст. 9, 14, 21; 38-ФЗ ст. 18). */
function ProfilePrivacy({ user, setUser }: { user: any; setUser: (u: any) => void }) {
  const router = useRouter();
  const [marketing, setMarketing] = useState(!!user.marketing);
  const [recs, setRecs] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      setRecs(localStorage.getItem('hl-cookie-choice') === 'yes');
    } catch {}
  }, []);
  async function consent(kind: 'marketing' | 'recommendations', granted: boolean) {
    try {
      await api('account/consent', { kind, granted });
      toast.success(granted ? 'Согласие сохранено' : 'Согласие отозвано');
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }
  return (
    <section className="panel profile-privacy">
      <h2>Согласия и данные</h2>
      <p className="profile-login-phone">
        Номер для входа: <b>{user.authPhone || (user.role === 'customer' ? 'не привязан' : 'вход сотрудника по паролю')}</b>
      </p>
      <label className="profile-switch">
        <input
          type="checkbox"
          checked={marketing}
          onChange={async (e) => {
            const v = e.target.checked;
            if (await consent('marketing', v)) {
              setMarketing(v);
              setUser({ ...user, marketing: v ? 1 : 0 });
            }
          }}
        />
        <i aria-hidden="true" />
        <span>
          <b>Реклама и рассылки</b>
          <small>
            Письма о новинках и скидках. <Link href="/info/marketing">Условия</Link>
          </small>
        </span>
      </label>
      <label className="profile-switch">
        <input
          type="checkbox"
          checked={recs}
          onChange={async (e) => {
            const v = e.target.checked;
            if (await consent('recommendations', v)) {
              setRecommendationChoice(v, 'profile');
              setRecs(v);
            }
          }}
        />
        <i aria-hidden="true" />
        <span>
          <b>Персональные рекомендации</b>
          <small>
            Подбор по просмотренным вещам. <Link href="/info/recommendations">Как это работает</Link>
          </small>
        </span>
      </label>
      {user.role === 'customer' && (
        <div className="profile-delete">
          {!confirmDelete ? (
            <button type="button" className="profile-delete-open" onClick={() => setConfirmDelete(true)}>
              Удалить аккаунт и отозвать согласие на обработку данных
            </button>
          ) : (
            <div className="profile-delete-confirm" role="alertdialog" aria-labelledby="delete-title">
              <strong id="delete-title">Удалить аккаунт?</strong>
              <p>
                Удалим профиль, корзину, избранное и подписку. Сведения об оформленных заказах храним столько, сколько
                требует налоговое и бухгалтерское законодательство, и больше не используем их для связи с вами.
              </p>
              <div>
                <button
                  type="button"
                  className="pill"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api('account/delete', { confirm: true });
                      for (const key of ['hl-cart', 'hl-favorites', 'hl-state-user', 'hl-history']) localStorage.removeItem(key);
                      window.dispatchEvent(new Event('cart-change'));
                      setUser(null);
                      toast.success('Аккаунт удалён');
                      router.push('/');
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? 'Удаляем…' : 'Удалить аккаунт'}
                </button>
                <button type="button" className="outline-link" onClick={() => setConfirmDelete(false)}>
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <p className="subdued">
        Документы: <Link href="/info/privacy">политика</Link>, <Link href="/info/consent">согласие</Link>,{' '}
        <Link href="/info/cookies">файлы cookie</Link>.
      </p>
    </section>
  );
}
function Orders({ user, settings, id }: { user: any; settings: any; id?: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (user)
      api('orders')
        .then(setOrders)
        .catch((e) => setError(e.message));
  }, [user]);
  if (!user)
    return (
      <div className="empty-state">
        <h1>Мои посылки</h1>
        <Link href="/login?return=%2Forders" className="pill">
          Войти
        </Link>
      </div>
    );
  const chosen = id ? orders.find((o) => o.id === id) : null;
  return (
    <>
      <div className="breadcrumb">Личный кабинет / Мои посылки</div>
      <h1>{id ? 'Статус заказа' : 'Мои посылки'}</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {id && !chosen ? (
        <p>Заказ не найден или ещё загружается.</p>
      ) : chosen ? (
        <>
          <div className="row">
            <h3>№ {chosen.id}</h3>
            <span className="pill">{chosen.status}</span>
          </div>
          <section className="panel tracking-panel">
            <small>ВАШ ЗАКАЗ</small>
            <h2>
              {chosen.payment === 'paid'
                ? chosen.data.stage >= 8
                  ? 'Получен'
                  : stages[chosen.data.stage]
                : chosen.status}
            </h2>
            <p className="subdued">
              {chosen.payment !== 'paid'
                ? chosen.payment === 'pending'
                  ? 'Заказ ждёт оплаты. Резерв держится 5 минут.'
                  : 'Заказ не оплачен. Оформите его заново из корзины.'
                : chosen.data.delay ||
                  'Следующий этап: ' + (stages[chosen.data.stage + 1] || 'получение заказа')}
            </p>
            {chosen.payment === 'paid' && (
              <div className="tracking-path">
                {stages.map((s, i) => (
                  <div
                    className={
                      'tracking-stage ' +
                      (i <= chosen.data.stage ? 'complete' : '') +
                      (i === chosen.data.stage ? ' current' : '')
                    }
                    key={s}
                  >
                    {i === chosen.data.stage && (
                      <span className="truck" role="img" aria-label="Посылка на текущем этапе">
                        <IconTruck />
                      </span>
                    )}
                    <i>{i < chosen.data.stage ? '✓' : i === chosen.data.stage ? '●' : ''}</i>
                    <small>{String(i + 1).padStart(2, '0')}</small>
                    <p>{s}</p>
                  </div>
                ))}
              </div>
            )}
            <details>
              <summary>История перемещений</summary>
              {chosen.data.history.map((h: any, i: number) => (
                <p key={i}>
                  {new Date(h.date).toLocaleString('ru-RU')} · {h.note}
                </p>
              ))}
            </details>
          </section>
          <section className="panel">
            <h2>Состав заказа</h2>
            {chosen.data.items.map((l: any, i: number) => (
              <p key={i}>
                {l.name} · {l.size} · {l.qty} шт. · {rub(l.price * l.qty)}
              </p>
            ))}
            <p>
              {chosen.data.carrier} · {chosen.data.address}
            </p>
            <strong>Итого: {rub(chosen.total)}</strong>
          </section>
          <Support settings={settings} />
        </>
      ) : orders.length ? (
        <div className="stack">
          {orders.map((o) => (
            <Link href={'/orders/' + o.id} className="panel order-link" key={o.id}>
              <div className="row">
                <strong>№ {o.id}</strong>
                <span>{new Date(o.created).toLocaleDateString('ru-RU')}</span>
              </div>
              <p>{o.data.items.map((l: any) => l.name).join(', ')}</p>
              <div className="row">
                <strong>{rub(o.total)}</strong>
                <span>{o.status} →</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>У вас пока нет заказов</h2>
          <Link className="pill" href="/">
            В каталог
          </Link>
        </div>
      )}
    </>
  );
}
const tgHandle = (url: string) => url.match(/^https:\/\/t\.me\/([\w]+)/)?.[1] || '';
function Support({ settings }: { settings: any }) {
  return (
    <div className="support">
      <h2>Всё под контролем</h2>
      <p>Есть вопрос по заказу? Напишите менеджеру.</p>
      <div className="row">
        {settings.telegram && (
          <a className="pill" href={settings.telegram} target="_blank" rel="noreferrer">
            Менеджер в Telegram{tgHandle(settings.telegram) && ' · @' + tgHandle(settings.telegram)}
          </a>
        )}
        {settings.telegramChannel && (
          <a className="pill secondary" href={settings.telegramChannel} target="_blank" rel="noreferrer">
            Наш Telegram-канал
          </a>
        )}
        {settings.whatsapp && (
          <a
            className="pill"
            href={'https://wa.me/' + settings.whatsapp.replace(/\D/g, '')}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
        )}
        {settings.email && (
          <a className="pill" href={'mailto:' + settings.email}>
            Почта
          </a>
        )}
        {settings.max && (
          <a className="pill" href={settings.max} target="_blank" rel="noreferrer">
            MAX
          </a>
        )}
        {!settings.telegram && !settings.email && !settings.whatsapp && !settings.max && (
          <p className="subdued">Контакты поддержки будут добавлены перед запуском.</p>
        )}
      </div>
      <h2 className="support-requisites-title">Реквизиты продавца</h2>
      <Requisites seller={settings.seller} />
      <p className="subdued">
        Документы собраны в разделе <Link href="/info/legal">«Правовая информация»</Link>.
      </p>
    </div>
  );
}
function Listing({ kind, products }: { kind: string; products: Product[] }) {
  const params = useSearchParams();
  const [ids, setIds] = useState<string[]>([]);
  const [brand, setBrand] = useState('Все бренды');
  const [limit, setLimit] = useState(8);
  const q = params.get('q') || '';
  const dept = (departments as readonly string[]).includes(params.get('dept') || '') ? params.get('dept')! : '';
  const genderParam = params.get('gender') || '';
  useEffect(() => {
    setIds(JSON.parse(localStorage.getItem('hl-favorites') || '[]'));
  }, []);
  let list = products;
  if (kind === 'search') {
    list = products.filter((p) => matchesQuery(p, q) && (!dept || department(p) === dept));
    const gender = genderParam;
    if (['women', 'men', 'unisex'].includes(gender || ''))
      list = list.filter(
        (p) => !p.gender || p.gender === gender || (gender !== 'unisex' && p.gender === 'unisex'),
      );
  }
  if (kind === 'favorites') list = products.filter((p) => ids.includes(p.id));
  if (kind === 'brands' && brand !== 'Все бренды') list = products.filter((p) => p.brand === brand);
  if (kind === 'sale') list = products.filter((p) => p.promo);
  return (
    <>
      <h1>
        {kind === 'search'
          ? dept
            ? dept + (genderLabels[genderParam] ? ' · ' + genderLabels[genderParam] : '')
            : 'Поиск'
          : kind === 'favorites'
            ? 'Избранное'
            : kind === 'brands'
              ? params.get('view') === 'new'
                ? 'Новые поступления брендов'
                : 'Бренды'
              : 'Скидки'}
      </h1>
      {kind === 'search' && (
        <form action="/search" className="search-large">
          {dept && <input type="hidden" name="dept" value={dept} />}
          {genderLabels[genderParam] && <input type="hidden" name="gender" value={genderParam} />}
          <input name="q" defaultValue={q} placeholder="Название или бренд" aria-label="Название или бренд" />
          <button className="pill">Найти</button>
        </form>
      )}
      {kind === 'brands' && (
        <Choice
          label="Бренд"
          value={brand}
          onChange={setBrand}
          items={['Все бренды', ...new Set(products.map((p) => p.brand).filter(Boolean))]}
        />
      )}
      <p className="subdued" role="status">
        {list.length
          ? 'Найдено вещей: ' + list.length
          : kind === 'search'
            ? 'Ничего не нашли. Попробуйте другое название или оставьте запрос на поиск'
            : kind === 'sale'
              ? 'Акционных вещей пока нет'
              : 'Здесь появятся вещи, которые вы добавите в избранное'}
      </p>
      {kind === 'sale' && (
        <p className="notice">
          Временная акция: одна доступная акционная вещь за 1 ₽ для покупателя без ранее оплаченных заказов на
          сайте. Доставка по РФ бесплатная. Условия и доступность проверяются перед оплатой.
        </p>
      )}
      <div className="product-grid">
        {list.slice(0, limit).map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
      {list.length > limit && (
        <button className="pill more" onClick={() => setLimit((n) => n + 8)}>
          Показать ещё
        </button>
      )}
      {!list.length && <Recommendations products={products} />}
    </>
  );
}
function Unsubscribe() {
  const params = useSearchParams();
  const [message, setMessage] = useState('');
  return (
    <section className="auth-card panel">
      <h1>Отписка от рассылки</h1>
      <p>Вы перестанете получать новости и предложения Hauteline.</p>
      <button
        className="pill"
        onClick={async () => {
          try {
            await api('unsubscribe', { token: params.get('token') });
            setMessage('Вы отписались от рассылки.');
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        Отписаться
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
function Info({ topic, settings }: { topic: string; settings: any }) {
  const title = Object.hasOwn(infoTitles, topic) ? infoTitles[topic] : undefined;
  if (!title)
    return (
      <div className="empty-state">
        <h1>Страница не найдена</h1>
        <Link className="pill" href="/">
          На главную
        </Link>
      </div>
    );
  return (
    <section className="info-page">
      <div className="breadcrumb">
        <Link href="/">Главная</Link> / {title}
      </div>
      <h1>{title}</h1>
      {topic === 'contacts' ? <Support settings={settings} /> : <InfoContent topic={topic} settings={settings} />}
      {topic !== 'contacts' && (
        <div className="info-help">
          <strong>Остались вопросы?</strong>
          <Link className="pill" href="/info/contacts">
            Написать менеджеру →
          </Link>
        </div>
      )}
    </section>
  );
}


// Цена по акции «1 ₽» — по тем же правилам, что на сервере: одна вещь в одном экземпляре,
// остальное по полной цене. Окончательно цену подтверждает сервер при оформлении.
function linePrices(rows: { id: string; qty: number }[], products: Product[]) {
  let promoUsed = false;
  return rows.map((r) => {
    const p = products.find((x) => x.id === r.id);
    if (!p) return 0;
    if (p.promo && !promoUsed && r.qty === 1) {
      promoUsed = true;
      return 1;
    }
    return p.price;
  });
}
/** Расчёт акций в браузере (без промокода) — сервер пересчитывает окончательно при оформлении. */
function localPricing(rows: { id: string; qty: number; size?: string }[], products: Product[], promotions: Promotion[]) {
  const prices = linePrices(rows, products);
  return priceCart(
    rows.map((r, i) => {
      const p = products.find((x) => x.id === r.id);
      return {
        id: r.id,
        size: r.size,
        qty: r.qty,
        price: prices[i],
        promo: !!p?.promo && prices[i] === 1,
        brand: p?.brand || '',
        name: p?.name || '',
        category: p?.category,
      };
    }),
    promotions,
    Date.now(),
  );
}
/** Строки «Товары / скидки / доставка / итого» — одинаково в корзине и в оформлении. */
function PricingRows({ pricing, oneRubleDelivery }: { pricing: PricingResult; oneRubleDelivery?: boolean }) {
  return (
    <>
      <div className="summary-row">
        <span>Товары</span>
        <strong>{rub(pricing.subtotal)}</strong>
      </div>
      {pricing.discounts.map((d) => (
        <div className="summary-row summary-discount" key={d.id}>
          <span>{d.label}</span>
          <strong>−{rub(d.amount)}</strong>
        </div>
      ))}
      <div className="summary-row checkout-delivery-total">
        <span>Доставка</span>
        <strong className={pricing.freeShipping || oneRubleDelivery ? 'is-free' : ''}>
          {pricing.freeShipping || oneRubleDelivery ? 'Бесплатно' : 'Отдельно'}
        </strong>
      </div>
      {pricing.shippingLeft !== null && pricing.shippingLeft > 0 && (
        <p className="summary-hint">
          Добавьте ещё на <b>{rub(pricing.shippingLeft)}</b>, и доставка будет бесплатной
        </p>
      )}
      <div className="summary-row summary-total checkout-total">
        <span>Итого</span>
        <strong>
          {pricing.discountTotal > 0 && <s>{rub(pricing.subtotal)}</s>}
          {rub(pricing.total)}
        </strong>
      </div>
    </>
  );
}
// Разрешаем возвращаться только на страницы этого сайта (защита от подмены ?return=).
function safeReturn(ret: string | null, fallback: string) {
  if (!ret) return fallback;
  try {
    const url = new URL(ret, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
function newKey() {
  return 'HL-' + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2));
}

// Скелетон вместо надписи «Загрузка…»: повторяет форму будущей страницы.
function PageSkeleton({ label, variant }: { label: string; variant: 'product' | 'form' }) {
  return (
    <section className={`page-skeleton page-skeleton-${variant}`} role="status" aria-label={label}>
      {variant === 'product' ? (
        <>
          <div className="skel skel-media" />
          <div className="page-skeleton-col">
            <span className="skel skel-line" style={{ width: '40%' }} />
            <span className="skel skel-title" />
            <span className="skel skel-line" style={{ width: '25%' }} />
            <span className="skel skel-block" />
            <span className="skel skel-button" />
          </div>
        </>
      ) : (
        <div className="page-skeleton-col">
          <span className="skel skel-title" style={{ width: '45%' }} />
          <span className="skel skel-field" />
          <span className="skel skel-field" />
          <span className="skel skel-field" />
          <span className="skel skel-button" />
        </div>
      )}
    </section>
  );
}
