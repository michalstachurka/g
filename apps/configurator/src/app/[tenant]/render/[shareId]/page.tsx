'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { publicApi } from '@/lib/api';
import { DoorViewer } from '@/components/DoorViewer';

/**
 * Kontrolowany widok do renderu serwerowego (worker + Playwright robi zrzut
 * do PDF i miniatur). Bez interakcji i overlay wymiarów; sygnał gotowości
 * przez window.__RENDER_READY ustawiany przez DoorScene.
 */
export default function RenderPage({ params }: { params: Promise<{ tenant: string; shareId: string }> }) {
  const { tenant, shareId } = use(params);
  const { data } = useQuery({
    queryKey: ['configuration', tenant, shareId],
    queryFn: () => publicApi.getConfiguration(tenant, shareId),
  });
  const renderSpec = data?.evaluate?.renderSpec ?? null;
  if (!renderSpec) return <div style={{ width: '100vw', height: '100vh', background: '#f2f0eb' }} />;
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <DoorViewer tenant={tenant} renderSpec={{ ...renderSpec, scene: { ...renderSpec.scene, showMeasurementOverlay: false } }} open={false} viewSide="a" interactive={false} />
    </div>
  );
}
