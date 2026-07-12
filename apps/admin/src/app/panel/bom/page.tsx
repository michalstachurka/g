'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { bomItemDefSchema } from '@door/contracts';
import { Spinner } from '@door/ui';
import { adminApi } from '@/lib/admin-api';
import { PageHeader, TextInput } from '@/components/shared';
import { VersionedEditor } from '@/components/VersionedEditor';

export default function BomPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['bom'], queryFn: adminApi.bomRecipes });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['bom'] });
  const [modelKey, setModelKey] = useState('porta-lite-pelne');
  if (isLoading || !data) return <Spinner label="Wczytywanie receptur…" />;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Receptury BOM"
        description="Wewnętrzne receptury produkcyjne: komponenty, SKU, formuły ilości liczone na serwerze (powierzchnia, obwód, liczba zawiasów), etapy i koszty wewnętrzne. Dostęp: role produkcyjne."
      />
      <div className="mb-3">
        <TextInput label="Model dla nowej receptury (klucz)" value={modelKey} onChange={(e) => setModelKey(e.target.value)} />
      </div>
      <VersionedEditor
        rows={data}
        editableField="items"
        validate={(parsed) => {
          const result = z.array(bomItemDefSchema).safeParse(parsed);
          return result.success ? null : result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).slice(0, 3).join('; ');
        }}
        onCreateVersion={async (base, payload) => {
          await adminApi.createBom({
            modelKey: (base?.model as { key?: string } | undefined)?.key ?? modelKey,
            name: base ? `${base.name} (kopia)` : `Receptura ${modelKey}`,
            items: payload ?? [],
          });
          refresh();
        }}
        onPublish={async (row) => {
          await adminApi.publishBom(row.id);
          refresh();
        }}
        onTest={(row, input) => adminApi.testBom(row.id, input)}
        testDefaults={{ widthMm: 900, heightMm: 2100, selections: { lock_type: 'wc', ventilation: 'tuleje' } }}
        extraColumns={(row) => <span className="text-xs text-[var(--c-text-muted)]">{(row.model as { key?: string } | undefined)?.key}</span>}
      />
    </div>
  );
}
