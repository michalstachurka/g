'use client';

import { Suspense, use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { LoftRoom, LOFT_VARIANTS } from '@door/three-viewer';
import { Spinner, cn } from '@door/ui';

/**
 * Podgląd sceny loftowej (tło wizualizacji drzwi). Warianty i presety kamery
 * przełączane przyciskami; swoboda orbity zachowana.
 */

// Presety kamery: [pozycja, target]. Kadry po przekątnej pokoju (z narożnika
// tylnego-prawego), wys. ~1.5 m: w jednym ujęciu ściana drzwiowa i ceglana
// ściana z oknem. Wszystkie pozycje mieszczą się w klamrze CameraBounds.
const CAMERA_PRESETS: { key: string; label: string; pos: [number, number, number]; target: [number, number, number] }[] = [
  { key: 'salon', label: 'Widok ogólny', pos: [4.85, 1.65, 4.75], target: [1.15, 1.1, 1.35] },
  { key: 'drzwi', label: 'Drzwi + okno', pos: [4.6, 1.55, 4.4], target: [1.5, 1.05, 0.7] },
  { key: 'produkt', label: 'Zbliżenie drzwi', pos: [2.75, 1.25, 3.2], target: [2.45, 1.08, 0] },
];

function CameraPreset({ index }: { index: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    const p = CAMERA_PRESETS[index];
    if (!p || !controls) return;
    camera.position.set(...p.pos);
    controls.target.set(...p.target);
    controls.update();
  }, [index, controls, camera]);
  return null;
}

export default function LoftPreviewPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params);
  const search = useSearchParams();
  const initial = search.get('w') ?? 'a';
  const [variantKey, setVariantKey] = useState(
    LOFT_VARIANTS.some((v) => v.key === initial) ? initial : 'a',
  );
  const [preset, setPreset] = useState(1); // domyślnie "Drzwi + salon"
  const variant = LOFT_VARIANTS.find((v) => v.key === variantKey) ?? LOFT_VARIANTS[0];

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
        {CAMERA_PRESETS.map((p, i) => (
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
      <div className="min-h-0 flex-1 bg-[#181715]">
        <Canvas
          shadows
          // pixel ratio ograniczony (płynność na telefonach)
          dpr={[1, 1.5]}
          camera={{ fov: 38, near: 0.05, far: 60, position: CAMERA_PRESETS[1].pos }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
          onCreated={({ gl }) => {
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <Suspense fallback={null}>
            <LoftRoom variant={variant} />
          </Suspense>
          <CameraPreset index={preset} />
          {/* Swobodna orbita; target w centrum, ograniczony dystans,
              maxPolarAngle < 90° blokuje wejście kamery pod podłogę. */}
          <OrbitControls
            makeDefault
            enablePan
            minDistance={1.2}
            maxDistance={5}
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
