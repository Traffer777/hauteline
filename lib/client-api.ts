export async function api(path: string, body?: unknown): Promise<any> {
  const r = await fetch(
    '/api/' + path,
    body === undefined
      ? undefined
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Не удалось выполнить действие. Проверьте подключение и попробуйте ещё раз');
  return data;
}
