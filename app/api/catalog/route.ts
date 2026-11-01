import { catalog, settings, promoActive } from '@/lib/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const active = promoActive(settings());
  return Response.json(
    catalog()
      .filter((p) => p.published && p.stock > 0)
      .map((p) => ({ ...p, promo: p.promo && active })),
  );
}
