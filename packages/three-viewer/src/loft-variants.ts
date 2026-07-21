/**
 * Warianty sceny loftowej. Zmiana wariantu podmienia wyłącznie MATERIAŁY
 * (tinty/rozjaśnienia + temperatura światła) - geometria budowana jest raz.
 *
 *   A. Loft ciepły    - ciepły mikrocement, przygaszona cegła, naturalne drewno,
 *   B. Loft jasny     - jasny greige, jaśniejsza podłoga, neutralne światło,
 *   C. Loft grafitowy - grafitowe ściany, ciemniejsze drewno, jaśniejszy postument.
 */

export type LoftFloorKind = 'concrete' | 'wood';

export interface LoftVariant {
  key: string;
  name: string;
  description: string;
  /** Lewa ściana - cegła: tint + rozjaśnienie (przygaszona). */
  brickTint: string;
  brickBrighten: number;
  /** Ściana drzwiowa - mikrocement: tint (kolor domyślny) + rozjaśnienie. */
  wallTint: string;
  wallBrighten: number;
  /** Prawa ściana + boki podłogi - ciemny beton (nie czerń). */
  sideTint: string;
  floor: LoftFloorKind;
  /** Podłoga (drewno): tint + rozjaśnienie (odsycone w shaderze). */
  floorTint: string;
  floorBrighten: number;
  /** Sufit - ciemnoszary beton. */
  ceilingTint: string;
  /** Postument - jasny kamień/trawertyn. */
  plinthTint: string;
  plinthBrighten: number;
  /** Reflektor na drzwi - temperatura + moc. */
  sunColor: string;
  sunIntensity: number;
}

export const LOFT_VARIANTS: LoftVariant[] = [
  {
    key: 'a',
    name: 'Loft ciepły',
    description: 'Ciepły mikrocement, przygaszona czerwona cegła, naturalna drewniana podłoga, lekko ciepłe światło.',
    brickTint: '#ffffff',
    brickBrighten: 0.82,
    wallTint: '#b9a795',
    wallBrighten: 1.4,
    sideTint: '#242321',
    floor: 'wood',
    floorTint: '#b89a76',
    floorBrighten: 1.0,
    ceilingTint: '#1d1d1c',
    plinthTint: '#d9d2c4',
    plinthBrighten: 1.9,
    sunColor: '#ffd9b3',
    sunIntensity: 2.2,
  },
  {
    key: 'b',
    name: 'Loft jasny',
    description: 'Jasny greige mikrocement, jaśniejsza podłoga, subtelniejsza cegła, neutralne światło.',
    brickTint: '#ecdccb',
    brickBrighten: 0.95,
    wallTint: '#cfcabf',
    wallBrighten: 1.65,
    sideTint: '#2c2b29',
    floor: 'wood',
    floorTint: '#c6ab84',
    floorBrighten: 1.1,
    ceilingTint: '#232322',
    plinthTint: '#e0dacd',
    plinthBrighten: 2.0,
    sunColor: '#ffe9d6',
    sunIntensity: 2.0,
  },
  {
    key: 'c',
    name: 'Loft grafitowy',
    description: 'Grafitowe ściany, ciemniejsze drewno, przygaszona cegła, jaśniejszy postument, miękka ekspozycja drzwi.',
    brickTint: '#d8c4b2',
    brickBrighten: 0.8,
    wallTint: '#8c8781',
    wallBrighten: 1.15,
    sideTint: '#2c2b29',
    floor: 'wood',
    floorTint: '#a5885f',
    floorBrighten: 0.92,
    ceilingTint: '#1b1b1a',
    plinthTint: '#ddd6c9',
    plinthBrighten: 2.05,
    sunColor: '#ffdcb8',
    sunIntensity: 2.4,
  },
];
