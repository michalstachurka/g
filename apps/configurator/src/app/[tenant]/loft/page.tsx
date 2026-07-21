'use client';

import { Suspense, use, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { LoftRoom, LOFT_VARIANTS, LOFT_ROOM_DEFAULTS } from '@door/three-viewer';
import { Spinner, cn } from '@door/ui';

/**
 * Podgląd sceny loftowej (tło wizualizacji drzwi). Warianty, presety kamery
 * oraz kolor/szerokość/wysokość ścian przełączane w pasku; swoboda orbity
 * zachowana (CameraBounds w scenie trzyma kamerę we wnętrzu).
 */

const RD = LOFT_ROOM_DEFAULTS;

interface CameraPresetDef {
  key: string;
  label: string;
  pos: [number, number, number];
  target: [number, number, number];
}

// Presety liczone z wymiarów pokoju: kadry po przekątnej (z narożnika
// tylnego-prawego) pokazują ścianę drzwiową i ceglaną ścianę z oknem.
function buildPresets(w: number, h: number, d: number): CameraPresetDef[] {
  const camY = Math.min(1.65, h - 0.6);
  const dxc = THREE.MathUtils.clamp(w * 0.37, 1.1, w - 0.9 - 1.1) + 0.45; // środek drzwi
  return [
    { key: 'salon', label: 'Widok ogólny', pos: [w - 0.55, camY, d - 0.45], target: [w * 0.21, 1.1, d * 0.26] },
    { key: 'drzwi', label: 'Drzwi + okno', pos: [w - 0.8, camY - 0.1, d - 0.8], target: [w * 0.28, 1.05, 0.7] },
    { key: 'produkt', label: 'Zbliżenie drzwi', pos: [dxc + 0.3, 1.25, 3.2], target: [dxc, 1.08, 0] },
  ];
}

function CameraPreset({ preset }: { preset: CameraPresetDef | undefined }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    if (!preset || !controls) return;
    camera.position.set(...preset.pos);
    controls.target.set(...preset.target);
    controls.update();
  }, [preset, controls, camera]);
  return null;
}

export default function LoftPreviewPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params);
  const search = useSearchParams();
  const initial = search.get('w') ?? 'a';
  const [variantKey, setVariantKey] = useState(
    LOFT_VARIANTS.some((v) => v.key === initial) ? initial : 'a',
  );
  const [preset, setPreset] = useState(1); // domyślnie "Drzwi + okno"
  // wymiary: wartość "live" (suwak w trakcie przeciągania) + zatwierdzona
  // (przebudowa geometrii dopiero po puszczeniu suwaka - bez dławienia GPU)
  const [dims, setDims] = useState({ w: RD.w, h: RD.h });
  const [live, setLive] = useState(dims);
  const [wallColor, setWallColor] = useState<string | null>(null);
  const variant = LOFT_VARIANTS.find((v) => v.key === variantKey) ?? LOFT_VARIANTS[0];

  const presets = useMemo(() => buildPresets(dims.w, dims.h, RD.d), [dims]);
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
        <span className="mx-1 hidden h-5 w-px bg-[var(--c-border)] sm:block" />
        {presets.map((p, i) => (
          <button
            key={p.key}
            onClick={() => setPreset(i)}
            className={cn(
              'rounded-[var(--radius)] border px-2.5 py-1.5 text-xs transition',
              preset === i
                ? 'border-[var(--c-primary)] font-medium'
                : 'border-[var(--c-border)] text-[var(--c-text-muted)] hover:border-[var(--c-primary)]',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {/* Ściany: kolor + wymiary (przebudowa geometrii po puszczeniu suwaka) */}
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
            aria-label="Szerokość pomieszczenia"
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
            aria-label="Wysokość ścian"
          />
          <span className="w-12 tabular-nums">{live.h.toFixed(2)} m</span>
        </label>
      </div>
      <div className="min-h-0 flex-1 bg-[#181715]">
        <Canvas
          shadows
          // pixel ratio ograniczony (płynność na telefonach)
          dpr={[1, 1.5]}
          camera={{ fov: 38, near: 0.05, far: 60, position: buildPresets(RD.w, RD.h, RD.d)[1].pos }}
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
          <CameraPreset preset={presets[preset]} />
          {/* Swobodna orbita; CameraBounds w scenie skraca dystans przy
              ścianach, maxPolarAngle < 90° blokuje wejście pod podłogę. */}
          <OrbitControls
            makeDefault
            enablePan
            minDistance={1.2}
            maxDistance={7}
            maxPolarAngle={Math.PI * 0.49}
            minPolarAngle={Math.PI * 0.14}
          />
        </Canvas>
      </div>
      <noscript>
        <Spinner label="Podgląd wymaga JavaScript" />
      </noscript>
    </div>
  );
}
