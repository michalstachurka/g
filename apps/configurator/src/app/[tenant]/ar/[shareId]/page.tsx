'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Spinner } from '@door/ui';
import { API_URL, publicApi } from '@/lib/api';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> &
        Record<string, unknown>;
    }
  }
}

/**
 * Strona AR: model-viewer z WebXR / Scene Viewer (Android) i Quick Look (iOS).
 * Ustawienie ścienne, zablokowana skala 1:1. Model wynikowy budowany przez
 * workera z dokładnie tego samego renderSpec co viewer.
 */
export default function ArPage({ params }: { params: Promise<{ tenant: string; shareId: string }> }) {
  const { tenant, shareId } = use(params);
  const [confirmed, setConfirmed] = useState(false);
  const [requested, setRequested] = useState(false);
  const startedAt = useRef(Date.now());

  // Rejestracja custom elementu <model-viewer> z pakietu npm (bez CDN).
  useEffect(() => {
    import('@google/model-viewer').catch(() => undefined);
  }, []);

  const { data: configuration } = useQuery({
    queryKey: ['configuration', tenant, shareId],
    queryFn: () => publicApi.getConfiguration(tenant, shareId),
  });

  const { data: arStatus, refetch } = useQuery({
    queryKey: ['ar-status', tenant, shareId],
    queryFn: () => publicApi.arStatus(tenant, shareId),
    refetchInterval: (query) => {
      const data = query.state.data;
      const pending =
        !data || data.glb?.status === 'queued' || data.glb?.status === 'processing' ||
        data.usdz?.status === 'queued' || data.usdz?.status === 'processing';
      return pending && Date.now() - startedAt.current < 180_000 ? 2500 : false;
    },
  });

  useEffect(() => {
    if (!requested) {
      setRequested(true);
      publicApi.requestAr(tenant, shareId).then(() => refetch()).catch(() => undefined);
    }
  }, [requested, tenant, shareId, refetch]);

  const renderSpec = configuration?.evaluate?.renderSpec ?? null;
  const glbReady = arStatus?.glb?.status === 'done' && arStatus.glb.url;
  const usdzReady = arStatus?.usdz?.status === 'done' && arStatus.usdz.url;
  const failed = arStatus?.glb?.status === 'failed';
  const generating = !glbReady && !failed;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Drzwi na Twojej ścianie</h1>
        <Link href={`/${tenant}/c/${shareId}`} className="text-sm text-[var(--c-text-muted)] hover:underline">
          ← wróć do konfiguracji
        </Link>
      </div>

      {!confirmed ? (
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Zanim uruchomisz AR - potwierdź wymiary</h2>
          {renderSpec ? (
            <p className="text-sm">
              Model zostanie ustawiony w skali rzeczywistej:{' '}
              <strong>
                {renderSpec.widthMm} x {renderSpec.heightMm} mm
              </strong>{' '}
              (szerokość x wysokość). Skala jest zablokowana.
            </p>
          ) : (
            <Spinner label="Wczytywanie wymiarów…" />
          )}
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-[var(--c-text-muted)]">
            <li>Stań 2-3 metry od ściany, na której mają wisieć drzwi.</li>
            <li>Po uruchomieniu AR powoli przesuwaj telefon, aż wykryje płaszczyznę ściany.</li>
            <li>Dotknij ściany, aby przykleić drzwi. Obrys pokaże miejsce montażu.</li>
            <li>AR pokazuje skalę i wygląd. Nie zastępuje pomiaru montażowego.</li>
          </ol>
          <Button onClick={() => setConfirmed(true)} disabled={!renderSpec}>
            Wymiary się zgadzają, uruchom AR
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {generating ? (
            <div className="grid h-[60vh] place-items-center p-6 text-center">
              <div className="space-y-3">
                <Spinner label="Przygotowanie modelu AR…" />
                <p className="max-w-xs text-xs text-[var(--c-text-muted)]">
                  Serwer składa uproszczony model dokładnie z Twojej konfiguracji (GLB i USDZ).
                </p>
              </div>
            </div>
          ) : null}
          {failed ? (
            <div className="grid h-[40vh] place-items-center p-6 text-center">
              <div>
                <Badge tone="error">Nie udało się przygotować modelu AR</Badge>
                <p className="mt-2 text-sm text-[var(--c-text-muted)]">{arStatus?.glb?.error ?? 'Spróbuj ponownie później.'}</p>
                <Button className="mt-3" variant="secondary" onClick={() => { setRequested(false); startedAt.current = Date.now(); }}>
                  Spróbuj ponownie
                </Button>
              </div>
            </div>
          ) : null}
          {glbReady ? (
            <>
              <model-viewer
                src={`${API_URL}${arStatus!.glb!.url}`}
                {...(usdzReady ? { 'ios-src': `${API_URL}${arStatus!.usdz!.url}` } : {})}
                ar
                ar-modes="webxr scene-viewer quick-look"
                ar-placement="wall"
                ar-scale="fixed"
                camera-controls
                shadow-intensity="0.6"
                exposure="0.9"
                style={{ width: '100%', height: '62vh', background: '#efede8' }}
                alt="Skonfigurowane drzwi w skali rzeczywistej"
              >
                <button
                  slot="ar-button"
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-[var(--c-primary)] px-6 py-3 text-sm font-medium text-white shadow-lg"
                >
                  Ustaw na ścianie (AR)
                </button>
                <div slot="progress-bar" />
              </model-viewer>
              <div className="space-y-2 border-t border-[var(--c-border)] p-4 text-sm">
                <p className="text-[var(--c-text-muted)]">
                  Android: WebXR lub Scene Viewer. iPhone/iPad: AR Quick Look
                  {usdzReady ? ' (USDZ gotowy)' : ' (USDZ w przygotowaniu - konwersja nastąpi na urządzeniu)'}.
                  Urządzenie bez AR pokaże widok 3D powyżej.
                </p>
                <div className="flex items-center gap-3">
                  <a href={`${API_URL}${arStatus!.glb!.url}`} download className="text-xs underline">
                    Pobierz uproszczony model (GLB)
                  </a>
                  {usdzReady ? (
                    <a href={`${API_URL}${arStatus!.usdz!.url}`} download className="text-xs underline">
                      Pobierz USDZ
                    </a>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </Card>
      )}

      <div className="mt-6 hidden md:block">
        <Card className="flex items-center gap-4 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={publicApi.qrUrl(tenant, `/${tenant}/ar/${shareId}`)}
            alt="Kod QR do AR"
            className="h-28 w-28 rounded-md border border-[var(--c-border)] bg-white p-1.5"
          />
          <div className="text-sm text-[var(--c-text-muted)]">
            <p className="font-medium text-[var(--c-text)]">Jesteś na komputerze?</p>
            <p>Zeskanuj kod telefonem, aby ustawić drzwi na prawdziwej ścianie w rozszerzonej rzeczywistości.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
