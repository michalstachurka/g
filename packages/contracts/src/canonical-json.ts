/**
 * Deterministyczna serializacja JSON (posortowane klucze) używana do checksum
 * konfiguracji, renderSpec i snapshotów. Działa w Node i w przeglądarce.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const result: Record<string, unknown> = {};
    for (const [k, v] of entries) result[k] = sortValue(v);
    return result;
  }
  return value;
}
