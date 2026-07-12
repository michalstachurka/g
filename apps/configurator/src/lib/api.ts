import type {
  EvaluateRequest,
  EvaluateResponse,
  PublicAssetInfo,
  PublicBranding,
  PublicCategory,
  PublicMaterialDef,
  PublicSchema,
  SelectionValue,
} from '@door/contracts';

/**
 * Adres API. Puste = ten sam origin. Host bez schematu (np. z fromService na
 * Render) uzupełniamy o https://. Domyślnie lokalny backend.
 */
function resolveApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (raw == null) return 'http://localhost:4000';
  if (raw === '') return '';
  if (/^https?:\/\//.test(raw)) return raw;
  return `https://${raw}`;
}

export const API_URL = resolveApiUrl();

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error((body as { message?: string })?.message ?? `Błąd ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const publicApi = {
  branding: (tenant: string) => get<PublicBranding>(`/public/${tenant}/branding`),
  categories: (tenant: string) => get<PublicCategory[]>(`/public/${tenant}/categories`),
  schema: (tenant: string, categoryKey: string) =>
    get<PublicSchema>(`/public/${tenant}/schema/${categoryKey}`),
  materials: (tenant: string) => get<PublicMaterialDef[]>(`/public/${tenant}/materials`),
  manifest: (tenant: string, publicAssetId: string) =>
    get<PublicAssetInfo>(`/public/${tenant}/assets/${publicAssetId}/manifest`),
  assetFileUrl: (tenant: string, publicAssetId: string) =>
    `${API_URL}/public/${tenant}/assets/${publicAssetId}/file`,

  evaluate: (tenant: string, request: EvaluateRequest, signal?: AbortSignal) =>
    get<EvaluateResponse>(`/public/${tenant}/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    }),

  saveConfiguration: (
    tenant: string,
    payload: { request: EvaluateRequest; name?: string | null; customerNote?: string | null; shareId?: string | null },
  ) =>
    get<{ shareId: string; revision: number; snapshotId: string; evaluate: EvaluateResponse }>(
      `/public/${tenant}/configurations`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) },
    ),

  getConfiguration: (tenant: string, shareId: string) =>
    get<{
      shareId: string;
      categoryKey: string;
      modelKey: string | null;
      name: string | null;
      selections: Record<string, SelectionValue>;
      revision: number;
      evaluate: EvaluateResponse | null;
      createdAt: string;
    }>(`/public/${tenant}/configurations/${shareId}`),

  requestDocument: (tenant: string, shareId: string) =>
    get<{ documentId: string; status: string }>(
      `/public/${tenant}/configurations/${shareId}/documents`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    ),
  documentStatus: (tenant: string, documentId: string) =>
    get<{ id: string; status: string; error: string | null; downloadUrl: string | null }>(
      `/public/${tenant}/documents/${documentId}`,
    ),

  requestAr: (tenant: string, shareId: string) =>
    get<{ jobs: { kind: string; id: string; status: string }[] }>(
      `/public/${tenant}/configurations/${shareId}/ar`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    ),
  arStatus: (tenant: string, shareId: string) =>
    get<{
      glb: { status: string; url: string | null; error: string | null } | null;
      usdz: { status: string; url: string | null; error: string | null } | null;
    }>(`/public/${tenant}/configurations/${shareId}/ar`),

  qrUrl: (tenant: string, path: string) =>
    `${API_URL}/public/${tenant}/qr.png?path=${encodeURIComponent(path)}`,

  sendLead: (
    tenant: string,
    payload: { name: string; email?: string; phone?: string; postalCode?: string; message?: string; consent: true; configurationShareId?: string | null },
  ) =>
    get<{ leadId: string; message: string }>(`/public/${tenant}/leads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  emailConfiguration: (tenant: string, shareId: string, to: string) =>
    get<{ ok: boolean; delivery: string }>(`/public/${tenant}/configurations/${shareId}/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to }),
    }),
};

export function formatPrice(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(amountMinor / 100);
}
