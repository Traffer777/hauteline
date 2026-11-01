'use client';
import { Header } from './storefront';

export default function LoadingScreen({ target = 'каталог' }: { target?: string }) {
  return (
    <div className="connection-loader" role="status" aria-live="polite" aria-label={'Загрузка: ' + target}>
      <img className="connection-loader-background" src="/figma/104-2688/ca7ab.svg" alt="" />
      {/* копия шапки — только картинка: без фокуса, без чтения экранным диктором и без повторных id */}
      <div className="connection-loader-header" inert aria-hidden="true">
        <Header decorative />
      </div>
      <div className="connection-loader-copy">
        <p className="connection-loader-eyebrow">ЕЩЁ ОДИН МОМЕНТ</p>
        <h1>
          Скоро откроем
          <br />
          {target}.
        </h1>
        <p className="connection-loader-description">
          Проверяем соединение.
          <br />
          Это займёт всего несколько секунд.
        </p>
        <div className="connection-loader-progress">
          <div className="connection-loader-dots" aria-hidden="true">
            <img src="/figma/104-2688/ce4ef.svg" alt="" />
            <img src="/figma/104-2688/131cb.svg" alt="" />
            <img src="/figma/104-2688/131cb.svg" alt="" />
          </div>
          <span>Пожалуйста, подождите</span>
        </div>
      </div>
      <div className="connection-loader-bottom">
        <div className="connection-loader-rule">
          <img src="/figma/104-2688/7bff2.svg" alt="" />
        </div>
        <div>
          <span>Оригинальная одежда, обувь и аксессуары</span>
          <span>Помощь</span>
        </div>
      </div>
    </div>
  );
}
