'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ruleDefSchema } from '@door/contracts';
import { Spinner } from '@door/ui';
import { adminApi, type VersionedRow } from '@/lib/admin-api';
import { PageHeader } from '@/components/shared';
import { VersionedEditor } from '@/components/VersionedEditor';

export default function RulesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['rulesets'], queryFn: adminApi.ruleSets });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['rulesets'] });
  if (isLoading || !data) return <Spinner label="Wczytywanie reguł…" />;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Reguły zgodności i walidacji"
        description="Deklaratywne warunki (AND/OR/NOT, porównania, zbiory) i efekty: błąd, ostrzeżenie, wymuszenie, wykluczenie opcji, automatyczna korekta, limit wymiaru. Wersje draft/published z rollbackiem."
      />
      <VersionedEditor
        rows={data}
        editableField="rules"
        validate={(parsed) => {
          const result = z.array(ruleDefSchema).safeParse(parsed);
          return result.success ? null : result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).slice(0, 3).join('; ');
        }}
        onCreateVersion={async (base, payload) => {
          await adminApi.createRuleSet({ name: base ? `${base.name} (kopia)` : 'Nowy zestaw reguł', rules: payload ?? [] });
          refresh();
        }}
        onSaveDraft={async (row, payload) => {
          await adminApi.updateRuleSet(row.id, { rules: payload });
          refresh();
        }}
        onPublish={async (row) => {
          await adminApi.publishRuleSet(row.id);
          refresh();
        }}
        onTest={(row, input) => adminApi.testRuleSet(row.id, input)}
        testDefaults={{ categoryKey: 'pelne', modelKey: 'porta-lite-pelne', selections: { room: 'lazienka', ventilation: 'brak', lock_type: 'brak', width_mm: 980 } }}
      />
    </div>
  );
}
