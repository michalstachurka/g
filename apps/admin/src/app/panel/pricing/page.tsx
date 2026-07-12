'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { priceRuleDefSchema } from '@door/contracts';
import { Spinner } from '@door/ui';
import { adminApi } from '@/lib/admin-api';
import { PageHeader } from '@/components/shared';
import { VersionedEditor } from '@/components/VersionedEditor';

export default function PricingPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['pricelists'], queryFn: adminApi.priceLists });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['pricelists'] });
  if (isLoading || !data) return <Spinner label="Wczytywanie cenników…" />;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Cenniki"
        description="Ceny bazowe, dopłaty stałe i procentowe, macierz wymiarowa, usługi, rabaty, cena minimalna, VAT i zaokrąglenia. Kwoty w groszach. Symulator liczy pełny wewnętrzny rozkład - widoczny tylko w panelu."
      />
      <VersionedEditor
        rows={data}
        editableField="rules"
        validate={(parsed) => {
          const result = z.array(priceRuleDefSchema).safeParse(parsed);
          return result.success ? null : result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).slice(0, 3).join('; ');
        }}
        onCreateVersion={async (base, payload) => {
          await adminApi.createPriceList({
            name: base ? `${base.name} (kopia)` : 'Nowy cennik',
            settings: (base?.settings as object) ?? { currency: 'PLN', taxRatePercent: 23, taxMode: 'gross', rounding: 'to_zloty', currencyRate: 1 },
            rules: payload ?? [],
          });
          refresh();
        }}
        onSaveDraft={async (row, payload) => {
          await adminApi.updatePriceList(row.id, { rules: payload });
          refresh();
        }}
        onPublish={async (row) => {
          await adminApi.publishPriceList(row.id);
          refresh();
        }}
        onTest={(row, input) => adminApi.simulatePrice(row.id, input)}
        testDefaults={{ modelKey: 'porta-lite-pelne', widthMm: 900, heightMm: 2100, selections: { lock_type: 'wc', measurement_service: true, installation_service: true } }}
      />
    </div>
  );
}
