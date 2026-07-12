'use client';

/**
 * Klient API panelu: sesja cookie + nagłówki x-tenant i x-csrf-token.
 * Kontekst tenanta i token CSRF trzymane w localStorage po zalogowaniu.
 */
function resolveApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (raw == null) return 'http://localhost:4000';
  if (raw === '') return '';
  if (/^https?:\/\//.test(raw)) return raw;
  return `https://${raw}`;
}

export const API_URL = resolveApiUrl();

export interface AdminSession {
  user: { id: string; email: string; name: string; isPlatformOwner: boolean };
  memberships: { tenantSlug: string; tenantName: string; role: string }[];
  csrfToken: string;
}

export function getTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('door.tenant');
}
export function setTenantSlug(slug: string) {
  localStorage.setItem('door.tenant', slug);
}
export function getCsrf(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('door.csrf');
}
export function setCsrf(token: string) {
  localStorage.setItem('door.csrf', token);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function adminFetch<T>(path: string, init?: RequestInit & { raw?: boolean }): Promise<T> {
  const headers = new Headers(init?.headers);
  const tenant = getTenantSlug();
  const csrf = getCsrf();
  if (tenant) headers.set('x-tenant', tenant);
  if (csrf && init?.method && init.method !== 'GET') headers.set('x-csrf-token', csrf);
  if (init?.body && typeof init.body === 'string') headers.set('content-type', 'application/json');

  const response = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
  if (response.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth')) {
    window.location.href = (process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/login';
    throw new ApiError('Sesja wygasła', 401);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body?.message.join('; ') : body?.message;
    throw new ApiError(message ?? `Błąd ${response.status}`, response.status);
  }
  if (init?.raw) return response as unknown as T;
  return response.json() as Promise<T>;
}

export const adminApi = {
  login: (email: string, password: string) =>
    adminFetch<AdminSession>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => adminFetch<{ ok: boolean }>('/auth/logout', { method: 'POST', body: '{}' }),
  me: () => adminFetch<AdminSession>('/auth/me'),

  dashboard: () => adminFetch<Record<string, unknown>>('/admin/dashboard'),
  branding: () => adminFetch<{ draft: Record<string, unknown>; publishedVersion: number | null }>('/admin/branding'),
  updateBranding: (patch: unknown) => adminFetch('/admin/branding', { method: 'PUT', body: JSON.stringify(patch) }),
  publishBranding: () => adminFetch('/admin/branding/publish', { method: 'POST', body: '{}' }),
  uploadBrandingFile: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return adminFetch<{ url: string }>('/admin/branding/upload', { method: 'POST', body: form });
  },

  catalog: () => adminFetch<Record<string, unknown[]>>('/admin/catalog/overview'),
  createEntity: (entity: string, payload: unknown) =>
    adminFetch(`/admin/catalog/${entity}`, { method: 'POST', body: JSON.stringify(payload) }),
  updateEntity: (entity: string, key: string, payload: unknown) =>
    adminFetch(`/admin/catalog/${entity}/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEntity: (entity: string, key: string) =>
    adminFetch(`/admin/catalog/${entity}/${encodeURIComponent(key)}`, { method: 'DELETE' }),

  assets: () => adminFetch<AdminAsset[]>('/admin/assets'),
  uploadAsset: (file: File, meta: { key: string; name: string; licenseInfo?: string }) => {
    const form = new FormData();
    form.append('file', file);
    form.append('key', meta.key);
    form.append('name', meta.name);
    if (meta.licenseInfo) form.append('licenseInfo', meta.licenseInfo);
    return adminFetch<{ assetKey: string; version: number; report: unknown }>('/admin/assets/upload', {
      method: 'POST',
      body: form,
    });
  },
  assetVersion: (assetKey: string, version: number) =>
    adminFetch<AdminAssetVersion>(`/admin/assets/${assetKey}/versions/${version}`),
  assetFileUrl: (assetKey: string, version: number) =>
    `${API_URL}/admin/assets/${assetKey}/versions/${version}/file`,
  updateManifest: (assetKey: string, version: number, patch: unknown) =>
    adminFetch<{ manifest: unknown; validationErrors: string[]; status: string }>(
      `/admin/assets/${assetKey}/versions/${version}/manifest`,
      { method: 'PUT', body: JSON.stringify(patch) },
    ),
  publishAsset: (assetKey: string, version: number) =>
    adminFetch<{ ok: boolean; publicAssetId: string }>(`/admin/assets/${assetKey}/versions/${version}/publish`, {
      method: 'POST',
      body: '{}',
    }),
  bundles: () => adminFetch<unknown[]>('/admin/assets/bundles'),
  createBundle: (payload: unknown) =>
    adminFetch('/admin/assets/bundles', { method: 'POST', body: JSON.stringify(payload) }),
  updateBundle: (key: string, payload: unknown) =>
    adminFetch(`/admin/assets/bundles/${key}`, { method: 'PUT', body: JSON.stringify(payload) }),
  publishBundle: (key: string) =>
    adminFetch(`/admin/assets/bundles/${key}/publish`, { method: 'POST', body: '{}' }),
  missingReport: () => adminFetch<unknown[]>('/admin/assets/missing-report'),

  ruleSets: () => adminFetch<VersionedRow[]>('/admin/rulesets'),
  createRuleSet: (payload: unknown) => adminFetch('/admin/rulesets', { method: 'POST', body: JSON.stringify(payload) }),
  updateRuleSet: (id: string, payload: unknown) =>
    adminFetch(`/admin/rulesets/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  publishRuleSet: (id: string) => adminFetch(`/admin/rulesets/${id}/publish`, { method: 'POST', body: '{}' }),
  testRuleSet: (id: string, payload: unknown) =>
    adminFetch(`/admin/rulesets/${id}/test`, { method: 'POST', body: JSON.stringify(payload) }),

  priceLists: () => adminFetch<VersionedRow[]>('/admin/pricelists'),
  createPriceList: (payload: unknown) => adminFetch('/admin/pricelists', { method: 'POST', body: JSON.stringify(payload) }),
  updatePriceList: (id: string, payload: unknown) =>
    adminFetch(`/admin/pricelists/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  publishPriceList: (id: string) => adminFetch(`/admin/pricelists/${id}/publish`, { method: 'POST', body: '{}' }),
  simulatePrice: (id: string, payload: unknown) =>
    adminFetch(`/admin/pricelists/${id}/simulate`, { method: 'POST', body: JSON.stringify(payload) }),

  bomRecipes: () => adminFetch<VersionedRow[]>('/admin/bom-recipes'),
  createBom: (payload: unknown) => adminFetch('/admin/bom-recipes', { method: 'POST', body: JSON.stringify(payload) }),
  publishBom: (id: string) => adminFetch(`/admin/bom-recipes/${id}/publish`, { method: 'POST', body: '{}' }),
  testBom: (id: string, payload: unknown) =>
    adminFetch(`/admin/bom-recipes/${id}/test`, { method: 'POST', body: JSON.stringify(payload) }),

  templates: () => adminFetch<VersionedRow[]>('/admin/templates'),
  createTemplate: (payload: unknown) => adminFetch('/admin/templates', { method: 'POST', body: JSON.stringify(payload) }),
  publishTemplate: (id: string) => adminFetch(`/admin/templates/${id}/publish`, { method: 'POST', body: '{}' }),

  configurations: () => adminFetch<unknown[]>('/admin/configurations'),
  configurationBom: (shareId: string) =>
    adminFetch<{ recipeVersion: number | null; lines: unknown[]; widthMm?: number; heightMm?: number; notice?: string }>(
      `/admin/configurations/${shareId}/bom`,
    ),
  requestAdminDocument: (shareId: string, kind: string) =>
    adminFetch<{ documentId: string; status: string }>(`/admin/configurations/${shareId}/documents`, {
      method: 'POST',
      body: JSON.stringify({ kind }),
    }),
  adminDocumentStatus: (id: string) =>
    adminFetch<{ id: string; status: string; downloadUrl: string | null; error: string | null }>(`/admin/documents/${id}`),

  leads: () => adminFetch<unknown[]>('/admin/leads'),
  updateLead: (id: string, status: string) =>
    adminFetch(`/admin/leads/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),

  users: () => adminFetch<unknown[]>('/admin/users'),
  inviteUser: (payload: unknown) => adminFetch<{ temporaryPassword: string | null }>('/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateMembership: (id: string, payload: unknown) =>
    adminFetch(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  auditLog: () => adminFetch<unknown[]>('/admin/audit'),
};

export interface AdminAsset {
  id: string;
  key: string;
  name: string;
  licenseInfo: unknown;
  versions: {
    id: string;
    version: number;
    status: string;
    fileName: string;
    byteSize: number;
    checksum: string;
    publicAssetId: string | null;
    hasManifest: boolean;
    createdAt: string;
    publishedAt: string | null;
  }[];
}

export interface AdminAssetVersion {
  id: string;
  assetKey: string;
  version: number;
  status: string;
  fileName: string;
  byteSize: number;
  checksum: string;
  report: GlbReportDto | null;
  manifest: Record<string, unknown> | null;
  validationErrors: string[] | null;
  publicAssetId: string | null;
}

export interface GlbNodeDto {
  path: string;
  name: string | null;
  meshIndex: number | null;
  triangles: number;
  materials: number[];
  bboxMin: [number, number, number] | null;
  bboxMax: [number, number, number] | null;
  children: GlbNodeDto[];
}

export interface GlbReportDto {
  valid: boolean;
  problems: string[];
  warnings: string[];
  generator: string | null;
  nodeCount: number;
  meshCount: number;
  materialCount: number;
  textureCount: number;
  animationCount: number;
  totalTriangles: number;
  byteSize: number;
  suggestedBaseWidthMm: number | null;
  suggestedBaseHeightMm: number | null;
  suggestedBaseDepthMm: number | null;
  materials: { index: number; name: string | null; hasTexture: boolean; alphaMode: string }[];
  tree: GlbNodeDto[];
}

export interface VersionedRow {
  id: string;
  name: string;
  version: number;
  status: string;
  publishedAt: string | null;
  [key: string]: unknown;
}
