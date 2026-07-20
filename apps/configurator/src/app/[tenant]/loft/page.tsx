'use client';

import { Suspense, use, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { LoftRoom, LOFT_VARIANTS } from '@door/three-viewer';
import { Spinner, cn } from '@door/ui';

/**
 * Podgląd porównawczy sceny loftowej (tła wizualizacji drzwi).
 * Warianty przełącza się przyciskami - wybór należy do klienta;
 * po decyzji wybrany wariant wepniemy jako tło viewera drzwi.
 */
export default function LoftPreviewPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params);
  const search = useSearchParams();
  const initial = search.get('w') ?? 'a';
  const [variantKey, setVariantKey] = useState(
    LOFT_VARIANTS.some((v) => v.key === initial) ? initial : 'a',
  );
  const variant = LOFT_VARIANTS.find((v) => v.key === variantKey) ?? LOFT_VARIANTS[0];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2.5">
        <Link href={`/${tenant}`} className="mr-2 text-xs text-[var(--c-text-muted)] hover:underline">
          ← Katalog
        </Link>
        <span className="mr-2 text-sm font-semibold">Scena loft - warianty tła</span>
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
        <span className="w-full text-xs text-[var(--c-text-muted)] sm:w-auto">{variant.description}</span>
      </div>
      <div className="min-h-0 flex-1 bg-[#181715]">
        <Canvas
          shadows
          // pixel ratio ograniczony do 1.75 (płynność na telefonach)
          dpr={[1, 1.75]}
          camera={{ fov: 46, near: 0.05, far: 60, position: [4.6, 1.6, 4.6] }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.32 }}
          onCreated={({ gl }) => {
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <Suspense fallback={null}>
            <LoftRoom variant={variant} />
          </Suspense>
          {/* Swobodna orbita; target w centrum pomieszczenia, ograniczony dystans,
              maxPolarAngle < 90° blokuje wejście kamery pod podłogę. */}
          <OrbitControls
            makeDefault
            target={[3.0, 1.2, 2.4]}
            enablePan
            minDistance={1.4}
            maxDistance={8.5}
            maxPolarAngle={Math.PI * 0.49}
            minPolarAngle={Math.PI * 0.12}
          />
        </Canvas>
      </div>
      <noscript>
        <Spinner label="Podgląd wymaga JavaScript" />
      </noscript>
    </div>
  );
}
