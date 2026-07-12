/** Komunikacja workera z API przez endpointy /internal (token współdzielony). */
const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const WORKER_TOKEN = process.env.WORKER_TOKEN ?? 'dev-worker-token';

async function internalFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('x-worker-token', WORKER_TOKEN);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`API ${path} -> ${response.status}: ${body.slice(0, 300)}`);
  }
  return response;
}

export async function getJson<T>(path: string): Promise<T> {
  return (await internalFetch(path)).json() as Promise<T>;
}

export async function getBinary(path: string): Promise<Uint8Array> {
  const response = await internalFetch(path);
  return new Uint8Array(await response.arrayBuffer());
}

export async function postJson(path: string, body: unknown): Promise<void> {
  await internalFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function uploadFile(
  path: string,
  file: Uint8Array,
  fileName: string,
  extra?: Record<string, string>,
): Promise<void> {
  const form = new FormData();
  form.append('file', new Blob([file]), fileName);
  for (const [key, value] of Object.entries(extra ?? {})) form.append(key, value);
  await internalFetch(path, { method: 'POST', body: form });
}
