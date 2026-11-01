'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const originals = [
  { image: '/figma/init0/27831.png', title: 'Твой темп', href: '/sale' },
  { image: '/figma/init0/18970.png', title: 'Новая классика', href: '/catalog' },
  { image: '/figma/init0/fc6ee.png', title: 'Городской ритм', href: '/brands?view=new' },
];

export default function BannerCarousel() {
  const [banners, setBanners] = useState(originals);
  const [seconds, setSeconds] = useState(15);
  const [index, setIndex] = useState(1);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  // Автопрокрутка останавливается: при наведении и фокусе внутри, по кнопке паузы и при «уменьшить движение»
  const [hovered, setHovered] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduce(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((settings: { banners?: typeof originals; bannerSeconds?: number }) => {
        if (settings.banners?.length === 3 && settings.banners.every((b) => b.image && b.title && b.href))
          setBanners(settings.banners);
        if (Number(settings.bannerSeconds) >= 8) setSeconds(Number(settings.bannerSeconds));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    Promise.all(
      banners.map(
        (b) =>
          new Promise<void>((resolve) => {
            const image = new Image();
            image.onload = () => resolve();
            image.onerror = () => resolve();
            image.src = b.image;
            if (image.complete) resolve();
          }),
      ),
    ).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [banners]);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    if (hidden || !ready || hovered || stopped || reduce) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % banners.length), seconds * 1000);
    return () => clearTimeout(timer);
  }, [index, seconds, hidden, ready, hovered, stopped, reduce, banners.length]);
  const change = (delta: number) => setIndex((i) => (i + delta + banners.length) % banners.length);
  return (
    <section
      className="banner-carousel"
      aria-label="Акции и новые поступления"
      aria-roledescription="карусель"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovered(false);
      }}
    >
      {!reduce && (
        <button
          type="button"
          className="banner-pause sr-only-focusable"
          aria-pressed={stopped}
          onClick={() => setStopped((v) => !v)}
        >
          {stopped ? 'Включить прокрутку баннеров' : 'Остановить прокрутку баннеров'}
        </button>
      )}
      <div className="banner-row">
        {[0, 1, 2].map((slot) => {
          return (
            <article className={'banner banner-' + slot} key={slot}>
              {(slot === 1 ? banners : [banners[slot]]).map((item, j) => (
                <Link
                  key={item.image + j}
                  href={item.href}
                  className={'banner-link banner-layer ' + (slot !== 1 || j === index ? 'is-active' : '')}
                  aria-hidden={slot === 1 && j !== index}
                  tabIndex={slot !== 1 || j === index ? 0 : -1}
                >
                  <img className="banner-artwork" src={item.image} alt={item.title} />
                </Link>
              ))}
              {slot === 1 ? (
                <button className="banner-control" aria-label="Следующий баннер" onClick={() => change(1)}>
                  <img className="banner-control-circle" src="/figma/init0/1cb81.svg" alt="" />
                  <img className="banner-control-arrow" src="/figma/init0/29294.svg" alt="" />
                </button>
              ) : (
                <Link
                  className="banner-control"
                  href={banners[slot].href}
                  aria-label={'Перейти: ' + banners[slot].title}
                >
                  <img
                    className="banner-control-circle"
                    src={'/figma/init0/' + (slot === 2 ? '5fb52.svg' : '1cb81.svg')}
                    alt=""
                  />
                  <img
                    className="banner-control-arrow"
                    src={'/figma/init0/' + (slot === 2 ? '961ce.svg' : '29294.svg')}
                    alt=""
                  />
                </Link>
              )}
            </article>
          );
        })}
      </div>
      <div className="banner-dots">
        {banners.map((banner, i) => (
          <button
            key={i}
            aria-label={'Баннер ' + (i + 1) + ': ' + banner.title}
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </section>
  );
}
