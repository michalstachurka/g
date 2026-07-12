'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Spinner } from '@door/ui';
import { adminApi } from '@/lib/admin-api';
import { PageHeader } from '@/components/shared';
import { VersionedEditor } from '@/components/VersionedEditor';

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['templates'], queryFn: adminApi.templates });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['templates'] });
  if (isLoading || !data) return <Spinner label="Wczytywanie szablonów…" />;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Szablony dokumentów PDF"
        description="Bezpieczny zakres edycji: kolor akcentu, logo, sekcje, teksty, stopka, widoczność ceny/QR/renderu. Bez kodu. PDF generuje wyłącznie worker z zatwierdzonego snapshotu."
      />
      <VersionedEditor
        rows={data}
        editableField="config"
        onCreateVersion={async (base, payload) => {
          await adminApi.createTemplate({
            kind: (base?.kind as string) ?? 'customer_specification',
            name: base ? `${base.name} (kopia)` : 'Nowy szablon',
            config: payload ?? {
              accentColor: '#1a1a1a', showLogo: true, showPrice: true, showQr: true, showRender: true,
              showWarnings: true, footerText: '', introText: '', sectionsOrder: ['summary', 'options', 'services', 'price'],
            },
          });
          refresh();
        }}
        onPublish={async (row) => {
          await adminApi.publishTemplate(row.id);
          refresh();
        }}
        extraColumns={(row) => <code className="text-xs text-[var(--c-text-muted)]">{String(row.kind)}</code>}
      />
    </div>
  );
}
