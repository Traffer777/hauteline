'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Всплывающая подсказка у курсора:
// • data-hint="текст" на неактивной кнопке — фиолетовое уведомление, почему кнопка не работает;
// • data-cart-limit / data-unavailable — «Уже в корзине» / «Не в наличии».
// Цель ищется через elementFromPoint: отключённые кнопки в части браузеров не получают события мыши.
type Hint = { x: number; y: number; text: string; action: boolean; key: string };

function hintAt(x: number, y: number): Omit<Hint, 'x' | 'y'> | null {
  const element = document.elementFromPoint(x, y);
  if (!element) return null;
  const action = element.closest<HTMLElement>('[data-hint]');
  if (action?.dataset.hint) return { text: action.dataset.hint, action: true, key: action.dataset.hint };
  if (element.closest('[data-cart-limit="true"]')) return { text: 'Уже в корзине', action: false, key: 'cart' };
  if (element.closest('[data-unavailable="true"]')) return { text: 'Не в наличии', action: false, key: 'stock' };
  return null;
}

function place(x: number, y: number, text: string) {
  const width = Math.min(320, text.length * 7.4 + 36);
  return {
    x: Math.max(8, Math.min(x + 14, window.innerWidth - width - 8)),
    y: Math.min(y + 22, window.innerHeight - 56),
  };
}

export default function UnavailableHint() {
  const [hint, setHint] = useState<Hint | null>(null);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const found = hintAt(event.clientX, event.clientY);
      setHint(found ? { ...found, ...place(event.clientX, event.clientY, found.text) } : null);
    };
    // На телефоне наведения нет: показываем подсказку по касанию неактивной кнопки.
    const touch = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      const found = hintAt(event.clientX, event.clientY);
      if (!found?.action) return;
      if (touchTimer.current) clearTimeout(touchTimer.current);
      setHint({ ...found, ...place(event.clientX, event.clientY - 70, found.text) });
      touchTimer.current = setTimeout(() => setHint(null), 2600);
    };
    const hide = () => setHint(null);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerdown', touch);
    document.addEventListener('pointerleave', hide);
    window.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerdown', touch);
      document.removeEventListener('pointerleave', hide);
      window.removeEventListener('scroll', hide);
      window.removeEventListener('blur', hide);
      if (touchTimer.current) clearTimeout(touchTimer.current);
    };
  }, []);
  return hint
    ? createPortal(
        <span
          key={hint.key}
          className={'unavailable-hint' + (hint.action ? ' is-action' : '')}
          role="tooltip"
          style={{ left: hint.x, top: hint.y }}
        >
          {hint.action && <i aria-hidden="true">!</i>}
          {hint.text}
        </span>,
        document.body,
      )
    : null;
}
