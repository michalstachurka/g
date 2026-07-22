'use client';

import { Suspense, use, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { LoftRoom, LOFT_VARIANTS, LOFT_ROOM_DEFAULTS, LOFT_STAGE_DEPTH } from '@door/three-viewer';
import { Spinner, cn } from '@door/ui';

/**
 * Podgląd otwartej sceny ekspozycyjnej drzwi. Kamera może wyjechać przed
 * otwarty front i oddalić się, by pokazać całe pomieszczenie (fitCameraToRoom).
 * Limity OrbitControls liczone dynamicznie z wymiarów; zmiana wariantu/koloru/
 * wymiarów NIE resetuje kamery. Drzwi mają stały punkt w świecie.
 */

const RD = LOFT_ROOM_DEFAULTS;
const DOOR_CX = RD.w / 2; // stały środek drzwi (jak w LoftRoom)

/**
 * Kontroler kamery: near/far + jednorazowe dopasowanie kadru (start / "Widok
 * ogólny"). BEZ ograniczeń ruchu - pełna dowolność obracania, przesuwania i
 * przybliżania (można obejść pomieszczenie dookoła i zajrzeć za drzwi).
 */
function CameraController({ w, h, doorX, fitSignal }: { w: number; h: number; doorX: number; fitSignal: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  const size = useThree((s) => s.size);
  const depth = LOFT_STAGE_DEPTH;

  useEffect(() => {
    camera.near = 0.05;
    camera.far = 100;
    camera.updateProjectionMatrix();
  }, [camera]);

  // Start: kadr na drzwi (raz, gdy controls gotowe - rejestrują się
  // asynchronicznie). Przycisk "Widok ogólny" (fitSignal > 0): pełny pokój.
  // NIE wołane przy zmianie wariantu/koloru/wymiarów.
  const didStart = useRef(false);
  useEffect(() => {
    if (!controls) return;
    if (fitSignal === 0) {
      if (didStart.current) return;
      didStart.current = true;
    }
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = size.width / Math.max(size.height, 1);
    const distanceForHeight = h / (2 * Math.tan(vFov / 2));
    const horizontalFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distanceForWidth = w / (2 * Math.tan(horizontalFov / 2));
    const base = fitSignal === 0 ? distanceForHeight : Math.max(distanceForHeight, distanceForWidth);
    const margin = fitSignal === 0 ? 1.05 : 1.2;
    const distance = Math.max(base * margin, depth + 0.2);
    const xOff = Math.min(distance * 0.18, 1.0);
    const ty = h * 0.46;
    camera.position.set(doorX + xOff, Math.min(ty + distance * 0.03, h - 0.15), distance);
    controls.target.set(doorX, ty, 0);
    controls.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal, controls]);

  return null;
}

export default function LoftPreviewPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params);
  const search = useSearchParams();
  const initial = search.get('w') ?? 'a';
  const [variantKey, setVariantKey] = useState(
    LOFT_VARIANTS.some((v) => v.key === initial) ? initial : 'a',
  );
  // wymiary: wartość "live" (suwak w trakcie przeciągania) + zatwierdzona
  const [dims, setDims] = useState({ w: RD.w, h: RD.h });
  const [live, setLive] = useState(dims);
  const [wallColor, setWallColor] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false); // panel ustawień (mobile)
  const [fitSignal, setFitSignal] = useState(0); // "Widok ogólny" / start
  const [lampOn, setLampOn] = useState(true); // reflektor zapalony
  const [lampSteer, setLampSteer] = useState(false); // tryb sterowania kierunkiem (strzałka)
  const [lampAim, setLampAim] = useState<[number, number, number] | undefined>(undefined);
  const variant = LOFT_VARIANTS.find((v) => v.key === variantKey) ?? LOFT_VARIANTS[0];
  const commitDims = () => setDims({ ...live });

  // szeroki zakres zoomu - pełna dowolność (blisko detalu i daleko z góry)
  const maxDistance = useMemo(() => {
    const roomMax = Math.max(dims.w, dims.h, LOFT_STAGE_DEPTH);
    return Math.max(30, roomMax * 6);
  }, [dims]);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* Pasek: nawigacja + warianty (na mobile przewijane poziomo) */}
      <div className="flex items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 sm:px-4">
        <Link href={`/${tenant}`} className="shrink-0 text-xs text-[var(--c-text-muted)] hover:underline">
          ← Katalog
        </Link>
        <div className="flex flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible">
          {LOFT_VARIANTS.map((v) => (
            <button
              key={v.key}
              onClick={() => setVariantKey(v.key)}
              className={cn(
                'shrink-0 rounded-[var(--radius)] border px-3 py-1.5 text-sm transition',
                v.key === variantKey
                  ? 'border-[var(--c-primary)] bg-[color-mix(in_srgb,var(--c-primary)_8%,white)] font-medium'
                  : 'border-[var(--c-border)] hover:border-[var(--c-primary)]',
              )}
            >
              {v.key.toUpperCase()}. {v.name}
            </button>
          ))}
          <button
            onClick={() => setFitSignal((n) => n + 1)}
            className="shrink-0 rounded-[var(--radius)] border border-[var(--c-border)] px-3 py-1.5 text-sm text-[var(--c-text-muted)] transition hover:border-[var(--c-primary)]"
          >
            Widok ogólny
          </button>
          <span className="mx-0.5 hidden h-5 w-px bg-[var(--c-border)] sm:block" />
          <button
            onClick={() => { setLampOn((o) => !o); if (lampOn) setLampSteer(false); }}
            className={cn(
              'shrink-0 rounded-[var(--radius)] border px-3 py-1.5 text-sm transition',
              lampOn ? 'border-[var(--c-primary)] font-medium' : 'border-[var(--c-border)] text-[var(--c-text-muted)] hover:border-[var(--c-primary)]',
            )}
          >
            {lampOn ? '💡 Lampa wł.' : 'Lampa wył.'}
          </button>
          <button
            onClick={() => setLampSteer((s) => !s)}
            disabled={!lampOn}
            className={cn(
              'shrink-0 rounded-[var(--radius)] border px-3 py-1.5 text-sm transition',
              !lampOn
                ? 'cursor-not-allowed border-[var(--c-border)] text-[var(--c-text-muted)] opacity-40'
                : lampSteer
                  ? 'border-[var(--c-primary)] bg-[color-mix(in_srgb,var(--c-primary)_8%,white)] font-medium'
                  : 'border-[var(--c-border)] text-[var(--c-text-muted)] hover:border-[var(--c-primary)]',
            )}
          >
            {lampSteer ? '✔ Kieruj lampą' : 'Kieruj lampą'}
          </button>
        </div>
        {/* Toggle ustawień pomieszczenia - tylko mobile */}
        <button
          onClick={() => setSettingsOpen((s) => !s)}
          className="shrink-0 rounded-[var(--radius)] border border-[var(--c-border)] px-2.5 py-1.5 text-xs md:hidden"
          aria-expanded={settingsOpen}
        >
          Ustawienia
        </button>
      </div>

      {/* Ustawienia pomieszczenia: mobile - zwijane; desktop - zawsze widoczne */}
      <div
        className={cn(
          'flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-xs sm:px-4 md:flex',
          settingsOpen ? 'flex' : 'hidden',
        )}
      >
        <label className="flex items-center gap-1.5">
          <span className="text-[var(--c-text-muted)]">Kolor ścian</span>
          <input
            type="color"
            value={wallColor ?? variant.wallTint}
            onChange={(e) => setWallColor(e.target.value)}
            className="h-7 w-10 cursor-pointer rounded border border-[var(--c-border)] bg-transparent p-0"
            aria-label="Kolor ścian"
          />
        </label>
        {wallColor && (
          <button onClick={() => setWallColor(null)} className="rounded border border-[var(--c-border)] px-2 py-1 text-[var(--c-text-muted)] hover:border-[var(--c-primary)]">
            Reset koloru
          </button>
        )}
        <label className="flex items-center gap-2">
          <span className="text-[var(--c-text-muted)]">Szerokość</span>
          <input
            type="range"
            min={RD.minW}
            max={RD.maxW}
            step={0.1}
            value={live.w}
            onChange={(e) => setLive((s) => ({ ...s, w: Number(e.target.value) }))}
            onPointerUp={commitDims}
            onKeyUp={commitDims}
            onTouchEnd={commitDims}
            className="w-32 accent-[var(--c-primary)]"
            aria-label="Szerokość pomieszczenia"
          />
          <span className="w-12 tabular-nums">{live.w.toFixed(1)} m</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[var(--c-text-muted)]">Wysokość</span>
          <input
            type="range"
            min={RD.minH}
            max={RD.maxH}
            step={0.05}
            value={live.h}
            onChange={(e) => setLive((s) => ({ ...s, h: Number(e.target.value) }))}
            onPointerUp={commitDims}
            onKeyUp={commitDims}
            onTouchEnd={commitDims}
            className="w-32 accent-[var(--c-primary)]"
            aria-label="Wysokość pomieszczenia"
          />
          <span className="w-12 tabular-nums">{live.h.toFixed(2)} m</span>
        </label>
      </div>

      {/* Render: min. 65svh na mobile, canvas nie nachodzi na panel */}
      <div
        className="min-h-[65svh] flex-1 bg-[#151515] md:min-h-0"
        onPointerDown={() => settingsOpen && setSettingsOpen(false)}
      >
        <Canvas
          shadows
          // pixel ratio ograniczony do 1.5 (płynność na telefonach)
          dpr={[1, 1.5]}
          camera={{ fov: 38, near: 0.05, far: 100, position: [DOOR_CX + 1.6, 1.6, 7] }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
          onCreated={({ gl }) => {
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <Suspense fallback={null}>
            <LoftRoom
              variant={variant}
              room={{ w: dims.w, h: dims.h }}
              wallColor={wallColor ?? undefined}
              lampOn={lampOn}
              lampSteer={lampSteer}
              lampAim={lampAim}
              onLampAimChange={setLampAim}
            />
          </Suspense>
          <CameraController w={dims.w} h={dims.h} doorX={DOOR_CX} fitSignal={fitSignal} />
          {/* PEŁNA dowolność: obrót 360 (też zza drzwi), pan, zoom. Bez limitów
              kątów i pozycji - jedynie zakres dystansu i tłumienie. */}
          <OrbitControls
            makeDefault
            enablePan
            enableZoom
            enableRotate
            enableDamping
            dampingFactor={0.07}
            zoomSpeed={0.8}
            panSpeed={0.8}
            rotateSpeed={0.6}
            zoomToCursor
            minDistance={0.4}
            maxDistance={maxDistance}
          />
        </Canvas>
      </div>
      <noscript>
        <Spinner label="Podgląd wymaga JavaScript" />
      </noscript>
    </div>
  );
}
