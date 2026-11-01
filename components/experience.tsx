'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import LoadingScreen from './loading-screen';
// «Скоро откроем …» — что именно открываем
function loaderTarget(path: string) {
  const p = path.split('?')[0];
  const map: [RegExp, string][] = [
    [/^\/(profile)/, 'профиль'],
    [/^\/orders/, 'ваши посылки'],
    [/^\/favorites/, 'избранное'],
    [/^\/cart/, 'корзину'],
    [/^\/checkout/, 'оформление'],
    [/^\/payment/, 'оплату'],
    [/^\/success/, 'ваш заказ'],
    [/^\/product\//, 'вещь'],
    [/^\/brands/, 'бренды'],
    [/^\/sale/, 'скидки'],
    [/^\/search/, 'поиск'],
    [/^\/request/, 'поиск вещи'],
    [/^\/(login|register|reset)/, 'вход'],
    [/^\/info\/contacts/, 'контакты'],
    [/^\/info/, 'раздел'],
  ];
  return map.find(([re]) => re.test(p))?.[1] || 'каталог';
}
/**
 * Персональные рекомендации — по согласию (правила по ст. 10.2-2 149-ФЗ, отключаются в любой момент).
 * Выбор хранится в браузере и фиксируется в журнале согласий на сервере.
 */
export function setRecommendationChoice(on: boolean, source: 'banner' | 'profile') {
  const value = on ? 'yes' : 'no';
  try {
    localStorage.setItem('hl-cookie-choice', value);
    if (!on) localStorage.removeItem('hl-history');
  } catch {}
  document.cookie = 'hl_recommendations=' + value + '; Path=/; SameSite=Lax; Max-Age=31536000';
  if (source === 'banner') {
    let visitor = '';
    try {
      visitor = sessionStorage.getItem('hl-visitor') || '';
    } catch {}
    fetch('/api/consent/cookies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice: value, visitor }),
    }).catch(() => {});
  }
}
export default function Experience() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [cookies, setCookies] = useState<string | null>('pending');
  // Экран загрузки «Скоро откроем …» при каждом переходе, с названием раздела, куда идём
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 1100);
    return () => clearTimeout(t);
  }, [pathname]);
  useEffect(() => {
    setCookies(localStorage.getItem('hl-cookie-choice'));
    // Прокрутка — родная браузерная: своё «сглаживание» колеса запаздывало за рукой и выглядело как лаг.
  }, []);
  useEffect(() => {
    let visitor = sessionStorage.getItem('hl-visitor');
    if (!visitor) {
      visitor = globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
      sessionStorage.setItem('hl-visitor', visitor);
    }
    const started = Date.now();
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitor, type: 'visit' }),
    }).catch(() => {});
    const record = () =>
      navigator.sendBeacon(
        '/api/events',
        new Blob(
          [JSON.stringify({ visitor, type: 'duration', seconds: Math.round((Date.now() - started) / 1000) })],
          { type: 'application/json' },
        ),
      );
    window.addEventListener('pagehide', record);
    return () => {
      window.removeEventListener('pagehide', record);
      record();
    };
  }, [pathname]);
  useEffect(() => {
    async function hydrate() {
      try {
        const user: any = await (await fetch('/api/auth/me')).json();
        if (!user || localStorage.getItem('hl-state-user') === user.id) return;
        const response = await fetch('/api/state');
        if (!response.ok) return;
        const state: any = await response.json();
        const local = JSON.parse(localStorage.getItem('hl-cart') || '[]');
        const cart = [...state.cart];
        for (const row of local)
          if (!cart.some((x: any) => x.id === row.id && x.size === row.size)) cart.push(row);
        const favorites = [
          ...new Set([...state.favorites, ...JSON.parse(localStorage.getItem('hl-favorites') || '[]')]),
        ];
        localStorage.setItem('hl-cart', JSON.stringify(cart));
        localStorage.setItem('hl-favorites', JSON.stringify(favorites));
        await fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cart, favorites }),
        });
        localStorage.setItem('hl-state-user', user.id);
        window.dispatchEvent(new Event('cart-hydrated'));
      } catch {}
    }
    hydrate();
  }, [pathname]);
  function choice(value: string) {
    setRecommendationChoice(value === 'yes', 'banner');
    setCookies(value);
  }
  return (
    <>
      {loading && !pathname?.startsWith('/admin') && <LoadingScreen target={loaderTarget(pathname || '/')} />}
      {cookies === null && !pathname?.startsWith('/admin') && (
        <div className="cookie-choice" role="region" aria-label="Файлы cookie">
          <p>
            Сайт использует служебные файлы cookie: без них не работают корзина и вход (
            <Link href="/info/cookies">подробнее</Link>). Разрешить персональные рекомендации по просмотренным вещам? Как
            они работают, написано в <Link href="/info/recommendations">правилах рекомендаций</Link>.
          </p>
          <div>
            <button onClick={() => choice('yes')}>Разрешить</button>
            <button onClick={() => choice('no')}>Только необходимые</button>
          </div>
        </div>
      )}
    </>
  );
}
