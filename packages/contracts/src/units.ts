/**
 * Jedyne miejsce konwersji jednostek domenowych (mm) na jednostki sceny Three.js (m).
 * Wymiary w API, bazie i renderSpec są zawsze w milimetrach (liczby całkowite).
 */
export const MM_TO_M = 0.001;

export function mmToM(valueMm: number): number {
  return valueMm * MM_TO_M;
}

export function mmVecToM(v: readonly [number, number, number]): [number, number, number] {
  return [v[0] * MM_TO_M, v[1] * MM_TO_M, v[2] * MM_TO_M];
}

export type Vec3Mm = [number, number, number];
export type Vec3 = [number, number, number];
