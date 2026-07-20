/**
 * Warianty sceny loftowej - różne kombinacje tekstur/odcieni w ramach stylu.
 * Wybór wariantu należy do klienta (podgląd: /{tenant}/loft).
 *
 * UWAGA - tekstury tymczasowe: polityka sieciowa środowiska deweloperskiego
 * blokuje polyhaven.com/ambientcg.com, więc zestawy docelowe CC0 (kolor +
 * normal GL + roughness + AO) podmienimy po otwarciu sieci. Obecnie: cegła
 * i deski z repozytorium three.js (MIT - patrz public/textures/LICENSES.md),
 * beton jako materiał gładki (bez tekstury).
 */

export type LoftFloorKind = 'concrete' | 'wood';

export interface LoftVariant {
  key: string;
  name: string;
  description: string;
  /** Mnożnik koloru cegły (postarzanie/tonacja w ramach stylu loft). */
  brickTint: string;
  /** Kolor tynku ściany drzwiowej. */
  plasterColor: string;
  floor: LoftFloorKind;
  /** Kolor betonu (gdy floor=concrete; tymczasowo bez tekstury). */
  concreteColor: string;
  /** Mnożnik koloru desek (gdy floor=wood). */
  woodTint: string;
  /** Temperatura światła z okna. */
  sunColor: string;
  sunIntensity: number;
}

export const LOFT_VARIANTS: LoftVariant[] = [
  {
    key: 'a',
    name: 'Czerwona cegła + jasny beton',
    description: 'Naturalna czerwień cegły, jasnoszary beton, neutralny tynk.',
    brickTint: '#ffffff',
    plasterColor: '#a8a29b',
    floor: 'concrete',
    concreteColor: '#9d9a94',
    woodTint: '#ffffff',
    sunColor: '#ffd9b0',
    sunIntensity: 2.1,
  },
  {
    key: 'b',
    name: 'Terakota + ciemny beton',
    description: 'Przydymiona terakota, ciemniejszy beton przemysłowy, cieplejsze światło.',
    brickTint: '#d9a67c',
    plasterColor: '#948d85',
    floor: 'concrete',
    concreteColor: '#827e78',
    woodTint: '#ffffff',
    sunColor: '#ffcf9e',
    sunIntensity: 2.4,
  },
  {
    key: 'c',
    name: 'Czerwona cegła + deski',
    description: 'Cegła jak w wariancie A, ale podłoga z desek zamiast betonu.',
    brickTint: '#ffffff',
    plasterColor: '#aba49c',
    floor: 'wood',
    concreteColor: '#9d9a94',
    woodTint: '#e8cba6',
    sunColor: '#ffd9b0',
    sunIntensity: 2.0,
  },
];
