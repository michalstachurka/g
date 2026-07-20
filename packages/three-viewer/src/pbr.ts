import * as THREE from 'three';

/**
 * Ładowanie tekstur PBR z poprawnym boilerplatem:
 * - SRGBColorSpace WYŁĄCZNIE dla mapy koloru (normal/roughness/AO są danymi
 *   liniowymi - ustawiamy NoColorSpace),
 * - RepeatWrapping + repeat dobrany do realnej skali materiału (np. cegła
 *   ~6.5 cm wysokości rzędu, deska ~12 cm szerokości),
 * - aoMap czyta drugi zestaw UV: kopiujemy 'uv' do 'uv1'
 *   (preparePbrGeometryForAo) i zostawiamy domyślny kanał 1 tekstury AO.
 */

export interface PbrTextureSet {
  color: THREE.Texture;
  normal?: THREE.Texture;
  bump?: THREE.Texture;
  roughness?: THREE.Texture;
  ao?: THREE.Texture;
}

export interface PbrMaterialOptions {
  /** Powtórzenia tekstury na powierzchni (oś U i V). */
  repeat: [number, number];
  /** Mnożnik koloru (delikatne tonowanie wariantów w ramach stylu). */
  tint?: string;
  roughness?: number;
  bumpScale?: number;
  anisotropy?: number;
  /**
   * Rozjaśnienie albedo w shaderze (>1 rozjaśnia). Tint może tylko przyciemniać,
   * więc ciemne albedo (np. beton) podnosimy tutaj - inaczej "jasny beton"
   * wyszedłby szary/brudny.
   */
  brighten?: number;
  /** Odsycenie albedo (1 = bez zmian, <1 neutralizuje np. oliwkowy odcień betonu). */
  saturation?: number;
  /** Siła mapy AO (mniej = mniej "plam brudu"). */
  aoIntensity?: number;
}

/** aoMap wymaga drugiego setu UV - duplikujemy 'uv' jako 'uv1'. */
export function preparePbrGeometryForAo(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = geometry.getAttribute('uv');
  if (uv && !geometry.getAttribute('uv1')) {
    geometry.setAttribute('uv1', uv);
  }
  return geometry;
}

/** Klon tekstury z konfiguracją powtarzania i przestrzeni kolorów. */
function configuredClone(
  texture: THREE.Texture,
  srgb: boolean,
  repeat: [number, number],
  anisotropy: number,
): THREE.Texture {
  const t = texture.clone();
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

export function buildPbrMaterial(
  set: PbrTextureSet,
  options: PbrMaterialOptions,
): THREE.MeshStandardMaterial {
  const anisotropy = options.anisotropy ?? 8;
  const material = new THREE.MeshStandardMaterial({
    map: configuredClone(set.color, true, options.repeat, anisotropy),
    roughness: options.roughness ?? 1,
    color: new THREE.Color(options.tint ?? '#ffffff'),
  });
  if (set.normal) {
    material.normalMap = configuredClone(set.normal, false, options.repeat, anisotropy);
  }
  if (set.bump) {
    material.bumpMap = configuredClone(set.bump, false, options.repeat, anisotropy);
    material.bumpScale = options.bumpScale ?? 0.03;
  }
  if (set.roughness) {
    material.roughnessMap = configuredClone(set.roughness, false, options.repeat, anisotropy);
  }
  if (set.ao) {
    material.aoMap = configuredClone(set.ao, false, options.repeat, anisotropy);
    material.aoMapIntensity = options.aoIntensity ?? 1;
  }

  // Korekta albedo w shaderze (rozjaśnienie + odsycenie) - do "jasnego betonu".
  const brighten = options.brighten ?? 1;
  const saturation = options.saturation ?? 1;
  if (brighten !== 1 || saturation !== 1) {
    const b = brighten.toFixed(4);
    const s = saturation.toFixed(4);
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          float _luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = clamp(mix(vec3(_luma), diffuseColor.rgb, ${s}) * ${b}, 0.0, 1.0);
        }`,
      );
    };
    material.customProgramCacheKey = () => `pbr-lift-${b}-${s}`;
  }
  return material;
}
