'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { IconBox } from './icons';

export function useCartQuantity(id: string, size?: string) {
  const [rows, setRows] = useState<{ id: string; size: string; qty: number }[]>([]);
  useEffect(() => {
    const update = () => {
      try {
        const rows: { id: string; size: string; qty: number }[] = JSON.parse(
          localStorage.getItem('hl-cart') || '[]',
        );
        setRows(rows);
      } catch {
        setRows([]);
      }
    };
    update();
    for (const name of ['cart-change', 'cart-hydrated', 'storage']) window.addEventListener(name, update);
    return () => {
      for (const name of ['cart-change', 'cart-hydrated', 'storage'])
        window.removeEventListener(name, update);
    };
  }, []);
  return rows
    .filter((row) => row.id === id && (size === undefined || row.size === size))
    .reduce((sum, row) => sum + row.qty, 0);
}

export function removeCartUnit(id: string, size?: string) {
  const rows: { id: string; size: string; qty: number }[] = JSON.parse(
    localStorage.getItem('hl-cart') || '[]',
  );
  const index = rows.findLastIndex((row) => row.id === id && (size === undefined || row.size === size));
  if (index < 0) return;
  if (rows[index].qty > 1) rows[index].qty--;
  else rows.splice(index, 1);
  localStorage.setItem('hl-cart', JSON.stringify(rows));
  window.dispatchEvent(new Event('cart-change'));
  fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cart: rows, favorites: JSON.parse(localStorage.getItem('hl-favorites') || '[]') }),
  }).catch(() => {});
}

export function CartAddedControls({
  quantity,
  onAdd,
  onRemove,
  compact = false,
  disabled = false,
  disabledReason,
}: {
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
  compact?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div className="cart-added-controls">
      {!compact && (
        <button
          className="cart-add-more"
          onClick={onAdd}
          disabled={disabled}
          data-hint={disabled ? disabledReason : undefined}
        >
          {disabled && disabledReason ? disabledReason : 'Добавить ещё в корзину +'}
        </button>
      )}
      <div className="cart-added-bottom">
        <button
          type="button"
          className="cart-added-quantity"
          onClick={onRemove}
          aria-label={'Убрать одну вещь из корзины. Сейчас: ' + quantity}
        >
          <span className="cart-quantity-number" aria-hidden="true">
            {quantity}
          </span>
          <span className="cart-quantity-remove" aria-hidden="true">
            ×
          </span>
        </button>
        <Link className="cart-open-link" href="/cart">
          <IconBox /> <span className="cart-open-label">Перейти в корзину</span>
          <span className="cart-open-label-short" aria-hidden="true">
            Корзина
          </span>{' '}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
