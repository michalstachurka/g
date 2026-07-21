'use client';

import { Suspense, use, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { LoftRoom, LOFT_VARIANTS, LOFT_ROOM_DEFAULTS } from '@door/three-viewer';
import { Spinner, cn } from '@door/ui';

/**
 * Podgląd otwartej sceny ekspozycyjnej drzwi. Swobodna orbita/zoom/pan
 * (OrbitControls); granice kamery pilnuje CameraClamp w scenie. Drzwi mają
 * stały punkt w świecie - zmiana wariantu/koloru/szerokości/wysokości nie
 * resetuje kamery ani nie przesuwa drzwi.
 */

const RD = LOFT_ROOM_DEFAULTS;
const DOOR_CX = RD.w / 2; // stały środek drzwi (jak w LoftRoom)
const CAM_START: [number, number, number] = [DOOR_CX + 0.2, 1.4, 4.7];
const CAM_TARGET: [number, number, number] = [DOOR_CX, 1.2, 0];

/** Ustawia kamerę raz na starcie (bez resetu przy zmianie wariantu/wymiarów). */
function CameraRig() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  const done = useRef(false);
  useEffect(() => {
    if (!controls || done.current) return;
    done.current = true;
    camera.position.set(...CAM_START);
    controls.target.set(...CAM_TARGET);
    controls.update();
  }, [controls, camera]);
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
  // (przebudowa geometrii dopiero po puszczeniu suwaka - bez dławienia GPU)
  const [dims, setDims] = useState({ w: RD.w, h: RD.h });
  const [live, setLive] = useState(dims);
  const [wallColor, setWallColor] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false); // panel ustawień (mobile)
  const variant = LOFT_VARIANTS.find((v) => v.key === variantKey) ?? LOFT_VARIANTS[0];
  const commitDims = () => setDims({ ...live });

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* Pasek: nawigacja + warianty (na mobile przewijane poziomo) */}
      <div className="flex items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 sm:px-4">
        <Link href={`/${tenant}`} className="shrink-0 text-xs text-[var(--c-text-muted)] hover:underline">
          ← Katalog
        </Link>
        <div className="flex flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          camera={{ fov: 38, near: 0.05, far: 60, position: CAM_START }}
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
            />
          </Suspense>
          <CameraRig />
          {/* Swobodna orbita/zoom/pan; twarde granice pilnuje CameraClamp w scenie. */}
          <OrbitControls
            makeDefault
            enablePan
            panSpeed={0.8}
            minDistance={1.2}
            maxDistance={8}
            maxPolarAngle={Math.PI * 0.52}
            minPolarAngle={Math.PI * 0.18}
          />
        </Canvas>
      </div>
      <noscript>
        <Spinner label="Podgląd wymaga JavaScript" />
      </noscript>
    </div>
  );
}
