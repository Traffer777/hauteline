import { Suspense } from 'react';
import type { Metadata } from 'next';
import Screens from '@/components/screens';
import { infoTitles } from '@/components/info-content';

const titles: Record<string, string> = {
  catalog: 'Каталог',
  cart: 'Корзина',
  checkout: 'Оформление заказа',
  request: 'Найти вещь',
  login: 'Вход',
  register: 'Регистрация',
  forgot: 'Восстановление доступа',
  reset: 'Новый пароль',
  setup: 'Настройка магазина',
  profile: 'Личный кабинет',
  orders: 'Мои посылки',
  payment: 'Оплата заказа',
  success: 'Спасибо за заказ',
  search: 'Поиск',
  favorites: 'Избранное',
  brands: 'Бренды',
  sale: 'Скидки',
  unsubscribe: 'Отписка от рассылки',
  admin: 'Панель команды',
};
const privatePages = new Set([
  'cart', 'checkout', 'login', 'register', 'forgot', 'reset', 'setup', 'profile', 'orders', 'payment',
  'success', 'favorites', 'unsubscribe', 'admin',
]);

type Props = { params: Promise<{ screen: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [name, sub] = (await params).screen;
  const title = name === 'info' ? infoTitles[sub] : titles[name];
  return {
    title: title ? title + ' — Hauteline' : 'Страница не найдена — Hauteline',
    robots: privatePages.has(name) || !title ? { index: false, follow: true } : undefined,
  };
}

export default async function Page({ params }: Props) {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <Screens path={(await params).screen} />
    </Suspense>
  );
}
