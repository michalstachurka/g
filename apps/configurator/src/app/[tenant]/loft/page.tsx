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
 * Podgląd sceny ekspozycyjnej drzwi (ściana + podłoga + sufit, bez
 * zamkniętego pomieszczenia). Sterowanie kamerą IDENTYCZNE jak w
 * standardowym konfiguratorze (DoorScene): swobodna orbita, pan prawym
 * przyciskiem / dwoma palcami, te same limity dystansu i kąta.
 */

const RD = LOFT_ROOM_DEFAULTS;

/** Ustawia kamerę na wprost drzwi; ponawia tylko przy zmianie szerokości ściany. */
function CameraRig({ w }: { w: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  const applied = useRef<number | null>(null);
  useEffect(() => {
    if (!controls || applied.current === w) return;
    applied.current = w;
    camera.position.set(w / 2 + 0.2, 1.35, 4.6);
    controls.target.set(w / 2, 1.25, 0);
    controls.update();
  }, [w, controls, camera]);
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
  const variant = LOFT_VARIANTS.find((v) => v.key === variantKey) ?? LOFT_VARIANTS[0];
  const commitDims = () => setDims({ ...live });

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2.5">
        <Link href={`/${tenant}`} className="mr-2 text-xs text-[var(--c-text-muted)] hover:underline">
          ← Katalog
        </Link>
        <span className="mr-2 text-sm font-semibold">Scena loft</span>
        {LOFT_VARIANTS.map((v) => (
          <button
            key={v.key}
            onClick={() => setVariantKey(v.key)}
            className={cn(
              'rounded-[var(--radius)] border px-3 py-1.5 text-sm transition',
              v.key === variantKey
                ? 'border-[var(--c-primary)] bg-[color-mix(in_srgb,var(--c-primary)_8%,white)] font-medium'
                : 'border-[var(--c-border)] hover:border-[var(--c-primary)]',
            )}
          >
            {v.key.toUpperCase()}. {v.name}
          </button>
        ))}
      </div>
      {/* Ściana: kolor + wymiary (przebudowa geometrii po puszczeniu suwaka) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-[var(--c-text-muted)]">Kolor ścian</span>
          <input
            type="color"
            value={wallColor ?? variant.wallTint}
            onChange={(e) => setWallColor(e.target.value)}
            className="h-6 w-9 cursor-pointer rounded border border-[var(--c-border)] bg-transparent p-0"
            aria-label="Kolor ścian"
          />
        </label>
        {wallColor && (
          <button onClick={() => setWallColor(null)} className="rounded border border-[var(--c-border)] px-2 py-1 text-[var(--c-text-muted)] hover:border-[var(--c-primary)]">
            Reset koloru
          </button>
        )}
        <label className="flex items-center gap-1.5">
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
            className="w-28 accent-[var(--c-primary)]"
            aria-label="Szerokość ściany"
          />
          <span className="w-12 tabular-nums">{live.w.toFixed(1)} m</span>
        </label>
        <label className="flex items-center gap-1.5">
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
            className="w-28 accent-[var(--c-primary)]"
            aria-label="Wysokość ściany"
          />
          <span className="w-12 tabular-nums">{live.h.toFixed(2)} m</span>
        </label>
      </div>
      <div className="min-h-0 flex-1 bg-[#181715]">
        <Canvas
          shadows
          // pixel ratio ograniczony (płynność na telefonach)
          dpr={[1, 1.5]}
          camera={{ fov: 38, near: 0.05, far: 60, position: [RD.w / 2 + 0.2, 1.35, 4.6] }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
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
          <CameraRig w={dims.w} />
          {/* Sterowanie 1:1 jak w konfiguratorze produktu (DoorScene). */}
          <OrbitControls
            makeDefault
            enablePan
            panSpeed={0.8}
            minDistance={1.1}
            maxDistance={8}
            maxPolarAngle={Math.PI * 0.55}
            minPolarAngle={Math.PI * 0.2}
          />
        </Canvas>
      </div>
      <noscript>
        <Spinner label="Podgląd wymaga JavaScript" />
      </noscript>
    </div>
  );
}
