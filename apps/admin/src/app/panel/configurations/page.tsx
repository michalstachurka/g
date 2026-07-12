'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Modal, Spinner } from '@door/ui';
import { adminApi, API_URL } from '@/lib/admin-api';
import { DataTable, PageHeader, StatusBadge } from '@/components/shared';

interface ConfigRow {
  id: string; shareId: string; name: string | null; categoryKey: string; modelKey: string | null;
  status: string; revision: number; updatedAt: string;
  snapshots: { evaluateResult: { priceSummary?: { amount: number; currency: string } | null } }[];
  leads: unknown[];
}

export default function ConfigurationsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['configurations'], queryFn: adminApi.configurations });
  const [bomFor, setBomFor] = useState<string | null>(null);
  const [bom, setBom] = useState<{ recipeVersion: number | null; lines: { componentName: string; sku: string; qty: number; unit: string; stage: string; internalCost: number | null }[]; widthMm?: number; heightMm?: number; notice?: string } | null>(null);
  const [bomError, setBomError] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const configuratorUrl = process.env.NEXT_PUBLIC_CONFIGURATOR_URL ?? 'http://localhost:3000';

  if (isLoading || !data) return <Spinner label="Wczytywanie konfiguracji…" />;

  async function openBom(shareId: string) {
    setBomFor(shareId);
    setBom(null);
    setBomError(null);
    try {
      setBom((await adminApi.configurationBom(shareId)) as never);
    } catch (error) {
      setBomError((error as Error).message);
    }
  }

  async function generateDocument(shareId: string, kind: string) {
    setDocBusy(shareId + kind);
    try {
      const { documentId } = await adminApi.requestAdminDocument(shareId, kind);
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const status = await adminApi.adminDocumentStatus(documentId);
        if (status.status === 'done' && status.downloadUrl) {
          window.open(`${API_URL}${status.downloadUrl}`, '_blank');
          return;
        }
        if (status.status === 'failed') { alert(`Generowanie nie powiodło się: ${status.error ?? ''}`); return; }
      }
    } finally {
      setDocBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="Konfiguracje i oferty" description="Zapisane konfiguracje klientów ze snapshotami ceny. BOM produkcyjny dostępny tylko dla uprawnionych ról (403 dla pozostałych)." />
      <DataTable
        headers={['Numer', 'Nazwa', 'Kategoria / model', 'Cena (snapshot)', 'Status', 'Zmieniono', 'Akcje']}
        rows={(data as ConfigRow[]).map((row) => {
          const price = row.snapshots[0]?.evaluateResult?.priceSummary;
          return [
            <a key="s" className="font-mono text-xs underline" href={`${configuratorUrl}/demo/c/${row.shareId}`} target="_blank" rel="noreferrer">{row.shareId}</a>,
            row.name ?? '-',
            `${row.categoryKey} / ${row.modelKey ?? '-'}`,
            price ? `${(price.amount / 100).toFixed(2)} ${price.currency}` : '-',
            <StatusBadge key="st" status={row.status} />,
            new Date(row.updatedAt).toLocaleString('pl-PL'),
            <span key="a" className="flex flex-wrap gap-2 text-xs">
              <button className="underline" onClick={() => openBom(row.shareId)}>BOM</button>
              <button className="underline disabled:opacity-40" disabled={docBusy === row.shareId + 'sales_quote'} onClick={() => generateDocument(row.shareId, 'sales_quote')}>Oferta PDF</button>
              <button className="underline disabled:opacity-40" disabled={docBusy === row.shareId + 'production_bom'} onClick={() => generateDocument(row.shareId, 'production_bom')}>BOM PDF</button>
              <button className="underline disabled:opacity-40" disabled={docBusy === row.shareId + 'measurement_sheet'} onClick={() => generateDocument(row.shareId, 'measurement_sheet')}>Karta pomiarowa</button>
            </span>,
          ];
        })}
      />

      <Modal open={bomFor != null} onClose={() => setBomFor(null)} title={`Wewnętrzny BOM - ${bomFor ?? ''}`} wide>
        {bomError ? <p className="text-sm text-[var(--c-error)]">{bomError}</p> : null}
        {!bom && !bomError ? <Spinner label="Liczenie BOM na serwerze…" /> : null}
        {bom?.notice ? <p className="text-sm text-[var(--c-text-muted)]">{bom.notice}</p> : null}
        {bom && bom.lines.length > 0 ? (
          <>
            <p className="mb-2 text-xs text-[var(--c-text-muted)]">
              Receptura v{bom.recipeVersion} | wymiar {bom.widthMm}x{bom.heightMm} mm. Dane wewnętrzne - nie trafiają do klienta.
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--c-border)] text-left text-[var(--c-text-muted)]">
                  <th className="py-1.5 pr-2">Komponent</th><th className="pr-2">SKU</th><th className="pr-2">Ilość</th><th className="pr-2">Jedn.</th><th className="pr-2">Etap</th><th>Koszt wewn.</th>
                </tr>
              </thead>
              <tbody>
                {bom.lines.map((line, i) => (
                  <tr key={i} className="border-b border-[var(--c-border)] last:border-0">
                    <td className="py-1.5 pr-2">{line.componentName}</td>
                    <td className="pr-2 font-mono">{line.sku}</td>
                    <td className="pr-2">{line.qty}</td>
                    <td className="pr-2">{line.unit}</td>
                    <td className="pr-2">{line.stage}</td>
                    <td>{line.internalCost != null ? `${(line.internalCost / 100).toFixed(2)} zł` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
