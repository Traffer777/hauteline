import { Suspense } from 'react';
import type { Metadata } from 'next';
import Screens from '@/components/screens';
import { catalog } from '@/lib/server';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = (await params).id;
  try {
    const p = catalog().find((item) => item.id === id && item.published);
    if (p) {
      const title = [p.brand, p.name].filter(Boolean).join(' — ');
      return {
        title: title + ' — Hauteline',
        description: p.description || 'Оригинальная вещь ' + title + ' в Hauteline.',
        openGraph: { title, images: p.image ? [p.image] : undefined },
      };
    }
  } catch {}
  return { title: 'Товар — Hauteline' };
}

export default async function Page({ params }: Props) {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <Screens path={['product', (await params).id]} />
    </Suspense>
  );
}
