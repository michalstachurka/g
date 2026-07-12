'use client';

import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@door/ui';
import { adminApi } from '@/lib/admin-api';
import { DataTable, PageHeader } from '@/components/shared';

interface AuditRow { id: string; createdAt: string; userEmail: string | null; action: string; entity: string; entityId: string | null; before: unknown; after: unknown }

export default function AuditPage() {
  const { data, isLoading } = useQuery({ queryKey: ['audit'], queryFn: adminApi.auditLog });
  if (isLoading || !data) return <Spinner label="Wczytywanie audytu…" />;
  return (
    <div>
      <PageHeader title="Audit log" description="Kto, kiedy i co zmienił - w tym publikacje reguł, cenników, BOM i assetów, z wartościami przed/po dla danych krytycznych." />
      <DataTable
        headers={['Kiedy', 'Kto', 'Akcja', 'Obiekt', 'Szczegóły']}
        rows={(data as AuditRow[]).map((log) => [
          new Date(log.createdAt).toLocaleString('pl-PL'),
          log.userEmail ?? 'system',
          log.action,
          `${log.entity}${log.entityId ? ` (${log.entityId.slice(-6)})` : ''}`,
          <details key="d" className="text-xs">
            <summary className="cursor-pointer text-[var(--c-text-muted)]">przed / po</summary>
            <pre className="mt-1 max-h-40 max-w-md overflow-auto rounded bg-[#101214] p-2 text-[10px] text-[#d8e0d8]">
              {JSON.stringify({ before: log.before, after: log.after }, null, 1)}
            </pre>
          </details>,
        ])}
      />
    </div>
  );
}
