import { Document, NodeIO } from '@gltf-transform/core';

/**
 * Konwersja Wavefront OBJ -> GLB przy wgrywaniu assetu.
 * Dalszy pipeline (inspekcja, mapowanie ról, viewer, eksporty AR) pracuje
 * wyłącznie na GLB - konwertujemy na brzegu systemu.
 *
 * Zasady:
 * - węzły GLB powstają z grup OBJ (`o`/`g`); plik bez grup dzielimy po
 *   `usemtl`, a bez jednego i drugiego trafia do jednego węzła - podział
 *   jest niezbędny, aby w panelu dało się mapować role części,
 * - jednostki: OBJ nie niesie jednostek; dobieramy skalę tak, aby największy
 *   wymiar wypadł w realnym zakresie drzwi (0.3-6 m), preferując wynik
 *   najbliższy 2.1 m; wybór raportujemy w ostrzeżeniach,
 * - orientacja: gdy wysokość leży na osi Z (eksporty CAD), obracamy do Y-up,
 * - pivot: przesuwamy geometrię do lewego-dolnego rogu (x,y od 0),
 *   głębokość centrowana na 0 - zgodnie z konwencją naszych modułów,
 * - normalne: z pliku, a gdy ich brak - płaskie per trójkąt,
 * - materiały: nazwy z `usemtl` zachowujemy (neutralny PBR); plików .mtl
 *   nie importujemy - kolory i tak nadaje konfigurator po rolach.
 */

export interface ObjConversionInfo {
  scaleApplied: number;
  axisRotatedZUp: boolean;
  nodeCount: number;
  triangleCount: number;
  warnings: string[];
}

interface FaceVertex {
  v: number;
  vt: number;
  vn: number;
}

interface Chunk {
  name: string;
  /** materiał -> lista trójkątów (każdy trójkąt = 3 wierzchołki twarzy) */
  byMaterial: Map<string, FaceVertex[][]>;
}

const PLAUSIBLE_MIN_M = 0.3;
const PLAUSIBLE_MAX_M = 6;
const TARGET_M = 2.1;
const CANDIDATE_SCALES: [number, string][] = [
  [1, 'metry'],
  [0.001, 'milimetry'],
  [0.01, 'centymetry'],
  [0.0254, 'cale'],
];

function parseIndex(token: string, count: number): number {
  const n = Number(token);
  if (!Number.isInteger(n) || n === 0) return -1;
  return n > 0 ? n - 1 : count + n;
}

export async function convertObjToGlb(
  objText: string,
): Promise<{ glb: Buffer; info: ObjConversionInfo }> {
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const chunks: Chunk[] = [];
  const warnings: string[] = [];
  let sawMtllib = false;

  const hasGroups = /^[og]\s+\S/m.test(objText);
  let currentMaterial = 'domyslny';
  let current: Chunk | null = null;
  const ensureChunk = (name: string): Chunk => {
    const chunk: Chunk = { name, byMaterial: new Map() };
    chunks.push(chunk);
    return chunk;
  };

  for (const rawLine of objText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const keyword = parts[0];

    if (keyword === 'v' && parts.length >= 4) {
      positions.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    } else if (keyword === 'vt' && parts.length >= 3) {
      uvs.push(Number(parts[1]), Number(parts[2]));
    } else if (keyword === 'vn' && parts.length >= 4) {
      normals.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    } else if (keyword === 'mtllib') {
      sawMtllib = true;
    } else if (keyword === 'o' || keyword === 'g') {
      const name = parts.slice(1).join(' ') || `czesc_${chunks.length + 1}`;
      // nowy chunk tylko, gdy poprzedni ma już geometrię (eksportery lubią
      // wypluwać puste 'g' przed danymi)
      if (!current || [...current.byMaterial.values()].some((t) => t.length > 0)) {
        current = ensureChunk(name);
      } else {
        current.name = name;
      }
    } else if (keyword === 'usemtl') {
      currentMaterial = parts.slice(1).join(' ') || 'domyslny';
      // plik bez o/g: dzielimy węzły po materiałach
      if (!hasGroups) {
        if (!current || [...current.byMaterial.values()].some((t) => t.length > 0)) {
          current = ensureChunk(currentMaterial);
        } else {
          current.name = currentMaterial;
        }
      }
    } else if (keyword === 'f' && parts.length >= 4) {
      if (!current) current = ensureChunk('czesc_1');
      const verts: FaceVertex[] = [];
      for (const token of parts.slice(1)) {
        const [vi, ti, ni] = token.split('/');
        verts.push({
          v: parseIndex(vi ?? '', positions.length / 3),
          vt: ti ? parseIndex(ti, uvs.length / 2) : -1,
          vn: ni ? parseIndex(ni, normals.length / 3) : -1,
        });
      }
      if (verts.some((x) => x.v < 0 || x.v >= positions.length / 3)) continue;
      const list = current.byMaterial.get(currentMaterial) ?? [];
      // triangulacja wachlarzowa wielokątów
      for (let i = 1; i + 1 < verts.length; i++) {
        list.push([verts[0], verts[i], verts[i + 1]]);
      }
      current.byMaterial.set(currentMaterial, list);
    }
  }

  const totalTris = chunks.reduce(
    (sum, c) => sum + [...c.byMaterial.values()].reduce((s, t) => s + t.length, 0),
    0,
  );
  if (positions.length === 0 || totalTris === 0) {
    throw new Error('plik OBJ nie zawiera geometrii (wierzchołków i ścianek).');
  }
  if (sawMtllib) {
    warnings.push(
      'Plik odwołuje się do biblioteki materiałów (.mtl) - kolory z .mtl nie są importowane; materiały nadasz przez role części w konfiguratorze.',
    );
  }

  // ── jednostki ──────────────────────────────────────────────────────────────
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = positions[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  const rawSize = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  let scale = 1;
  let scaleName = 'metry';
  let best = Infinity;
  for (const [candidate, name] of CANDIDATE_SCALES) {
    const result = rawSize * candidate;
    if (result < PLAUSIBLE_MIN_M || result > PLAUSIBLE_MAX_M) continue;
    const distance = Math.abs(Math.log(result / TARGET_M));
    if (distance < best) {
      best = distance;
      scale = candidate;
      scaleName = name;
    }
  }
  if (best === Infinity) {
    warnings.push(
      `Nietypowy rozmiar geometrii (${rawSize.toFixed(1)} jednostek) - przyjęto metry. Sprawdź wymiary w podglądzie mapowania.`,
    );
  } else if (scale !== 1) {
    warnings.push(`Jednostki pliku zinterpretowano jako ${scaleName} (skala ${scale}).`);
  }

  // ── orientacja (Z-up -> Y-up) ──────────────────────────────────────────────
  const extY = (max[1] - min[1]) * scale;
  const extZ = (max[2] - min[2]) * scale;
  const rotateZUp = extZ > extY * 1.5;
  if (rotateZUp) {
    warnings.push('Wysokość modelu leżała na osi Z - obrócono do konwencji Y-up.');
  }

  const mapPoint = (i: number): [number, number, number] => {
    let x = positions[i * 3] * scale;
    let y = positions[i * 3 + 1] * scale;
    let z = positions[i * 3 + 2] * scale;
    if (rotateZUp) {
      const ny = z;
      z = -y;
      y = ny;
    }
    return [x, y, z];
  };
  const mapNormal = (i: number): [number, number, number] => {
    let x = normals[i * 3];
    let y = normals[i * 3 + 1];
    let z = normals[i * 3 + 2];
    if (rotateZUp) {
      const ny = z;
      z = -y;
      y = ny;
    }
    const len = Math.hypot(x, y, z) || 1;
    return [x / len, y / len, z / len];
  };

  // pivot: lewy-dolny róg, głębokość wycentrowana
  let pMin = [Infinity, Infinity, Infinity];
  let pMax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length / 3; i++) {
    const p = mapPoint(i);
    for (let a = 0; a < 3; a++) {
      if (p[a] < pMin[a]) pMin[a] = p[a];
      if (p[a] > pMax[a]) pMax[a] = p[a];
    }
  }
  const offset: [number, number, number] = [-pMin[0], -pMin[1], -(pMin[2] + pMax[2]) / 2];

  // ── budowa GLB ─────────────────────────────────────────────────────────────
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('scene');
  doc.getRoot().setDefaultScene(scene);
  const materialCache = new Map<string, ReturnType<Document['createMaterial']>>();
  const materialFor = (name: string) => {
    let mat = materialCache.get(name);
    if (!mat) {
      mat = doc
        .createMaterial(name)
        .setBaseColorFactor([0.75, 0.73, 0.7, 1])
        .setRoughnessFactor(0.6)
        .setMetallicFactor(0.05);
      materialCache.set(name, mat);
    }
    return mat;
  };

  let nodeCount = 0;
  for (const chunk of chunks) {
    const mesh = doc.createMesh(chunk.name);
    let chunkTris = 0;
    for (const [materialName, tris] of chunk.byMaterial) {
      if (!tris.length) continue;
      chunkTris += tris.length;
      const pos: number[] = [];
      const nrm: number[] = [];
      const uv: number[] = [];
      const hasUv = tris.every((t) => t.every((fv) => fv.vt >= 0 && fv.vt < uvs.length / 2));
      for (const tri of tris) {
        const pts = tri.map((fv) => {
          const p = mapPoint(fv.v);
          return [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]] as [number, number, number];
        });
        const hasVn = tri.every((fv) => fv.vn >= 0 && fv.vn < normals.length / 3);
        let flat: [number, number, number] | null = null;
        if (!hasVn) {
          const u = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
          const w = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
          const n: [number, number, number] = [
            u[1] * w[2] - u[2] * w[1],
            u[2] * w[0] - u[0] * w[2],
            u[0] * w[1] - u[1] * w[0],
          ];
          const len = Math.hypot(n[0], n[1], n[2]) || 1;
          flat = [n[0] / len, n[1] / len, n[2] / len];
        }
        tri.forEach((fv, k) => {
          pos.push(pts[k][0], pts[k][1], pts[k][2]);
          const n = flat ?? mapNormal(fv.vn);
          nrm.push(n[0], n[1], n[2]);
          if (hasUv) uv.push(uvs[fv.vt * 2], 1 - uvs[fv.vt * 2 + 1]);
        });
      }
      const prim = doc
        .createPrimitive()
        .setAttribute(
          'POSITION',
          doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer),
        )
        .setAttribute(
          'NORMAL',
          doc.createAccessor().setType('VEC3').setArray(new Float32Array(nrm)).setBuffer(buffer),
        )
        .setMaterial(materialFor(materialName));
      if (hasUv && uv.length) {
        prim.setAttribute(
          'TEXCOORD_0',
          doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buffer),
        );
      }
      mesh.addPrimitive(prim);
    }
    if (!chunkTris) {
      mesh.dispose();
      continue;
    }
    scene.addChild(doc.createNode(chunk.name).setMesh(mesh));
    nodeCount++;
  }

  const io = new NodeIO();
  const glb = Buffer.from(await io.writeBinary(doc));
  return {
    glb,
    info: { scaleApplied: scale, axisRotatedZUp: rotateZUp, nodeCount, triangleCount: totalTris, warnings },
  };
}
