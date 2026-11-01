'use client';
import ScrollReveal from './scroll-reveal';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

// Подвал по макету Figma (узел 52:837): подписка, бренд с двумя кнопками «Написать менеджеру»
// (Telegram и MAX), четыре колонки ссылок и нижняя строка — оплата, поддержка, копирайт, реквизиты, соцсети.

type Settings = {
  telegram?: string;
  telegramChannel?: string;
  whatsapp?: string;
  email?: string;
  max?: string;
  tiktok?: string;
  youtube?: string;
  hours?: string;
  legal?: string;
};

const columns: { title: string; links: [string, string][] }[] = [
  {
    title: 'КАТАЛОГ',
    links: [
      ['Одежда', '/search?dept=' + encodeURIComponent('Одежда')],
      ['Обувь', '/search?dept=' + encodeURIComponent('Обувь')],
      ['Аксессуары', '/search?dept=' + encodeURIComponent('Аксессуары')],
      ['Парфюмерия', '/search?dept=' + encodeURIComponent('Парфюмерия')],
      ['В наличии', '/catalog?availability=stock'],
      ['Под заказ', '/catalog?availability=preorder'],
    ],
  },
  {
    title: 'ПОКУПАТЕЛЯМ',
    links: [
      ['Как заказать', '/info/how-to-order'],
      ['Доставка и оплата', '/info/delivery'],
      ['Оригинальность', '/info/authenticity'],
      ['Возврат', '/info/returns'],
      ['Частые вопросы', '/info/faq'],
    ],
  },
  {
    title: 'О HAUTELINE',
    links: [
      ['О проекте', '/info/about'],
      ['Отзывы', '/info/reviews'],
      ['Полученные заказы', '/info/received'],
      ['Контакты', '/info/contacts'],
    ],
  },
  {
    title: 'ПОМОЩЬ',
    links: [
      ['Где мой заказ?', '/orders'],
      ['Связаться с менеджером', '/info/contacts'],
      ['Политика конфиденциальности', '/info/privacy'],
      ['Публичная оферта', '/info/offer'],
      ['Правовая информация', '/info/legal'],
    ],
  },
];

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.7 4.3 3.6 10.9c-1.2.5-1.1 1.2-.2 1.5l4.4 1.4 1.7 5.2c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.1-2 4.4 3.2c.8.4 1.4.2 1.6-.8l2.9-13.6c.3-1.2-.4-1.7-1.5-1.3ZM9 13.4l8.6-5.4c.4-.3.8-.1.5.2l-7.1 6.4-.3 3.2L9 13.4Z"
      />
    </svg>
  );
}
function TiktokIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.6 3c.3 2.2 1.7 3.8 3.9 4v2.9c-1.4.1-2.7-.3-3.9-1v6.3c0 3.6-2.6 5.8-5.6 5.8a5.5 5.5 0 0 1-5.5-5.6c0-3.4 2.9-5.9 6.4-5.4v3a2.6 2.6 0 0 0-3.4 2.5c0 1.5 1.1 2.6 2.6 2.6 1.5 0 2.6-1 2.6-2.9V3h2.9Z"
      />
    </svg>
  );
}
function YoutubeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z"
      />
    </svg>
  );
}

export default function Footer() {
  const [settings, setSettings] = useState<Settings>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);
  const contacts = '/info/contacts';
  const supportEmail = settings.email || 'support@hauteline.ru';
  const socials = [
    { href: settings.telegramChannel || settings.telegram, label: 'Telegram-канал Hauteline', icon: <TelegramIcon /> },
    { href: settings.tiktok, label: 'TikTok', icon: <TiktokIcon /> },
    { href: settings.youtube, label: 'YouTube', icon: <YoutubeIcon /> },
  ];
  return (
    <footer className="site-footer">
      <ScrollReveal />
      <div className="footer-top">
        <h2>Знать больше о нас</h2>
        <p>Редкие находки, снижение цен и подборки — один раз в неделю.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            setBusy(true);
            try {
              const r = await fetch('/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: f.get('email'),
                  consent: f.get('consent') === 'on',
                  pdConsent: f.get('pdConsent') === 'on',
                }),
              });
              const d = await r.json().catch(() => ({}));
              if (r.ok) {
                toast.success('Вы подписались на новости');
                form.reset();
              } else toast.error(d.error || 'Проверьте адрес почты и отметьте оба согласия');
            } catch {
              toast.error('Не удалось подписаться. Проверьте подключение и попробуйте ещё раз');
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            aria-label="Ваша почта для рассылки"
            name="email"
            type="email"
            placeholder="Ваша почта"
            required
          />
          <button className="pill footer-subscribe" disabled={busy}>
            ПОДПИСАТЬСЯ
          </button>
          <div className="footer-consents">
            <label className="consent">
              <input name="pdConsent" type="checkbox" required />
              <span>
                Даю <Link href="/info/consent">согласие на обработку персональных данных</Link>
              </span>
            </label>
            <label className="consent">
              <input name="consent" type="checkbox" required />
              <span>
                Согласен получать <Link href="/info/marketing">рекламу и рассылки</Link>
              </span>
            </label>
          </div>
        </form>
      </div>

      <div className="footer-directory">
        <div className="footer-brand">
          <Link className="logo" href="/">
            hauteline.
          </Link>
          <p>
            Оригинальная одежда, обувь и аксессуары
            <br />
            из-за рубежа. На руках и под заказ.
          </p>
          <div className="footer-managers">
            <a
              className="footer-manager"
              href={settings.telegram || contacts}
              {...(settings.telegram ? { target: '_blank', rel: 'noreferrer' } : {})}
              aria-label="Написать менеджеру в Telegram"
            >
              <span>НАПИСАТЬ МЕНЕДЖЕРУ</span>
              <i>
                <img src="/figma/110-934/b9a9c.png" alt="" />
              </i>
            </a>
            <a
              className="footer-manager"
              href={settings.max || contacts}
              {...(settings.max ? { target: '_blank', rel: 'noreferrer' } : {})}
              aria-label="Написать менеджеру в MAX"
            >
              <span>НАПИСАТЬ МЕНЕДЖЕРУ</span>
              <i>
                <img src="/figma/110-934/b0b3b.png" alt="" />
              </i>
            </a>
          </div>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h3>{column.title}</h3>
            {column.links.map(([label, href]) => (
              <Link key={label} href={href}>
                {label}
              </Link>
            ))}
            {column.title === 'О HAUTELINE' && (
              <a
                href={settings.telegramChannel || contacts}
                {...(settings.telegramChannel ? { target: '_blank', rel: 'noreferrer' } : {})}
              >
                Telegram
              </a>
            )}
          </nav>
        ))}
      </div>

      <div className="footer-bottom">
        <div className="footer-payment">
          <span>БЕЗОПАСНАЯ ОПЛАТА</span>
          <b aria-label="Платёжная система МИР">МИР</b>
        </div>
        <div className="footer-support">
          <a href={'mailto:' + supportEmail}>{supportEmail}</a>
          <span>Поддержка {settings.hours || 'ежедневно 09:00 – 21:00 (МСК)'}</span>
        </div>
        <span className="footer-copyright">© 2026 HAUTELINE · Все права защищены</span>
        <Link className="footer-legal" href="/info/legal">
          {settings.legal || 'ИП · ИНН · ОГРНИП'}
        </Link>
        <div className="footer-socials">
          {socials.map((s) =>
            s.href ? (
              <a key={s.label} href={s.href} target="_blank" rel="noreferrer" aria-label={s.label}>
                {s.icon}
              </a>
            ) : (
              <Link key={s.label} href={contacts} aria-label={s.label + ', скоро'}>
                {s.icon}
              </Link>
            ),
          )}
        </div>
      </div>
    </footer>
  );
}
