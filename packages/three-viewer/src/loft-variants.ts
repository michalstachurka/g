/**
 * Warianty tła loftowego. Klient wybrał wariant A (czerwona cegła + jasny
 * beton) - jest głównym, dopracowanym wariantem na prawdziwych teksturach
 * PBR CC0 z Poly Haven. B i C zostają jako alternatywy tonalne/podłogowe.
 */

export type LoftFloorKind = 'concrete' | 'wood';

export interface LoftVariant {
  key: string;
  name: string;
  description: string;
  /** Mnożnik koloru cegły (tonacja w ramach stylu loft; #ffffff = oryginał). */
  brickTint: string;
  /** Mnożnik koloru mikrocementu na ścianach + rozjaśnienie albedo. */
  wallTint: string;
  wallBrighten: number;
  floor: LoftFloorKind;
  /** Mnożnik koloru podłogi + rozjaśnienie albedo. */
  floorTint: string;
  floorBrighten: number;
  /** Temperatura i moc światła dziennego z okna. */
  sunColor: string;
  sunIntensity: number;
}

export const LOFT_VARIANTS: LoftVariant[] = [
  {
    key: 'a',
    name: 'Czerwona cegła + mikrocement',
    description: 'Czerwona cegła na ścianie z oknem, ciepły mikrocement na podłodze i ścianie drzwiowej (wg referencji).',
    brickTint: '#ffffff',
    wallTint: '#efe7db',
    wallBrighten: 1.5,
    floor: 'concrete',
    floorTint: '#e6ddcf',
    floorBrighten: 1.35,
    sunColor: '#ffe3bd',
    sunIntensity: 3.0,
  },
  {
    key: 'b',
    name: 'Terakota + jaśniejszy mikrocement',
    description: 'Przydymiona terakota i jaśniejszy, chłodniejszy mikrocement.',
    brickTint: '#e6b892',
    wallTint: '#f2efe8',
    wallBrighten: 1.75,
    floor: 'concrete',
    floorTint: '#ece7de',
    floorBrighten: 1.6,
    sunColor: '#ffd9a8',
    sunIntensity: 2.7,
  },
  {
    key: 'c',
    name: 'Czerwona cegła + deski',
    description: 'Cegła jak w wariancie A, podłoga z desek, ściany w mikrocemencie.',
    brickTint: '#ffffff',
    wallTint: '#efe7db',
    wallBrighten: 1.5,
    floor: 'wood',
    floorTint: '#e8cba6',
    floorBrighten: 1,
    sunColor: '#ffe3bd',
    sunIntensity: 2.8,
  },
];
