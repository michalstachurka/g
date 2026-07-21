/**
 * Warianty sceny loftowej. Zmiana wariantu podmienia wyłącznie MATERIAŁY
 * (tinty/rozjaśnienia + temperatura światła) - geometria budowana jest raz.
 * Wariant A odtwarza referencyjny render klienta: ciepły greige na ścianie
 * drzwiowej, czerwona cegła po lewej, ciemny beton po prawej, deski, ciemny
 * sufit z czarnymi belkami i ciepłe punktowe światło.
 */

export type LoftFloorKind = 'concrete' | 'wood';

export interface LoftVariant {
  key: string;
  name: string;
  description: string;
  /** Mnożnik koloru cegły (#ffffff = oryginał). */
  brickTint: string;
  /** Mikrocement na ścianie drzwiowej: tint + rozjaśnienie albedo. */
  wallTint: string;
  wallBrighten: number;
  floor: LoftFloorKind;
  /** Podłoga: tint + rozjaśnienie. */
  floorTint: string;
  floorBrighten: number;
  /** Sufit: ciemny tint + rozjaśnienie. */
  ceilingTint: string;
  ceilingBrighten: number;
  /** Główne światło punktowe (reflektor). */
  sunColor: string;
  sunIntensity: number;
}

export const LOFT_VARIANTS: LoftVariant[] = [
  {
    key: 'a',
    name: 'Loft ciepły',
    description: 'Referencja: ciepły greige, czerwona cegła, deski, czarne belki, ciepły reflektor.',
    brickTint: '#ffffff',
    wallTint: '#b9a795',
    wallBrighten: 1.35,
    floor: 'wood',
    floorTint: '#d8b98f',
    floorBrighten: 1.0,
    ceilingTint: '#57504b',
    ceilingBrighten: 1.0,
    sunColor: '#ffbd85',
    sunIntensity: 2.4,
  },
  {
    key: 'b',
    name: 'Loft jasny',
    description: 'Jaśniejszy, chłodniejszy mikrocement; reszta jak w wariancie A.',
    brickTint: '#f2e3d3',
    wallTint: '#d8d3cb',
    wallBrighten: 1.6,
    floor: 'wood',
    floorTint: '#e0c49e',
    floorBrighten: 1.05,
    ceilingTint: '#6a6560',
    ceilingBrighten: 1.15,
    sunColor: '#ffd9b0',
    sunIntensity: 2.3,
  },
  {
    key: 'c',
    name: 'Loft grafitowy',
    description: 'Ciemny grafitowy mikrocement, mocniejszy nastrój galerii.',
    brickTint: '#e8d5c4',
    wallTint: '#8d8781',
    wallBrighten: 1.05,
    floor: 'wood',
    floorTint: '#c9a97e',
    floorBrighten: 0.95,
    ceilingTint: '#4c4642',
    ceilingBrighten: 0.9,
    sunColor: '#ffc290',
    sunIntensity: 2.6,
  },
];
