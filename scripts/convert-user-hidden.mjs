/**
 * Konwersja dostarczonego przez klienta modelu drzwi ukrytych
 * (HIDDENINTERIORDOOR_4.glb - konwertowany STL, cale, oś Z = wysokość)
 * do formatu źródeł pipeline'u:
 *  - metry, oś Y = wysokość, szerokość wzdłuż +X, pivot lewy-dolny,
 *  - węzły semantyczne: [0] skrzydło, [1] klamka strona +Z, [2] klamka strona -Z,
 *  - skrzydło dopasowane 1:1 do otworu panelu ściany (X 0..0.870, Y 0.030..2.070),
 *    głębokość wyśrodkowana na płaszczyźnie ściany.
 *
 * Bryła STL to jeden mesh - dzielimy trójkąty na komponenty spójności
 * (spawanie wierzchołków po pozycji), klasyfikujemy: płyta skrzydła (pełna
 * szerokość i wysokość) + panel wewnętrzny -> skrzydło; reszta -> klamki wg
 * strony. Wyłącznie reorganizacja istniejącej geometrii klienta (ADR-0004).
 *
 * Użycie: node scripts/convert-user-hidden.mjs <wejście.glb> [wyjście.glb]
 */
import { Document, NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const INPUT = process.argv[2];
const OUTPUT = process.argv[3] ?? join(ROOT, 'assets/source-models/hidden-user.glb');
if (!INPUT) {
  console.error('Podaj ścieżkę wejściowego GLB.');
  process.exit(1);
}

const IN_TO_M = 0.0254;
// Otwór w panelu ściany basic-hidden (świat, metry) - skrzydło ma go wypełnić.
const HOLE = { x0: 0, x1: 0.87, y0: 0.03, y1: 2.07 };

const io = new NodeIO();
const src = await io.read(INPUT);
const srcPrim = src.getRoot().listMeshes()[0].listPrimitives()[0];
const P = srcPrim.getAttribute('POSITION').getArray();
const nVerts = srcPrim.getAttribute('POSITION').getCount();
const IDX = srcPrim.getIndices();
const I = IDX ? IDX.getArray() : null;
const nTris = I ? I.length / 3 : nVerts / 3;

// ── komponenty spójności (spawanie po pozycji 0.001") ──────────────────────
const posKey = (i) =>
  `${Math.round(P[i * 3] * 1000)},${Math.round(P[i * 3 + 1] * 1000)},${Math.round(P[i * 3 + 2] * 1000)}`;
const repByKey = new Map();
const rep = new Int32Array(nVerts);
for (let i = 0; i < nVerts; i++) {
  const k = posKey(i);
  if (repByKey.has(k)) rep[i] = repByKey.get(k);
  else {
    repByKey.set(k, i);
    rep[i] = i;
  }
}
const parent = Int32Array.from({ length: nVerts }, (_, i) => i);
const find = (a) => {
  while (parent[a] !== a) {
    parent[a] = parent[parent[a]];
    a = parent[a];
  }
  return a;
};
const vi = (t, k) => (I ? I[t * 3 + k] : t * 3 + k);
for (let t = 0; t < nTris; t++) {
  const a = find(rep[vi(t, 0)]);
  const b = find(rep[vi(t, 1)]);
  const c = find(rep[vi(t, 2)]);
  if (b !== a) parent[b] = a;
  if (find(c) !== a) parent[find(c)] = a;
}
const comps = new Map();
for (let t = 0; t < nTris; t++) {
  const root = find(rep[vi(t, 0)]);
  if (!comps.has(root))
    comps.set(root, { tris: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
  const comp = comps.get(root);
  comp.tris.push(t);
  for (let k = 0; k < 3; k++) {
    const v = vi(t, k);
    for (let ax = 0; ax < 3; ax++) {
      const val = P[v * 3 + ax];
      if (val < comp.min[ax]) comp.min[ax] = val;
      if (val > comp.max[ax]) comp.max[ax] = val;
    }
  }
}

// ── klasyfikacja: skrzydło = komponenty pokrywające >90% szer. i wys. ──────
// (źródło: X=głębokość, Y=szerokość, Z=wysokość)
let W = -Infinity,
  H = -Infinity,
  Wmin = Infinity,
  Hmin = Infinity,
  Dmin = Infinity,
  Dmax = -Infinity;
for (const c of comps.values()) {
  W = Math.max(W, c.max[1]);
  Wmin = Math.min(Wmin, c.min[1]);
  H = Math.max(H, c.max[2]);
  Hmin = Math.min(Hmin, c.min[2]);
}
const width = W - Wmin;
const height = H - Hmin;
const leafComps = [];
const plusComps = [];
const minusComps = [];
for (const c of comps.values()) {
  const cw = c.max[1] - c.min[1];
  const ch = c.max[2] - c.min[2];
  if (cw > width * 0.9 && ch > height * 0.9) {
    leafComps.push(c);
    Dmin = Math.min(Dmin, c.min[0]);
    Dmax = Math.max(Dmax, c.max[0]);
  }
}
if (!leafComps.length) {
  console.error('Nie znalazłem płyty skrzydła (komponentu pełnowymiarowego).');
  process.exit(1);
}
const depthMid = (Dmin + Dmax) / 2;
for (const c of comps.values()) {
  if (leafComps.includes(c)) continue;
  const cx = (c.min[0] + c.max[0]) / 2;
  (cx >= depthMid ? plusComps : minusComps).push(c);
}
console.log(
  `komponenty: skrzydło=${leafComps.length} (${leafComps.reduce((s, c) => s + c.tris.length, 0)} tri), ` +
    `klamka+Z=${plusComps.length} (${plusComps.reduce((s, c) => s + c.tris.length, 0)} tri), ` +
    `klamka-Z=${minusComps.length} (${minusComps.reduce((s, c) => s + c.tris.length, 0)} tri)`,
);

// ── transformacja współrzędnych ────────────────────────────────────────────
// (x,y,z)źr -> (y,z,x) [szer->X, wys->Y, głęb->Z], cale->metry, potem
// dopasowanie płyty do otworu: X,Y skala do otworu, Z wyśrodkowane na 0.
const fx = (HOLE.x1 - HOLE.x0) / (width * IN_TO_M);
const fy = (HOLE.y1 - HOLE.y0) / (height * IN_TO_M);
console.log(
  `skrzydło ${(width * IN_TO_M * 1000).toFixed(0)}x${(height * IN_TO_M * 1000).toFixed(0)} mm -> otwór 870x2040 (skala X ${fx.toFixed(4)}, Y ${fy.toFixed(4)})`,
);
const mapPoint = (sx, sy, sz) => [
  HOLE.x0 + (sy - Wmin) * IN_TO_M * fx,
  HOLE.y0 + (sz - Hmin) * IN_TO_M * fy,
  (sx - depthMid) * IN_TO_M,
];

// ── budowa dokumentu wyjściowego ───────────────────────────────────────────
const out = new Document();
const buffer = out.createBuffer();
const outScene = out.createScene('scene');
out.getRoot().setDefaultScene(outScene);
const material = out
  .createMaterial('user_hidden_default')
  .setBaseColorFactor([0.72, 0.68, 0.64, 1])
  .setRoughnessFactor(0.6)
  .setMetallicFactor(0.05);
// Aluminiowa krawędź obwodowa skrzydła: materiał autorski pliku, celowo BEZ
// slotu publicznego (viewer zachowuje materiał, kolor stały jak ościeżnica).
const aluminum = out
  .createMaterial('aluminum_edge')
  .setBaseColorFactor([0.8, 0.82, 0.84, 1])
  .setRoughnessFactor(0.45)
  .setMetallicFactor(0.4);

function buildNode(name, compList, opts = {}) {
  if (!compList.length) return;
  // Geometria bez indeksów, z płaską normalną per trójkąt (styl CAD/STL);
  // bez normalnych MeshStandardMaterial renderuje się na czarno.
  const positions = [];
  const normals = [];
  for (const comp of compList) {
    for (const t of comp.tris) {
      const pts = [0, 1, 2].map((k) => {
        const v = vi(t, k);
        return mapPoint(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      });
      const u = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
      const w = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
      let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / len, n[1] / len, n[2] / len];
      if (opts.filter && !opts.filter(n)) continue;
      for (const p of pts) {
        positions.push(p[0], p[1], p[2]);
        normals.push(n[0], n[1], n[2]);
      }
    }
  }
  if (!positions.length) return;
  const posAccessor = out
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(positions))
    .setBuffer(buffer);
  const nrmAccessor = out
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(normals))
    .setBuffer(buffer);
  const prim = out
    .createPrimitive()
    .setAttribute('POSITION', posAccessor)
    .setAttribute('NORMAL', nrmAccessor)
    .setMaterial(opts.material ?? material);
  const mesh = out.createMesh(name).addPrimitive(prim);
  const node = out.createNode(name).setMesh(mesh);
  outScene.addChild(node);
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3)
    for (let ax = 0; ax < 3; ax++) {
      min[ax] = Math.min(min[ax], positions[i + ax]);
      max[ax] = Math.max(max[ax], positions[i + ax]);
    }
  console.log(
    `  węzeł "${name}": ${positions.length / 9} tri, X:[${min[0].toFixed(3)},${max[0].toFixed(3)}] Y:[${min[1].toFixed(3)},${max[1].toFixed(3)}] Z:[${min[2].toFixed(3)},${max[2].toFixed(3)}]`,
  );
}

// Lico płyty (normalne +-Z) osobno od krawędzi obwodowej: lico dostaje dekor
// klienta (slot leaf_side_a), krawędź jest aluminiowa jak ościeżnica.
buildNode('leaf', leafComps, { filter: (n) => Math.abs(n[2]) >= 0.7 });
buildNode('leaf_edge', leafComps, { filter: (n) => Math.abs(n[2]) < 0.7, material: aluminum });
// Osprzęt klamki z bryły STL pomijamy (nieczytelne klocki CAD) - zamiast
// niego doklejamy czyste klamki z licencjonowanego modelu basic-flat
// (te same, które renderują się poprawnie w drzwiach pełnych).
await attachHandlesFromBasicFlat();

/**
 * Kopiuje KOMPLETNE klamki z basic-flat.glb (drzwi pełne): dźwignia
 * (węzły 1/7) razem z rozetą (węzły 0/2). Obrót 180 stopni wokół pionowej
 * osi w płaszczyźnie środkowej płyty źródłowej: para przechodzi na
 * przeciwną stronę Z z zachowaniem złożenia (trzpień zostaje na rozecie),
 * a dźwignia wskazuje zawiasy po lewej. Materiał pliku jest bez znaczenia -
 * runtime nakłada materiał slotu handle.
 */
async function attachHandlesFromBasicFlat() {
  const flat = await io.read(join(ROOT, 'assets/source-models/basic-flat.glb'));
  const flatChildren = flat.getRoot().getDefaultScene().listChildren();
  const LEAF_FACE_Z = 0.035; // połowa grubości płyty klienta
  const STEM_TARGET_X = HOLE.x1 - 0.085; // oś trzpienia 85 mm od krawędzi zamkowej
  // para wewnętrzna (-z) po obrocie trafia na przód (+z) i odwrotnie
  const specs = [
    { leverIndex: 1, plateIndex: 0, name: 'handle_front', faceSign: +1 },
    { leverIndex: 7, plateIndex: 2, name: 'handle_back', faceSign: -1 },
  ];

  const nodeBbox = (node) => {
    const t = node.getTranslation();
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const a = pos.getMin([]);
      const b = pos.getMax([]);
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], a[k] + t[k]);
        max[k] = Math.max(max[k], b[k] + t[k]);
      }
    }
    return { min, max };
  };

  for (const spec of specs) {
    const lever = flatChildren[spec.leverIndex];
    const plate = flatChildren[spec.plateIndex];
    if (!lever?.getMesh() || !plate?.getMesh()) continue;
    // oś obrotu: środek rozety w X, płaszczyzna środkowa płyty (z=0)
    const plateBox = nodeBbox(plate);
    const axisX = (plateBox.min[0] + plateBox.max[0]) / 2;

    const positions = [];
    const normals = [];
    for (const node of [lever, plate]) {
      const t = node.getTranslation();
      for (const prim of node.getMesh().listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        const nrm = prim.getAttribute('NORMAL');
        const idx = prim.getIndices();
        if (!pos) continue;
        const PA = pos.getArray();
        const NA = nrm ? nrm.getArray() : null;
        const IA = idx ? idx.getArray() : null;
        const triCount = IA ? IA.length / 3 : pos.getCount() / 3;
        for (let tt = 0; tt < triCount; tt++) {
          for (let k = 0; k < 3; k++) {
            const v = IA ? IA[tt * 3 + k] : tt * 3 + k;
            // obrót 180 stopni wokół osi pionowej (axisX, z=0)
            const x = PA[v * 3] + t[0];
            const y = PA[v * 3 + 1] + t[1];
            const z = PA[v * 3 + 2] + t[2];
            positions.push(2 * axisX - x, y, -z);
            if (NA) normals.push(-NA[v * 3], NA[v * 3 + 1], -NA[v * 3 + 2]);
          }
        }
      }
    }
    // dosunięcie rozety do lica płyty klienta
    let zMin = Infinity;
    let zMax = -Infinity;
    for (let i = 2; i < positions.length; i += 3) {
      zMin = Math.min(zMin, positions[i]);
      zMax = Math.max(zMax, positions[i]);
    }
    const dz =
      spec.faceSign > 0 ? LEAF_FACE_Z - 0.001 - zMin : -LEAF_FACE_Z + 0.001 - zMax;
    const dx = STEM_TARGET_X - axisX;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += dx;
      positions[i + 2] += dz;
    }
    const posAccessor = out
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array(positions))
      .setBuffer(buffer);
    const prim = out.createPrimitive().setAttribute('POSITION', posAccessor).setMaterial(material);
    if (normals.length === positions.length) {
      const nrmAccessor = out
        .createAccessor()
        .setType('VEC3')
        .setArray(new Float32Array(normals))
        .setBuffer(buffer);
      prim.setAttribute('NORMAL', nrmAccessor);
    }
    const outMesh = out.createMesh(spec.name).addPrimitive(prim);
    outScene.addChild(out.createNode(spec.name).setMesh(outMesh));
    console.log(
      `  klamka "${spec.name}": ${positions.length / 9} tri (dźwignia+rozeta), oś x ${STEM_TARGET_X.toFixed(3)}, strona ${spec.faceSign > 0 ? '+z' : '-z'}`,
    );
  }
}

await out.transform(prune());
const glb = await io.writeBinary(out);
const { writeFileSync } = await import('node:fs');
writeFileSync(OUTPUT, glb);
console.log(`Zapisano ${OUTPUT} (${Math.round(glb.byteLength / 1024)} kB)`);
