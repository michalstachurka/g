import * as THREE from 'three';
import type { PublicMaterialDef } from '@door/contracts';

/**
 * Materiały publiczne budowane parametrycznie z katalogu tenanta.
 * Każdy moduł dostaje własny klon - mutacja jednego modelu nigdy nie
 * zmienia pozostałych (wymóg 7.3.2).
 */
export function buildMaterial(def: PublicMaterialDef): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    name: def.key,
    color: new THREE.Color(def.baseColorHex),
    roughness: def.roughness,
    metalness: def.metalness,
    side: THREE.DoubleSide,
  });
  if (def.transmission > 0) {
    material.transmission = def.transmission;
    material.thickness = 0.01;
    material.ior = 1.5;
    material.transparent = true;
    material.opacity = 1;
    material.depthWrite = false;
  } else if (def.opacity < 1) {
    material.transparent = true;
    material.opacity = def.opacity;
  }
  if (def.clearcoat > 0) {
    material.clearcoat = def.clearcoat;
    material.clearcoatRoughness = 0.35;
  }
  if (def.kind === 'mirror') {
    material.metalness = 1;
    material.roughness = Math.min(def.roughness, 0.06);
    material.envMapIntensity = 1.4;
  }
  return material;
}

export const FALLBACK_MATERIAL_DEF: PublicMaterialDef = {
  key: 'fallback-neutral',
  name: 'Neutralny',
  kind: 'color',
  baseColorHex: '#c8c5bf',
  roughness: 0.75,
  metalness: 0,
  opacity: 1,
  transmission: 0,
  clearcoat: 0,
};

export class MaterialLibrary {
  private readonly defs = new Map<string, PublicMaterialDef>();
  private readonly instances = new Map<string, THREE.MeshPhysicalMaterial>();

  constructor(defs: PublicMaterialDef[]) {
    for (const def of defs) this.defs.set(def.key, def);
  }

  /** Instancja per (materiał, właściciel) - klonowanie przed mutacją. */
  instanceFor(materialKey: string | undefined, ownerKey: string): THREE.MeshPhysicalMaterial {
    const def = (materialKey && this.defs.get(materialKey)) || FALLBACK_MATERIAL_DEF;
    const cacheKey = `${ownerKey}:${def.key}`;
    let instance = this.instances.get(cacheKey);
    if (!instance) {
      instance = buildMaterial(def);
      this.instances.set(cacheKey, instance);
    }
    return instance;
  }

  dispose() {
    for (const material of this.instances.values()) material.dispose();
    this.instances.clear();
  }
}
