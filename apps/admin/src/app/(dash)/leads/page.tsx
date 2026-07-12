'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Spinner } from '@door/ui';
import { adminApi } from '@/lib/admin-api';
import { DataTable, PageHeader, StatusBadge } from '@/components/shared';

interface LeadRow {
  id: string; status: string; createdAt: string; message: string | null;
  customer: { name?: string; phone?: string; email?: string; postalCode?: string };
  configuration: { shareId: string; categoryKey: string; modelKey: string | null } | null;
}

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['leads'], queryFn: adminApi.leads });
  if (isLoading || !data) return <Spinner label="Wczytywanie leadów…" />;

  return (
    <div>
      <PageHeader title="Leady i zapytania" description="Zapytania o wycenę z konfiguratora wraz z powiązaną konfiguracją." />
      <DataTable
        headers={['Data', 'Klient', 'Kontakt', 'Konfiguracja', 'Wiadomość', 'Status']}
        rows={(data as LeadRow[]).map((lead) => [
          new Date(lead.createdAt).toLocaleString('pl-PL'),
          lead.customer?.name ?? '-',
          <span key="c" className="text-xs">{[lead.customer?.phone, lead.customer?.email, lead.customer?.postalCode].filter(Boolean).join(' | ')}</span>,
          lead.configuration ? <code key="cf" className="text-xs">{lead.configuration.shareId}</code> : '-',
          <span key="m" className="block max-w-56 truncate text-xs" title={lead.message ?? ''}>{lead.message ?? '-'}</span>,
          <select
            key="s"
            className="rounded border border-[var(--c-border)] px-1.5 py-1 text-xs"
            value={lead.status}
            onChange={async (e) => {
              await adminApi.updateLead(lead.id, e.target.value);
              queryClient.invalidateQueries({ queryKey: ['leads'] });
            }}
          >
            <option value="new">nowy</option>
            <option value="contacted">w kontakcie</option>
            <option value="closed">zamknięty</option>
          </select>,
        ])}
      />
    </div>
  );
}
