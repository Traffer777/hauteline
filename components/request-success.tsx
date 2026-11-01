import Link from 'next/link';
import { IconCheck } from './icons';

export default function RequestSuccess({ embedded = false }: { embedded?: boolean }) {
  const Heading = embedded ? 'h2' : 'h1';
  return (
    <section className="request-success" role="status" aria-live="polite">
      <div className="request-success-icon" aria-hidden="true">
        <IconCheck />
      </div>
      <small>ПЕРСОНАЛЬНЫЙ ПОИСК</small>
      <Heading>Запрос отправлен</Heading>
      <p>
        Напишем вам в течение нескольких часов
        <br className="request-success-break" /> в выбранном мессенджере.
      </p>
      <Link href="/catalog" className="pill">
        Вернуться в каталог <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
