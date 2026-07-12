'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Spinner } from '@door/ui';
import { adminApi } from '@/lib/admin-api';
import { DataTable, InlineForm, PageHeader, SelectInput, TextInput } from '@/components/shared';

interface StepRow { id: string; key: string; title: unknown; order: number; visible: boolean; category: { name: string } | null }
interface FieldRow { id: string; key: string; label: unknown; type: string; order: number; visible: boolean; required: boolean; mapsTo3d: string | null; step: { key: string }; optionGroup: { key: string } | null }

const label = (value: unknown) => (typeof value === 'string' ? value : ((value as Record<string, string>)?.pl ?? ''));

export default function FieldsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['catalog'], queryFn: adminApi.catalog });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['catalog'] });
  const [newField, setNewField] = useState({ key: '', label: '', stepKey: '', type: 'select', optionGroupKey: '', mapsTo3d: '' });

  if (isLoading || !data) return <Spinner label="Wczytywanie schematu…" />;
  const steps = data.steps as StepRow[];
  const fields = data.fields as FieldRow[];
  const groups = data.groups as { key: string; name: string }[];
  const materials = data.materials as { key: string; name: string; baseColorHex: string; kind: string }[];
  const options = data.options as { id: string; value: string; label: unknown; group: { key: string }; materialKey: string | null }[];

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Kroki i pola konfiguratora"
        description="Kroki, pola i opcje są danymi tenanta - konfigurator buduje formularz z tego schematu. Zmiana nazwy pola działa natychmiast po odświeżeniu konfiguratora."
      />

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Kroki</h2>
        <DataTable
          headers={['Klucz', 'Tytuł (klik = edycja)', 'Zakres', 'Kolejność', 'Widoczny']}
          rows={steps.map((step) => [
            <code key="k" className="text-xs">{step.key}</code>,
            <InlineEdit key="t" value={label(step.title)} onSave={(title) => adminApi.updateEntity('steps', step.key, { title: { pl: title } }).then(refresh)} />,
            step.category?.name ?? 'wszystkie kategorie',
            <InlineEdit key="o" value={String(step.order)} numeric onSave={(order) => adminApi.updateEntity('steps', step.key, { order: Number(order) }).then(refresh)} />,
            <input key="v" type="checkbox" checked={step.visible} onChange={(e) => adminApi.updateEntity('steps', step.key, { visible: e.target.checked }).then(refresh)} />,
          ])}
        />
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Pola</h2>
        <DataTable
          headers={['Klucz', 'Etykieta (klik = edycja)', 'Krok', 'Typ', 'Grupa opcji', 'Mapowanie 3D', 'Kolejność', 'Widoczne']}
          rows={fields.map((field) => [
            <code key="k" className="text-xs">{field.key}</code>,
            <InlineEdit key="l" value={label(field.label)} onSave={(text) => adminApi.updateEntity('fields', field.key, { label: { pl: text } }).then(refresh)} />,
            field.step.key,
            field.type,
            field.optionGroup?.key ?? '-',
            <code key="m" className="text-[10px] text-[var(--c-text-muted)]">{field.mapsTo3d ?? '-'}</code>,
            <InlineEdit key="o" value={String(field.order)} numeric onSave={(order) => adminApi.updateEntity('fields', field.key, { order: Number(order) }).then(refresh)} />,
            <input key="v" type="checkbox" checked={field.visible} onChange={(e) => adminApi.updateEntity('fields', field.key, { visible: e.target.checked }).then(refresh)} />,
          ])}
        />
        <div className="mt-3">
          <InlineForm
            submitLabel="Dodaj pole"
            onSubmit={async () => {
              await adminApi.createEntity('fields', {
                key: newField.key,
                label: { pl: newField.label },
                stepKey: newField.stepKey,
                type: newField.type,
                optionGroupKey: newField.optionGroupKey || undefined,
                mapsTo3d: newField.mapsTo3d || undefined,
              });
              setNewField({ key: '', label: '', stepKey: '', type: 'select', optionGroupKey: '', mapsTo3d: '' });
              refresh();
            }}
          >
            <TextInput label="Klucz" required value={newField.key} onChange={(e) => setNewField({ ...newField, key: e.target.value })} />
            <TextInput label="Etykieta" required value={newField.label} onChange={(e) => setNewField({ ...newField, label: e.target.value })} />
            <SelectInput label="Krok" required value={newField.stepKey} onChange={(e) => setNewField({ ...newField, stepKey: e.target.value })} options={[{ value: '', label: '- wybierz -' }, ...steps.map((s) => ({ value: s.key, label: label(s.title) }))]} />
            <SelectInput label="Typ" value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value })} options={['select', 'radio_cards', 'color_select', 'toggle', 'number', 'dimensions', 'text', 'textarea'].map((v) => ({ value: v, label: v }))} />
            <SelectInput label="Grupa opcji" value={newField.optionGroupKey} onChange={(e) => setNewField({ ...newField, optionGroupKey: e.target.value })} options={[{ value: '', label: 'brak' }, ...groups.map((g) => ({ value: g.key, label: g.name }))]} />
            <TextInput label="Mapowanie 3D (np. material:glass)" value={newField.mapsTo3d} onChange={(e) => setNewField({ ...newField, mapsTo3d: e.target.value })} />
          </InlineForm>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Grupy opcji</h2>
          <ul className="space-y-2 text-sm">
            {groups.map((group) => (
              <li key={group.key} className="rounded-md border border-[var(--c-border)] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{group.name}</span>
                  <code className="text-xs text-[var(--c-text-muted)]">{group.key}</code>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {options
                    .filter((option) => option.group.key === group.key)
                    .map((option) => (
                      <span key={option.id} className="rounded-full bg-black/5 px-2 py-0.5 text-xs" title={option.materialKey ?? undefined}>
                        {label(option.label)}
                      </span>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Materiały publiczne (dekory)</h2>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {materials.map((material) => (
              <li key={material.key} className="flex items-center gap-2 rounded-md border border-[var(--c-border)] p-2">
                <span className="h-6 w-6 rounded-full border border-black/10" style={{ background: material.baseColorHex }} />
                <div>
                  <div className="text-xs font-medium">{material.name}</div>
                  <div className="text-[10px] text-[var(--c-text-muted)]">{material.kind}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function InlineEdit({ value, onSave, numeric }: { value: string; onSave: (value: string) => void; numeric?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <button className="text-left hover:underline" onClick={() => { setDraft(value); setEditing(true); }}>
        {value}
      </button>
    );
  }
  return (
    <input
      autoFocus
      type={numeric ? 'number' : 'text'}
      className="w-28 rounded border border-[var(--c-border)] px-1.5 py-0.5 text-sm"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { onSave(draft); setEditing(false); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { onSave(draft); setEditing(false); }
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}
