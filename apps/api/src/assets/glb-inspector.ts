/**
 * Inspekcja przesłanego GLB: raport techniczny do panelu (drzewo węzłów po
 * ścieżkach indeksów, materiały, statystyki, bounding box, walidacje).
 * Czysty parser binarny - żadnego wykonywania treści pliku.
 */

export interface GlbNodeReport {
  path: string;
  name: string | null;
  meshIndex: number | null;
  triangles: number;
  materials: number[];
  bboxMin: [number, number, number] | null;
  bboxMax: [number, number, number] | null;
  children: GlbNodeReport[];
}

export interface GlbReport {
  valid: boolean;
  problems: string[];
  warnings: string[];
  generator: string | null;
  extensionsUsed: string[];
  nodeCount: number;
  meshCount: number;
  materialCount: number;
  textureCount: number;
  animationCount: number;
  cameraCount: number;
  lightCount: number;
  totalTriangles: number;
  byteSize: number;
  bboxMin: [number, number, number] | null;
  bboxMax: [number, number, number] | null;
  suggestedBaseWidthMm: number | null;
  suggestedBaseHeightMm: number | null;
  suggestedBaseDepthMm: number | null;
  materials: { index: number; name: string | null; hasTexture: boolean; alphaMode: string }[];
  tree: GlbNodeReport[];
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

type Vec3 = [number, number, number];
type Mat4 = number[];

function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function composeTRS(t: number[] = [0, 0, 0], r: number[] = [0, 0, 0, 1], s: number[] = [1, 1, 1]): Mat4 {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = s;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}

function mul(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++) out[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
  return out;
}

function apply(m: Mat4, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
}

export function parseGlbJson(buffer: Buffer): { json: Record<string, unknown>; problems: string[] } {
  const problems: string[] = [];
  if (buffer.length < 20) return { json: {}, problems: ['Plik jest za mały na poprawny GLB.'] };
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) {
    return { json: {}, problems: ['Nieprawidłowy nagłówek - to nie jest plik GLB (glTF binary).'] };
  }
  const version = buffer.readUInt32LE(4);
  if (version !== 2) problems.push(`Wymagany glTF 2.0, otrzymano wersję ${version}.`);
  let offset = 12;
  let json: Record<string, unknown> | null = null;
  while (offset + 8 <= buffer.length) {
    const chunkLen = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    if (chunkType === CHUNK_JSON) {
      try {
        json = JSON.parse(buffer.subarray(offset + 8, offset + 8 + chunkLen).toString('utf8'));
      } catch {
        problems.push('Uszkodzony chunk JSON w pliku GLB.');
      }
    }
    offset += 8 + chunkLen + (chunkLen % 4 ? 4 - (chunkLen % 4) : 0);
  }
  if (!json) problems.push('Brak chunka JSON w pliku GLB.');
  return { json: json ?? {}, problems };
}

export function inspectGlb(buffer: Buffer): GlbReport {
  const { json, problems } = parseGlbJson(buffer);
  const warnings: string[] = [];
  const g = json as {
    asset?: { generator?: string };
    extensionsUsed?: string[];
    nodes?: { name?: string; mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; camera?: number; extensions?: Record<string, unknown> }[];
    meshes?: { name?: string; primitives?: { attributes?: Record<string, number>; indices?: number; material?: number }[] }[];
    materials?: { name?: string; alphaMode?: string; pbrMetallicRoughness?: { baseColorTexture?: unknown } }[];
    textures?: unknown[];
    animations?: unknown[];
    cameras?: unknown[];
    accessors?: { count?: number; min?: number[]; max?: number[] }[];
    scenes?: { nodes?: number[] }[];
    scene?: number;
    extensions?: Record<string, unknown>;
  };

  const nodes = g.nodes ?? [];
  const meshes = g.meshes ?? [];
  const accessors = g.accessors ?? [];
  const cameraCount = (g.cameras ?? []).length;
  let lightCount = 0;
  for (const n of nodes) {
    if (n.extensions && 'KHR_lights_punctual' in n.extensions) lightCount += 1;
  }

  let totalTriangles = 0;
  const globalMin: Vec3 = [Infinity, Infinity, Infinity];
  const globalMax: Vec3 = [-Infinity, -Infinity, -Infinity];

  const buildNode = (index: number, path: string, parent: Mat4): GlbNodeReport => {
    const n = nodes[index] ?? {};
    const local = n.matrix ? (n.matrix as Mat4) : composeTRS(n.translation, n.rotation, n.scale);
    const world = mul(parent, local);
    let triangles = 0;
    const materials: number[] = [];
    let bboxMin: Vec3 | null = null;
    let bboxMax: Vec3 | null = null;
    if (n.mesh != null && meshes[n.mesh]) {
      for (const prim of meshes[n.mesh].primitives ?? []) {
        if (prim.material != null && !materials.includes(prim.material)) materials.push(prim.material);
        if (prim.indices != null) triangles += Math.round((accessors[prim.indices]?.count ?? 0) / 3);
        else if (prim.attributes?.POSITION != null)
          triangles += Math.round((accessors[prim.attributes.POSITION]?.count ?? 0) / 3);
        const acc = prim.attributes?.POSITION != null ? accessors[prim.attributes.POSITION] : undefined;
        if (acc?.min && acc?.max) {
          for (const cx of [acc.min[0], acc.max[0]])
            for (const cy of [acc.min[1], acc.max[1]])
              for (const cz of [acc.min[2], acc.max[2]]) {
                const w = apply(world, [cx, cy, cz]);
                bboxMin = bboxMin ?? [Infinity, Infinity, Infinity];
                bboxMax = bboxMax ?? [-Infinity, -Infinity, -Infinity];
                for (let i = 0; i < 3; i++) {
                  bboxMin[i] = Math.min(bboxMin[i], w[i]);
                  bboxMax[i] = Math.max(bboxMax[i], w[i]);
                  globalMin[i] = Math.min(globalMin[i], w[i]);
                  globalMax[i] = Math.max(globalMax[i], w[i]);
                }
              }
        }
      }
      totalTriangles += triangles;
    }
    const children = (n.children ?? []).map((childIndex, i) =>
      buildNode(childIndex, `${path}/${i}`, world),
    );
    return {
      path,
      name: n.name ?? null,
      meshIndex: n.mesh ?? null,
      triangles,
      materials,
      bboxMin,
      bboxMax,
      children,
    };
  };

  const sceneRoots = g.scenes?.[g.scene ?? 0]?.nodes ?? [];
  const tree = sceneRoots.map((rootIndex, i) => buildNode(rootIndex, String(i), identity()));

  if (cameraCount > 0) warnings.push(`Plik zawiera ${cameraCount} kamer - zostaną usunięte w kopii publicznej.`);
  if (lightCount > 0) warnings.push(`Plik zawiera ${lightCount} świateł - zostaną usunięte w kopii publicznej.`);
  if (totalTriangles > 300_000) warnings.push(`Duża liczba trójkątów (${totalTriangles}) - model może działać wolno na telefonach.`);
  if ((g.textures ?? []).length > 8) warnings.push('Duża liczba tekstur - rozważ uproszczenie.');

  const hasBbox = globalMin[0] !== Infinity;
  const sizeM = hasBbox ? globalMax.map((v, i) => v - globalMin[i]) : null;
  if (sizeM && (sizeM[0] > 10 || sizeM[1] > 10)) {
    warnings.push('Model ma ponad 10 m - sprawdź, czy jednostki to metry (wymagane 1 jednostka = 1 m).');
  }
  if (sizeM && sizeM[0] < 0.05 && sizeM[1] < 0.05) {
    warnings.push('Model jest mniejszy niż 5 cm - sprawdź jednostki (wymagane metry).');
  }

  return {
    valid: problems.length === 0,
    problems,
    warnings,
    generator: g.asset?.generator ?? null,
    extensionsUsed: g.extensionsUsed ?? [],
    nodeCount: nodes.length,
    meshCount: meshes.length,
    materialCount: (g.materials ?? []).length,
    textureCount: (g.textures ?? []).length,
    animationCount: (g.animations ?? []).length,
    cameraCount,
    lightCount,
    totalTriangles,
    byteSize: buffer.length,
    bboxMin: hasBbox ? globalMin : null,
    bboxMax: hasBbox ? globalMax : null,
    suggestedBaseWidthMm: sizeM ? Math.round(sizeM[0] * 1000) : null,
    suggestedBaseHeightMm: sizeM ? Math.round(sizeM[1] * 1000) : null,
    suggestedBaseDepthMm: sizeM ? Math.round(sizeM[2] * 1000) : null,
    materials: (g.materials ?? []).map((m, index) => ({
      index,
      name: m.name ?? null,
      hasTexture: Boolean(m.pbrMetallicRoughness?.baseColorTexture),
      alphaMode: m.alphaMode ?? 'OPAQUE',
    })),
    tree,
  };
}
