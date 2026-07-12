'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import type { PublicAssetManifest, RenderSpec } from '@door/contracts';
import { DoorScene } from '@door/three-viewer';
import { Spinner } from '@door/ui';
import { publicApi } from '@/lib/api';

/**
 * Wrapper viewera: pobiera publiczne manifesty assetów z renderSpec i katalog
 * materiałów, po czym renderuje scenę dokładnie według renderSpec.
 */
export function DoorViewer({
  tenant,
  renderSpec,
  open,
  viewSide,
  interactive = true,
  diagnostics = false,
  onReady,
}: {
  tenant: string;
  renderSpec: RenderSpec;
  open: boolean;
  viewSide: 'a' | 'b';
  interactive?: boolean;
  diagnostics?: boolean;
  onReady?: () => void;
}) {
  const assetIds = [...new Set(renderSpec.modules.map((m) => m.publicAssetId))].sort();

  const { data: materialDefs } = useQuery({
    queryKey: ['materials', tenant],
    queryFn: () => publicApi.materials(tenant),
    staleTime: 5 * 60_000,
  });

  const manifestQueries = useQueries({
    queries: assetIds.map((id) => ({
      queryKey: ['manifest', tenant, id],
      queryFn: () => publicApi.manifest(tenant, id),
      staleTime: Infinity,
    })),
  });

  const loading = !materialDefs || manifestQueries.some((q) => q.isLoading);
  const failed = manifestQueries.find((q) => q.error);
  if (failed) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-[var(--c-error)]">
        Nie udało się pobrać danych modelu 3D. Odśwież stronę.
      </div>
    );
  }
  if (loading) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner label="Przygotowanie widoku 3D…" />
      </div>
    );
  }

  const manifests: Record<string, PublicAssetManifest> = {};
  for (const query of manifestQueries) {
    if (query.data) manifests[query.data.publicAssetId] = query.data.manifest;
  }

  return (
    <DoorScene
      renderSpec={renderSpec}
      manifests={manifests}
      materialDefs={materialDefs}
      assetFileUrl={(id) => publicApi.assetFileUrl(tenant, id)}
      open={open}
      viewSide={viewSide}
      interactive={interactive}
      diagnostics={diagnostics}
      onReady={onReady}
    />
  );
}
