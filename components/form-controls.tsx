'use client';
import React, { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
export function Choice({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  items: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="choice" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {items.map((v) => (
          <SelectItem value={v} key={v}>
            {(
              {
                stock: 'В наличии в РФ',
                preorder: 'Под заказ',
                day: 'День',
                week: 'Неделя',
                month: 'Месяц',
                all: 'Всё время',
                owner: 'Владелец',
                manager: 'Менеджер',
                lead: 'Руководитель',
                marketing: 'Маркетолог',
                content: 'Контент-менеджер',
                customer: 'Покупатель',
              } as Record<string, string>
            )[v] || v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Consent({
  checked,
  onChange,
  marketing = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  marketing?: boolean;
}) {
  return (
    <label className="consent">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span>
        {marketing ? 'Согласен получать ' : 'Даю '}
        <Link href={marketing ? '/info/marketing' : '/info/consent'} className="outline-link" target="_blank">
          {marketing ? 'рекламу и рассылки' : 'согласие на обработку персональных данных'}
        </Link>
        {marketing ? ' (необязательно)' : ''}
      </span>
    </label>
  );
}
export function Field({
  label,
  name,
  type = 'text',
  required = false,
  defaultValue,
  placeholder,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="form-field">
      {label}
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
      />
    </label>
  );
}

/* Телефон: код страны выбран сразу (+7 Россия), номер вводится по маске выбранной страны. */
type PhoneCountry = { id: string; name: string; flag: string; code: string; mask: string };
export const phoneCountries: PhoneCountry[] = [
  { id: 'ru', name: 'Россия', flag: '🇷🇺', code: '7', mask: '(XXX) XXX-XX-XX' },
  { id: 'kz', name: 'Казахстан', flag: '🇰🇿', code: '7', mask: '(XXX) XXX-XX-XX' },
  { id: 'by', name: 'Беларусь', flag: '🇧🇾', code: '375', mask: '(XX) XXX-XX-XX' },
  { id: 'uz', name: 'Узбекистан', flag: '🇺🇿', code: '998', mask: '(XX) XXX-XX-XX' },
  { id: 'kg', name: 'Кыргызстан', flag: '🇰🇬', code: '996', mask: '(XXX) XXX-XXX' },
  { id: 'am', name: 'Армения', flag: '🇦🇲', code: '374', mask: '(XX) XXX-XXX' },
  { id: 'az', name: 'Азербайджан', flag: '🇦🇿', code: '994', mask: '(XX) XXX-XX-XX' },
  { id: 'ge', name: 'Грузия', flag: '🇬🇪', code: '995', mask: '(XXX) XX-XX-XX' },
  { id: 'tj', name: 'Таджикистан', flag: '🇹🇯', code: '992', mask: '(XX) XXX-XX-XX' },
  { id: 'md', name: 'Молдова', flag: '🇲🇩', code: '373', mask: '(XX) XXX-XXX' },
  { id: 'tr', name: 'Турция', flag: '🇹🇷', code: '90', mask: '(XXX) XXX-XX-XX' },
  { id: 'ae', name: 'ОАЭ', flag: '🇦🇪', code: '971', mask: '(XX) XXX-XXXX' },
  { id: 'cn', name: 'Китай', flag: '🇨🇳', code: '86', mask: '(XXX) XXXX-XXXX' },
  { id: 'us', name: 'США', flag: '🇺🇸', code: '1', mask: '(XXX) XXX-XXXX' },
];
const maskLength = (mask: string) => mask.split('X').length - 1;
function formatPhone(digits: string, mask: string) {
  let out = '';
  let i = 0;
  for (const ch of mask) {
    if (i >= digits.length) break;
    if (ch === 'X') out += digits[i++];
    else out += ch;
  }
  return out;
}
/** Разбирает сохранённый номер («+7 (999) 123-45-67», «89991234567») на страну и цифры. */
export function parsePhone(value: string, countryId?: string) {
  const raw = (value || '').trim();
  let digits = raw.replace(/\D/g, '');
  let country = phoneCountries.find((c) => c.id === countryId) || phoneCountries[0];
  if (raw.startsWith('+')) {
    const byCode = [...phoneCountries]
      .sort((a, b) => b.code.length - a.code.length)
      .find((c) => digits.startsWith(c.code));
    if (byCode) {
      if (byCode.code !== country.code) country = byCode;
      digits = digits.slice(byCode.code.length);
    }
  } else if (digits.length === 11 && /^[78]/.test(digits) && country.code === '7') {
    digits = digits.slice(1);
  }
  return { country, digits: digits.slice(0, maskLength(country.mask)) };
}
export function PhoneField({
  label,
  name,
  defaultValue = '',
  defaultCountry,
  required = false,
  russiaOnly = false,
  onValue,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  defaultCountry?: string;
  required?: boolean;
  /** Номер для входа: только российский (+7), выбор страны скрыт. */
  russiaOnly?: boolean;
  onValue?: (full: string) => void;
}) {
  const initial = parsePhone(defaultValue, defaultCountry);
  const [country, setCountry] = useState<PhoneCountry>(initial.country);
  const [digits, setDigits] = useState(initial.digits);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const hiddenCountry = useRef<HTMLInputElement>(null);
  const need = maskLength(country.mask);
  const full = digits ? `+${country.code} ${formatPhone(digits, country.mask)}` : '';
  useEffect(() => {
    input.current?.setCustomValidity(
      digits.length && digits.length < need ? 'Введите номер телефона полностью' : '',
    );
  }, [digits, need]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  // скрытые поля обновляем сразу, чтобы черновик формы (onChange формы) видел свежий номер
  const sync = (c: PhoneCountry, d: string) => {
    if (hidden.current) hidden.current.value = d ? `+${c.code} ${formatPhone(d, c.mask)}` : '';
    if (hiddenCountry.current) hiddenCountry.current.value = c.id;
    onValue?.(d.length === maskLength(c.mask) ? `+${c.code}${d}` : '');
  };
  const pick = (c: PhoneCountry) => {
    const d = digits.slice(0, maskLength(c.mask));
    setCountry(c);
    setDigits(d);
    sync(c, d);
    setOpen(false);
    requestAnimationFrame(() => input.current?.focus());
  };
  const openMenu = () => {
    setActive(Math.max(0, phoneCountries.indexOf(country)));
    setOpen((v) => !v);
  };
  return (
    <div className={'form-field phone-field' + (open ? ' is-open' : '')} ref={box}>
      <label htmlFor={id}>{label}</label>
      <div className="phone-box" style={{ '--code-len': country.code.length } as React.CSSProperties}>
        <button
          type="button"
          className={'phone-country' + (russiaOnly ? ' is-locked' : '')}
          disabled={russiaOnly}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Код страны: ${country.name}, +${country.code}`}
          onClick={openMenu}
          onKeyDown={(e) => {
            if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              openMenu();
            } else if (open) {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                setActive((a) => (a + step + phoneCountries.length) % phoneCountries.length);
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                pick(phoneCountries[active]);
              }
            }
          }}
        >
          <span className="phone-flag" aria-hidden="true">
            {country.id.toUpperCase()}
          </span>
          <span className="phone-code">+{country.code}</span>
          <svg className="phone-chevron" style={russiaOnly ? { display: "none" } : undefined} viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
        </button>
        <input
          ref={input}
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={russiaOnly ? '(9__) ___-__-__' : country.mask.replace(/X/g, '_')}
          value={formatPhone(digits, country.mask)}
          required={required}
          onChange={(e) => {
            let d = e.target.value.replace(/\D/g, '');
            // вставили номер целиком, с кодом страны или с «8» в начале
            if (d.length > need && d.startsWith(country.code)) d = d.slice(country.code.length);
            else if (d.length > need && country.code === '7' && d.startsWith('8')) d = d.slice(1);
            d = d.slice(0, need);
            setDigits(d);
            sync(country, d);
          }}
        />
        <ul className="phone-menu" role="listbox" aria-label="Код страны" hidden={!open}>
          {phoneCountries.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={c.id === country.id}
              className={i === active ? 'is-active' : ''}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(c)}
            >
              <span className="phone-flag" aria-hidden="true">
                {c.id.toUpperCase()}
              </span>
              <span className="phone-menu-name">{c.name}</span>
              <span className="phone-menu-code">+{c.code}</span>
            </li>
          ))}
        </ul>
      </div>
      <input ref={hidden} type="hidden" name={name} defaultValue={full} />
      <input ref={hiddenCountry} type="hidden" name={name + 'Country'} defaultValue={country.id} />
    </div>
  );
}

/**
 * Подтверждение российского номера SMS-кодом. С 07.07.2026 вход на российские сайты допускается только
 * по российскому номеру, через Госуслуги, ЕБС или российские сервисы (VK ID, Яндекс ID) — ст. 8 ч. 10 149-ФЗ.
 * Пока SMS-сервис не подключён, при разработке код показывается прямо на экране.
 */
export function PhoneVerify({
  purpose,
  label = 'Российский номер телефона',
  defaultValue = '',
}: {
  purpose: 'register' | 'login' | 'link';
  label?: string;
  defaultValue?: string;
}) {
  const [phone, setPhone] = useState(() => {
    const p = parsePhone(defaultValue, 'ru');
    return p.country.id === 'ru' && p.digits.length === 10 ? '+7' + p.digits : '';
  });
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const errorId = useId();
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  async function send() {
    if (busy || wait > 0) return;
    setError('');
    if (!/^\+79\d{9}$/.test(phone)) {
      setError('Нужен российский мобильный номер: +7 9XX XXX-XX-XX');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/auth/phone-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, purpose }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Не удалось отправить код');
      setSent(true);
      setWait(60);
      setNote(
        data.devCode
          ? `СМС-сервис ещё не подключён. Код для проверки: ${data.devCode}`
          : 'Отправили СМС с кодом. Он действует 5 минут.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="phone-verify">
      <PhoneField label={label} name="phone" defaultValue={defaultValue} defaultCountry="ru" russiaOnly required onValue={setPhone} />
      <div className="phone-verify-row">
        <label className="form-field phone-verify-code">
          Код из СМС
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="______"
            required
            title="6 цифр из СМС"
          />
        </label>
        <button type="button" className="outline-pill phone-verify-send" onClick={send} aria-disabled={busy || wait > 0}>
          {busy ? 'Отправляем…' : wait > 0 ? `Повторно через ${wait} с` : sent ? 'Отправить ещё раз' : 'Получить код'}
        </button>
      </div>
      {note && <p className="phone-verify-note" role="status">{note}</p>}
      <p className="error phone-verify-error" role="alert" id={errorId}>
        {error}
      </p>
    </div>
  );
}
