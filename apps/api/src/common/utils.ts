import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { canonicalJson } from '@door/contracts';

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function checksumOf(value: unknown): string {
  return `sha256:${sha256Hex(canonicalJson(value))}`;
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

/** Nieprzewidywalny identyfikator publiczny assetu/modelu. */
export function publicId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}

const signedUrlSecret = () => process.env.SIGNED_URL_SECRET ?? 'dev-signed-url-secret';

/** Krótkotrwały podpisany token dostępu do pliku prywatnego. */
export function signPayload(payload: Record<string, string | number>, ttlSeconds: number): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString('base64url');
  const sig = createHmac('sha256', signedUrlSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyPayload(token: string): Record<string, unknown> | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', signedUrlSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Etykieta wielojęzyczna: {"pl": "..."} albo zwykły string. */
export function labelText(label: unknown, lang = 'pl'): string {
  if (typeof label === 'string') return label;
  if (label && typeof label === 'object') {
    const rec = label as Record<string, string>;
    return rec[lang] ?? Object.values(rec)[0] ?? '';
  }
  return '';
}
