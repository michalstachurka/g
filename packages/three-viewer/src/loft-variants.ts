/**
 * Warianty tła loftowego. Zmiana wariantu podmienia wyłącznie MATERIAŁY
 * (kolor/rozjaśnienie/tekstura podłogi) - geometria bryły budowana jest raz.
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
  /** Podłoga: tint + rozjaśnienie (ciemniejsza od ściany). */
  floorTint: string;
  floorBrighten: number;
  /** Betonowy sufit: ciemnoszary tint + rozjaśnienie. */
  ceilingTint: string;
  ceilingBrighten: number;
  /** Światło dzienne z okna. */
  sunColor: string;
  sunIntensity: number;
}

export const LOFT_VARIANTS: LoftVariant[] = [
  {
    key: 'a',
    name: 'Czerwona cegła + mikrocement',
    description: 'Czerwona cegła na ścianie z oknem, szary mikrocement na ścianie drzwiowej, ciemniejsza podłoga, betonowy sufit.',
    brickTint: '#ffffff',
    wallTint: '#d9d9d7',
    wallBrighten: 1.45,
    floor: 'concrete',
    floorTint: '#c4c3c0',
    floorBrighten: 1.6,
    ceilingTint: '#a3a4a6',
    ceilingBrighten: 1.8,
    sunColor: '#fff4e6',
    sunIntensity: 2.2,
  },
  {
    key: 'b',
    name: 'Terakota + jaśniejszy mikrocement',
    description: 'Przydymiona terakota i jaśniejszy, chłodniejszy mikrocement.',
    brickTint: '#e6b892',
    wallTint: '#e6e6e3',
    wallBrighten: 1.62,
    floor: 'concrete',
    floorTint: '#cfcecb',
    floorBrighten: 1.65,
    ceilingTint: '#adaeb0',
    ceilingBrighten: 1.9,
    sunColor: '#ffefdc',
    sunIntensity: 2.1,
  },
  {
    key: 'c',
    name: 'Czerwona cegła + deski',
    description: 'Cegła jak w wariancie A, podłoga z desek, ściany w mikrocemencie.',
    brickTint: '#ffffff',
    wallTint: '#d9d9d7',
    wallBrighten: 1.45,
    floor: 'wood',
    floorTint: '#e8cba6',
    floorBrighten: 1,
    ceilingTint: '#a3a4a6',
    ceilingBrighten: 1.8,
    sunColor: '#fff4e6',
    sunIntensity: 2.2,
  },
];
