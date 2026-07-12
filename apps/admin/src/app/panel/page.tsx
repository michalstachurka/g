'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Spinner } from '@door/ui';
import { adminApi } from '@/lib/admin-api';
import { PageHeader } from '@/components/shared';

export default function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: adminApi.dashboard });
  const { data: missing } = useQuery({ queryKey: ['missing-report'], queryFn: adminApi.missingReport });

  if (isLoading || !data) return <Spinner label="Wczytywanie pulpitu…" />;

  const stats: [string, unknown][] = [
    ['Konfiguracje (łącznie)', data.configurations],
    ['Konfiguracje (30 dni)', data.configurationsLast30Days],
    ['Leady', data.leads],
    ['Konwersja do zapytania', `${data.conversionToLead}%`],
    ['Wygenerowane dokumenty', data.documentsGenerated],
    ['Błędy pipeline AR', data.failedModelJobs],
  ];

  return (
    <div>
      <PageHeader title="Pulpit" description="Stan konfiguratora, katalogu i pipeline'u assetów." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map(([label, value]) => (
          <Card key={label} className="p-4">
            <div className="text-2xl font-semibold">{String(value)}</div>
            <div className="mt-1 text-xs text-[var(--c-text-muted)]">{label}</div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Najczęściej wybierane modele (30 dni)</h2>
          <ul className="space-y-1.5 text-sm">
            {(data.topModels as { modelKey: string; count: number }[]).map((m) => (
              <li key={m.modelKey} className="flex justify-between">
                <span>{m.modelKey ?? 'bez modelu'}</span>
                <span className="font-medium">{m.count}</span>
              </li>
            ))}
            {(data.topModels as unknown[]).length === 0 ? <li className="text-[var(--c-text-muted)]">Brak danych.</li> : null}
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Gotowość wizualizacji kategorii</h2>
          <ul className="space-y-2 text-sm">
            {(missing as { categoryKey: string; categoryName: string; ready: boolean; modelsCount: number; problems: { modelKey: string; detail: string }[] }[] | undefined)?.map((c) => (
              <li key={c.categoryKey} className="rounded-md border border-[var(--c-border)] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.categoryName}</span>
                  {c.ready ? (
                    <span className="text-xs text-[var(--c-success)]">gotowa</span>
                  ) : (
                    <span className="text-xs font-medium text-[var(--c-warning)]">MISSING_ASSET</span>
                  )}
                </div>
                {!c.ready ? (
                  <div className="mt-1 text-xs text-[var(--c-text-muted)]">
                    {c.modelsCount === 0
                      ? 'Brak modeli w kategorii - wymagane dostarczenie GLB (docs/ASSET_REQUIREMENTS.md §3).'
                      : c.problems.map((p) => `${p.modelKey}: ${p.detail}`).join('; ')}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4 p-4">
        <h2 className="mb-3 text-sm font-semibold">Ostatnie zmiany</h2>
        <ul className="space-y-1 text-xs text-[var(--c-text-muted)]">
          {(data.recentChanges as { id: string; action: string; entity: string; userEmail: string | null; createdAt: string }[]).map((log) => (
            <li key={log.id}>
              {new Date(log.createdAt).toLocaleString('pl-PL')} - {log.userEmail ?? 'system'}: {log.action} {log.entity}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
