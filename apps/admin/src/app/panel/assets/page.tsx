'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Spinner } from '@door/ui';
import { adminApi } from '@/lib/admin-api';
import { DataTable, InlineForm, PageHeader, StatusBadge, TextInput } from '@/components/shared';

export default function AssetsPage() {
  const queryClient = useQueryClient();
  const { data: assets, isLoading } = useQuery({ queryKey: ['assets'], queryFn: adminApi.assets });
  const [upload, setUpload] = useState<{ key: string; name: string; licenseInfo: string; file: File | null }>({
    key: '',
    name: '',
    licenseInfo: '',
    file: null,
  });

  if (isLoading || !assets) return <Spinner label="Wczytywanie assetów…" />;

  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader
        title="Asset manager"
        description="Upload GLB, raport techniczny, wizualne mapowanie ról i publikacja. Publikacja jest zablokowana bez kompletnego manifestu (mapowanie, wymiary, pivot, skala)."
      />

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Wgraj nowy GLB</h2>
        <InlineForm
          submitLabel="Wgraj i przeskanuj"
          onSubmit={async () => {
            if (!upload.file) throw new Error('Wybierz plik GLB.');
            const result = await adminApi.uploadAsset(upload.file, {
              key: upload.key,
              name: upload.name,
              licenseInfo: upload.licenseInfo || undefined,
            });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            window.location.href = `/panel/assets/${result.assetKey}/${result.version}`;
          }}
        >
          <TextInput label="Klucz assetu (np. moje-drzwi.leaf)" required value={upload.key} onChange={(e) => setUpload({ ...upload, key: e.target.value })} />
          <TextInput label="Nazwa" required value={upload.name} onChange={(e) => setUpload({ ...upload, name: e.target.value })} />
          <TextInput label="Licencja/źródło (zalecane)" value={upload.licenseInfo} onChange={(e) => setUpload({ ...upload, licenseInfo: e.target.value })} />
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--c-text-muted)]">Plik GLB (max 50 MB)</span>
            <input
              type="file"
              accept=".glb,model/gltf-binary"
              required
              onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] ?? null })}
              className="text-xs"
            />
          </label>
        </InlineForm>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Assety tenanta</h2>
        <DataTable
          headers={['Klucz', 'Nazwa', 'Wersje', 'Licencja']}
          rows={assets.map((asset) => [
            <code key="k" className="text-xs">{asset.key}</code>,
            asset.name,
            <div key="v" className="flex flex-wrap gap-1.5">
              {asset.versions.map((version) => (
                <Link
                  key={version.id}
                  href={`/panel/assets/${asset.key}/${version.version}`}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2 py-1 text-xs hover:border-[var(--c-primary)]"
                >
                  v{version.version}
                  <StatusBadge status={version.status} />
                  {!version.hasManifest ? <span className="text-[var(--c-warning)]">bez manifestu</span> : null}
                </Link>
              ))}
            </div>,
            <LicenseCell key="l" licenseInfo={asset.licenseInfo} />,
          ])}
        />
      </Card>
    </div>
  );
}

function LicenseCell({ licenseInfo }: { licenseInfo: unknown }) {
  const info = licenseInfo as { status?: string; source?: string; license?: string; note?: string } | null;
  if (!info) return <span className="text-xs text-[var(--c-text-muted)]">nie podano</span>;
  if (info.status === 'license_unconfirmed') {
    return <span className="text-xs font-medium text-[var(--c-error)]" title={info.note}>NIEPOTWIERDZONA - publikacja zablokowana</span>;
  }
  return <span className="text-xs text-[var(--c-text-muted)]" title={info.note}>{info.source ?? ''} {info.license?.slice(0, 40) ?? ''}</span>;
}
