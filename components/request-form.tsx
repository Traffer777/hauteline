'use client';
import { useState } from 'react';
import RequestSuccess from './request-success';
import { api } from '@/lib/client-api';
import { Choice, Consent } from './form-controls';
export default function RequestForm({ embedded = false }: { embedded?: boolean }) {
  const Heading = embedded ? 'h2' : 'h1';
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [messenger, setMessenger] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (sent) return <RequestSuccess embedded={embedded} />;
  return (
    <section
      id={embedded ? 'request' : undefined}
      className={'request-page' + (embedded ? ' request-embedded' : '')}
    >
      <div className="request-ribbon-frame">
        <div className="request-ribbon">
          <span className="sr-only">Оригинал из Азии, Европы и США</span>
          <div className="request-ribbon-track" aria-hidden="true">
            {[0, 1].map((group) => (
              <span className="request-ribbon-group" key={group}>
                {[0, 1, 2].map((item) => (
                  <span key={item}>
                    Оригинал из Азии, Европы и США <i>✦</i>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>
      <small>ПЕРСОНАЛЬНЫЙ ПОИСК</small>
      <Heading className="request-title">
        НАЙДЁМ ЛЮБУЮ
        <br />
        ПОЗИЦИЮ
      </Heading>
      <p className="request-description">
        Оригинальная одежда, обувь и аксессуары
        <br />
        под заказ из Европы, США и Азии.
      </p>
      <small className="request-tagline">ЛЮБЫЕ БРЕНДЫ · АКТУАЛЬНЫЕ КОЛЛЕКЦИИ · ЛИЧНЫЙ СЕРВИС</small>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          const f = new FormData(e.currentTarget);
          try {
            await api('requests', { ...Object.fromEntries(f), consent, marketing, messenger });
            setSent(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="request-contact-fields">
          <input name="email" type="email" placeholder="Почта" aria-label="Почта" required />
          <input name="name" placeholder="Как вас зовут" aria-label="Как вас зовут" required />
          <input
            name="description"
            placeholder="Что ищем: бренд, модель, размер"
            aria-label="Что ищем: бренд, модель, размер"
            maxLength={3000}
          />
          <input name="contact" placeholder="Ваш контакт" aria-label="Ваш контакт" required />
          <Choice
            value={messenger}
            onChange={setMessenger}
            items={['Telegram', 'MAX', 'WhatsApp']}
            label="Какой мессенджер используете"
          />
        </div>
        <p className="response-time">Напишем вам в течение нескольких часов</p>
        <div className="stack consent-stack">
          <Consent checked={consent} onChange={setConsent} />
          <Consent checked={marketing} onChange={setMarketing} marketing />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button
          className="request-submit"
          disabled={!consent || busy || !messenger}
          data-hint={
            busy
              ? undefined
              : !messenger && !consent
                ? 'Выберите мессенджер и примите согласие на обработку данных'
                : !messenger
                  ? 'Выберите мессенджер, в котором вам написать'
                  : !consent
                    ? 'Примите согласие на обработку персональных данных'
                    : undefined
          }
        >
          {busy ? 'Отправляем…' : 'Отправить запрос'}
        </button>
      </form>
    </section>
  );
}
