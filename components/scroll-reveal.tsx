'use client';
import { useEffect } from 'react';

// Появление блоков при прокрутке: то, что ниже экрана, мягко поднимается и проявляется,
// когда до него долистали. Карточки в одной строке появляются лесенкой.
// То, что уже видно при открытии страницы, не трогаем, чтобы ничего не мигало.
// Двигаются только opacity и transform; после появления атрибут снимается и элемент живёт по своим стилям.
const SELECTOR = [
  '.product-grid > .product-card:not(.first-reveal)',
  '.section-heading',
  '.request-page',
  '.service-benefits > div',
  '.site-footer .footer-top',
  '.site-footer .footer-directory > *',
  '.info-page > *',
  '.catalog-page .product-card',
  '.empty-state',
].join(',');

export default function ScrollReveal() {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        const shown = entries
          .filter((e) => e.isIntersecting)
          .map((e) => e.target as HTMLElement)
          .sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return ra.top - rb.top || ra.left - rb.left;
          });
        shown.forEach((el, i) => {
          io.unobserve(el);
          el.style.setProperty('--reveal-i', String(Math.min(i, 5)));
          el.classList.add('is-in');
          const done = () => {
            el.removeAttribute('data-reveal');
            el.classList.remove('is-in');
            el.style.removeProperty('--reveal-i');
          };
          el.addEventListener('transitionend', (ev) => ev.target === el && ev.propertyName === 'transform' && done(), {
            once: false,
          });
          window.setTimeout(done, 1600);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    const scan = () => {
      const vh = window.innerHeight;
      document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        // уже на экране: показываем сразу, без анимации
        if (el.getBoundingClientRect().top < vh * 0.92) return;
        el.setAttribute('data-reveal', '');
        io.observe(el);
      });
    };
    scan();
    let raf = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(scan);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
