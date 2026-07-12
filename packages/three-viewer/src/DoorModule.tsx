'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import type { RenderSpec } from '@door/contracts';
import { MM_TO_M } from '@door/contracts';
import type { ModulePlacement } from './composition';
import type { MaterialLibrary } from './materials';

export function resolveNodePath(root: THREE.Object3D, path: string): THREE.Object3D | null {
  let current: THREE.Object3D = root;
  for (const segment of path.split('/')) {
    const index = Number(segment);
    if (!Number.isInteger(index) || !current.children[index]) return null;
    current = current.children[index];
  }
  return current;
}

interface BuiltModule {
  scaled: THREE.Group;
  fixed: THREE.Group;
}

/**
 * Buduje strukturę modułu zgodnie z kontraktem kompozycji:
 * części sztywne trafiają do grupy nieskalowanej z offsetem w metrach.
 * Materiały pochodzą wyłącznie z biblioteki (klonowane per moduł).
 */
function buildModule(
  source: THREE.Object3D,
  placement: ModulePlacement,
  publicMaterials: RenderSpec['publicMaterials'],
  materials: MaterialLibrary,
): BuiltModule {
  const cloned = source.clone(true);
  const scaled = new THREE.Group();
  scaled.name = `scaled:${placement.slot}`;
  const fixed = new THREE.Group();
  fixed.name = `fixed:${placement.slot}`;

  // Mapowanie po ścieżkach musi nastąpić PRZED przenoszeniem węzłów.
  const resolved = placement.parts.map((part) => ({
    part,
    node: resolveNodePath(cloned, part.nodePath),
  }));

  for (const { part, node } of resolved) {
    if (!node) continue;
    node.visible = part.visible;
    node.userData.semanticRole = part.role;
    node.userData.materialSlot = part.materialSlot;
    const materialKey = part.materialSlot ? publicMaterials[part.materialSlot] : undefined;
    node.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).material = materials.instanceFor(
          materialKey,
          `${placement.publicAssetId}:${part.materialSlot ?? 'none'}`,
        );
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  // Przenoszenie: sztywne części poza grupę skalowaną + offset w metrach.
  for (const { part, node } of resolved) {
    if (!node) continue;
    if (part.fixedSize) {
      node.removeFromParent();
      node.position.x += part.offsetM[0];
      node.position.y += part.offsetM[1];
      node.position.z += part.offsetM[2];
      fixed.add(node);
    }
  }
  scaled.add(cloned);
  return { scaled, fixed };
}

export interface DoorModuleProps {
  placement: ModulePlacement;
  fileUrl: string;
  publicMaterials: RenderSpec['publicMaterials'];
  materials: MaterialLibrary;
  animation: RenderSpec['animation'];
  /** 0 = zamknięte, 1 = w pełni otwarte. */
  openAmount: number;
}

export function DoorModule({
  placement,
  fileUrl,
  publicMaterials,
  materials,
  animation,
  openAmount,
}: DoorModuleProps) {
  const gltf = useGLTF(fileUrl);

  const built = useMemo(
    () => buildModule(gltf.scene, placement, publicMaterials, materials),
    [gltf.scene, placement, publicMaterials, materials],
  );

  const scale = placement.scale;
  const mirrored = placement.mirrored;
  const mirrorShift = 2 * placement.mirrorPlaneX;

  // Animacja: obrót wokół osi zawiasów albo przesuw wzdłuż prowadnicy.
  const pivot = animation.pivotMm ?? [0, 0, 0];
  const pivotM: [number, number, number] = [pivot[0] * MM_TO_M, 0, pivot[2] * MM_TO_M];
  const angleRad =
    placement.animated && animation.type === 'hinge'
      ? -THREE.MathUtils.degToRad(animation.maxAngleDeg) * openAmount * animation.direction
      : 0;
  const slideM =
    placement.animated && animation.type === 'slide'
      ? (animation.slideDistanceMm ?? 0) * MM_TO_M * openAmount * animation.direction
      : 0;

  const content = (
    <group position={placement.positionM}>
      <group
        position-x={mirrored ? mirrorShift : 0}
        scale-x={mirrored ? -1 : 1}
      >
        <group scale={[scale[0], scale[1], scale[2]]}>
          <primitive object={built.scaled} />
        </group>
        <primitive object={built.fixed} />
      </group>
    </group>
  );

  if (placement.animated && animation.type === 'hinge') {
    return (
      <group position={pivotM} rotation-y={angleRad}>
        <group position={[-pivotM[0], 0, -pivotM[2]]}>{content}</group>
      </group>
    );
  }
  if (placement.animated && animation.type === 'slide') {
    return <group position-x={slideM}>{content}</group>;
  }
  return content;
}
