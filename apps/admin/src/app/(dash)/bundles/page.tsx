'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MODULE_SLOTS } from '@door/contracts';
import { Button, Card, Spinner } from '@door/ui';
import { adminApi, type AdminAsset } from '@/lib/admin-api';
import { InlineForm, PageHeader, SelectInput, StatusBadge, TextInput } from '@/components/shared';

interface BundleRow {
  id: string;
  key: string;
  name: string;
  status: string;
  version: number;
  items: { id: string; slot: string; required: boolean; assetVersion: { version: number; status: string; asset: { key: string } } }[];
}

/** Budowanie AssetBundle: wymagane i opcjonalne moduły modelu drzwi. */
export default function BundlesPage() {
  const queryClient = useQueryClient();
  const { data: bundles, isLoading } = useQuery({ queryKey: ['bundles'], queryFn: adminApi.bundles });
  const { data: assets } = useQuery({ queryKey: ['assets'], queryFn: adminApi.assets });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['bundles'] });

  const [draft, setDraft] = useState<{ key: string; name: string; items: { slot: string; assetKey: string; required: boolean }[] }>({
    key: '',
    name: '',
    items: [{ slot: 'door_leaf', assetKey: '', required: true }],
  });
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !bundles) return <Spinner label="Wczytywanie zestawów…" />;
  const assetOptions = (assets ?? []).map((a: AdminAsset) => ({ value: a.key, label: a.key }));

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title="Zestawy modułów (AssetBundle)"
        description="Zestaw określa, z których modułów GLB składa się model drzwi (skrzydło, ościeżnica, naświetla…). Publikacja wymaga opublikowanych wszystkich wymaganych modułów."
      />

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Nowy zestaw</h2>
        <div className="mb-2 flex gap-2">
          <TextInput label="Klucz" value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} />
          <TextInput label="Nazwa" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        {draft.items.map((item, index) => (
          <div key={index} className="mb-1.5 flex items-end gap-2">
            <SelectInput label="Slot" value={item.slot} onChange={(e) => setDraft({ ...draft, items: draft.items.map((it, i) => (i === index ? { ...it, slot: e.target.value } : it)) })} options={MODULE_SLOTS.map((s) => ({ value: s, label: s }))} />
            <SelectInput label="Asset" value={item.assetKey} onChange={(e) => setDraft({ ...draft, items: draft.items.map((it, i) => (i === index ? { ...it, assetKey: e.target.value } : it)) })} options={[{ value: '', label: '- wybierz -' }, ...assetOptions]} />
            <label className="mb-2 flex items-center gap-1 text-xs">
              <input type="checkbox" checked={item.required} onChange={(e) => setDraft({ ...draft, items: draft.items.map((it, i) => (i === index ? { ...it, required: e.target.checked } : it)) })} />
              wymagany
            </label>
            <button className="mb-2 text-[var(--c-error)]" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}>✕</button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setDraft({ ...draft, items: [...draft.items, { slot: 'frame', assetKey: '', required: true }] })}>
            + moduł
          </Button>
          <Button
            onClick={async () => {
              setError(null);
              try {
                await adminApi.createBundle({
                  key: draft.key,
                  name: draft.name || draft.key,
                  items: draft.items.filter((i) => i.assetKey).map((i, order) => ({ ...i, order })),
                });
                setDraft({ key: '', name: '', items: [{ slot: 'door_leaf', assetKey: '', required: true }] });
                refresh();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            Utwórz zestaw
          </Button>
        </div>
        {error ? <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p> : null}
      </Card>

      {(bundles as BundleRow[]).map((bundle) => (
        <Card key={bundle.id} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold">{bundle.name}</span>{' '}
              <code className="text-xs text-[var(--c-text-muted)]">{bundle.key} v{bundle.version}</code>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={bundle.status} />
              {bundle.status !== 'published' ? (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    setError(null);
                    try {
                      await adminApi.publishBundle(bundle.key);
                      refresh();
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  Opublikuj
                </Button>
              ) : null}
            </div>
          </div>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs">
            {bundle.items.map((item) => (
              <li key={item.id} className="rounded-md border border-[var(--c-border)] px-2 py-1">
                <b>{item.slot}</b> → {item.assetVersion.asset.key} v{item.assetVersion.version}{' '}
                <StatusBadge status={item.assetVersion.status} />
                {!item.required ? ' (opcjonalny)' : ''}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
