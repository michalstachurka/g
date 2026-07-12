'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Spinner } from '@door/ui';
import { adminApi } from '@/lib/admin-api';
import { DataTable, InlineForm, PageHeader, SelectInput, StatusBadge, TextInput } from '@/components/shared';

interface Row { id: string; key: string; name: string; visible?: boolean; order?: number; status?: string; [k: string]: unknown }

export default function CatalogPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['catalog'], queryFn: adminApi.catalog });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['catalog'] });

  const [newCategory, setNewCategory] = useState({ key: '', name: '', systemKey: 'solid' });
  const [newFamily, setNewFamily] = useState({ key: '', name: '', categoryKey: '' });
  const [newModel, setNewModel] = useState({ key: '', name: '', familyKey: '', bundleKey: '' });

  if (isLoading || !data) return <Spinner label="Wczytywanie katalogu…" />;
  const categories = data.categories as Row[];
  const families = (data.families as (Row & { category: Row })[]) ?? [];
  const models = (data.models as (Row & { family: Row; bundle: Row | null })[]) ?? [];
  const bundles = (data.bundles as Row[]) ?? [];

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Katalog produktów"
        description="Kategorie, rodziny i modele. Konfigurator startuje zawsze od sześciu kategorii systemowych; nazwy, opisy, kolejność i widoczność są edytowalne."
      />

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Kategorie</h2>
        <DataTable
          headers={['Klucz', 'Nazwa', 'Typ systemowy', 'Kolejność', 'Widoczna', '']}
          rows={categories.map((category) => [
            <code key="k" className="text-xs">{category.key}</code>,
            <EditableName key="n" value={category.name} onSave={(name) => adminApi.updateEntity('categories', category.key, { name }).then(refresh)} />,
            String(category.systemKey),
            String(category.order ?? 0),
            <input
              key="v"
              type="checkbox"
              checked={category.visible !== false}
              onChange={(e) => adminApi.updateEntity('categories', category.key, { visible: e.target.checked }).then(refresh)}
            />,
            '',
          ])}
        />
        <div className="mt-3">
          <InlineForm
            onSubmit={async () => {
              await adminApi.createEntity('categories', newCategory);
              setNewCategory({ key: '', name: '', systemKey: 'solid' });
              refresh();
            }}
          >
            <TextInput label="Klucz" required value={newCategory.key} onChange={(e) => setNewCategory({ ...newCategory, key: e.target.value })} />
            <TextInput label="Nazwa" required value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} />
            <SelectInput
              label="Typ systemowy"
              value={newCategory.systemKey}
              onChange={(e) => setNewCategory({ ...newCategory, systemKey: e.target.value })}
              options={['hidden', 'solid', 'glass', 'sliding', 'mirrored', 'double'].map((v) => ({ value: v, label: v }))}
            />
          </InlineForm>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Rodziny</h2>
        <DataTable
          headers={['Klucz', 'Nazwa', 'Kategoria', '']}
          rows={families.map((family) => [
            <code key="k" className="text-xs">{family.key}</code>,
            <EditableName key="n" value={family.name} onSave={(name) => adminApi.updateEntity('families', family.key, { name }).then(refresh)} />,
            family.category?.name ?? '',
            <button key="d" className="text-xs text-[var(--c-error)] hover:underline" onClick={() => adminApi.deleteEntity('families', family.key).then(refresh)}>
              usuń
            </button>,
          ])}
        />
        <div className="mt-3">
          <InlineForm
            onSubmit={async () => {
              await adminApi.createEntity('families', newFamily);
              setNewFamily({ key: '', name: '', categoryKey: '' });
              refresh();
            }}
          >
            <TextInput label="Klucz" required value={newFamily.key} onChange={(e) => setNewFamily({ ...newFamily, key: e.target.value })} />
            <TextInput label="Nazwa" required value={newFamily.name} onChange={(e) => setNewFamily({ ...newFamily, name: e.target.value })} />
            <SelectInput
              label="Kategoria"
              required
              value={newFamily.categoryKey}
              onChange={(e) => setNewFamily({ ...newFamily, categoryKey: e.target.value })}
              options={[{ value: '', label: '- wybierz -' }, ...categories.map((c) => ({ value: c.key, label: c.name }))]}
            />
          </InlineForm>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Modele</h2>
        <DataTable
          headers={['Klucz', 'Nazwa', 'Rodzina', 'Wymiar bazowy', 'AssetBundle', 'Status', 'Akcje']}
          rows={models.map((model) => [
            <code key="k" className="text-xs">{model.key}</code>,
            <EditableName key="n" value={model.name} onSave={(name) => adminApi.updateEntity('models', model.key, { name }).then(refresh)} />,
            model.family?.name ?? '',
            `${model.baseWidthMm}x${model.baseHeightMm}`,
            <select
              key="b"
              className="rounded border border-[var(--c-border)] px-1.5 py-1 text-xs"
              value={(model.bundle as Row | null)?.key ?? ''}
              onChange={(e) => adminApi.updateEntity('models', model.key, { bundleKey: e.target.value || null }).then(refresh)}
            >
              <option value="">brak (MISSING_ASSET)</option>
              {bundles.map((bundle) => (
                <option key={bundle.key} value={bundle.key}>
                  {bundle.key} {bundle.status === 'published' ? '' : '(szkic)'}
                </option>
              ))}
            </select>,
            <StatusBadge key="s" status={String(model.status)} />,
            <span key="a" className="flex gap-2 text-xs">
              {model.status !== 'published' ? (
                <button className="text-[var(--c-success)] hover:underline" onClick={() => adminApi.updateEntity('models', model.key, { status: 'published' }).then(refresh)}>
                  publikuj
                </button>
              ) : (
                <button className="hover:underline" onClick={() => adminApi.updateEntity('models', model.key, { status: 'draft' }).then(refresh)}>
                  cofnij
                </button>
              )}
            </span>,
          ])}
        />
        <div className="mt-3">
          <InlineForm
            onSubmit={async () => {
              await adminApi.createEntity('models', { ...newModel, bundleKey: newModel.bundleKey || undefined });
              setNewModel({ key: '', name: '', familyKey: '', bundleKey: '' });
              refresh();
            }}
          >
            <TextInput label="Klucz" required value={newModel.key} onChange={(e) => setNewModel({ ...newModel, key: e.target.value })} />
            <TextInput label="Nazwa" required value={newModel.name} onChange={(e) => setNewModel({ ...newModel, name: e.target.value })} />
            <SelectInput
              label="Rodzina"
              required
              value={newModel.familyKey}
              onChange={(e) => setNewModel({ ...newModel, familyKey: e.target.value })}
              options={[{ value: '', label: '- wybierz -' }, ...families.map((f) => ({ value: f.key, label: f.name }))]}
            />
            <SelectInput
              label="AssetBundle"
              value={newModel.bundleKey}
              onChange={(e) => setNewModel({ ...newModel, bundleKey: e.target.value })}
              options={[{ value: '', label: 'brak' }, ...bundles.map((b) => ({ value: b.key, label: b.key }))]}
            />
          </InlineForm>
        </div>
      </Card>
    </div>
  );
}

function EditableName({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <button className="text-left hover:underline" onClick={() => { setDraft(value); setEditing(true); }} title="Kliknij, aby zmienić nazwę">
        {value}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        className="rounded border border-[var(--c-border)] px-1.5 py-0.5 text-sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onSave(draft); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <Button variant="ghost" onClick={() => { onSave(draft); setEditing(false); }}>✓</Button>
    </span>
  );
}
