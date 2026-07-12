'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three-stdlib';
import { Spinner } from '@door/ui';

/**
 * Podgląd surowego (nieopublikowanego) GLB w panelu. Plik pobierany z sesją
 * (credentials), więc nie przez useGLTF. Kliknięcie mesha podświetla węzeł
 * i zgłasza jego ścieżkę indeksów do edytora mapowania.
 */
export function AssetPreview({
  fileUrl,
  selectedPath,
  mappedPaths,
  onPickNode,
}: {
  fileUrl: string;
  selectedPath: string | null;
  mappedPaths: Set<string>;
  onPickNode: (path: string) => void;
}) {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(fileUrl, { credentials: 'include' });
        if (!response.ok) throw new Error(`Błąd pobierania pliku (${response.status})`);
        const buffer = await response.arrayBuffer();
        const gltf = await new GLTFLoader().parseAsync(buffer, '');
        if (!cancelled) setScene(gltf.scene);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  const pathByObject = useMemo(() => {
    const map = new Map<THREE.Object3D, string>();
    if (!scene) return map;
    const walk = (node: THREE.Object3D, path: string) => {
      map.set(node, path);
      node.children.forEach((child, index) => walk(child, `${path}/${index}`));
    };
    scene.children.forEach((child, index) => walk(child, String(index)));
    return map;
  }, [scene]);

  const { center, size } = useMemo(() => {
    if (!scene) return { center: new THREE.Vector3(), size: 2 };
    const box = new THREE.Box3().setFromObject(scene);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    return { center: c, size: Math.max(s.x, s.y, s.z, 0.5) };
  }, [scene]);

  // Kolorowanie: zmapowane = zielonkawe, wybrany = akcent, reszta = neutralne.
  useEffect(() => {
    if (!scene) return;
    scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      let topLevel: THREE.Object3D = node;
      while (topLevel.parent && topLevel.parent !== scene) topLevel = topLevel.parent;
      const path = pathByObject.get(topLevel) ?? pathByObject.get(node);
      const isSelected = path != null && path === selectedPath;
      const isMapped = path != null && mappedPaths.has(path);
      mesh.material = new THREE.MeshStandardMaterial({
        color: isSelected ? '#c8973f' : isMapped ? '#7da287' : '#c9c6c0',
        roughness: 0.75,
        metalness: 0.05,
        side: THREE.DoubleSide,
        transparent: !isSelected && selectedPath != null,
        opacity: !isSelected && selectedPath != null ? 0.55 : 1,
      });
    });
  }, [scene, selectedPath, mappedPaths, pathByObject]);

  if (error) {
    return <div className="grid h-full place-items-center p-4 text-center text-sm text-[var(--c-error)]">{error}</div>;
  }
  if (!scene) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner label="Ładowanie podglądu…" />
      </div>
    );
  }

  return (
    <Canvas
      camera={{ position: [center.x - size * 0.9, center.y + size * 0.35, center.z - size * 1.4], fov: 42 }}
      style={{ background: '#edebe6' }}
    >
      <hemisphereLight intensity={0.7} groundColor="#cfc9bd" />
      <directionalLight position={[-2, 3, -3]} intensity={1.1} />
      <directionalLight position={[3, 2, 2]} intensity={0.4} />
      <Suspense fallback={null}>
        <primitive
          object={scene}
          onClick={(event: { object: THREE.Object3D; stopPropagation: () => void }) => {
            event.stopPropagation();
            let topLevel: THREE.Object3D = event.object;
            while (topLevel.parent && topLevel.parent.type !== 'Scene' && topLevel.parent !== scene) {
              topLevel = topLevel.parent;
            }
            const path = pathByObject.get(topLevel);
            if (path) onPickNode(path);
          }}
        />
      </Suspense>
      <OrbitControls target={[center.x, center.y, center.z]} />
      <gridHelper args={[6, 12, '#bdb8ae', '#d8d4cb']} position={[center.x, 0, center.z]} />
    </Canvas>
  );
}
