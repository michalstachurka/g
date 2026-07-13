/**
 * Podział seedowych GLB (IArchway) na moduły: skrzydło i ościeżnica/zabudowa.
 * ADR-0004: wyłącznie przenoszenie istniejących węzłów - zero tworzenia geometrii.
 *
 * Wejście:  assets/source-models/*.glb
 * Wyjście:  assets/seed-modules/<model>.<modul>.glb + .manifest.json
 *
 * Anchory (hinge_axis, handle_center) są wyliczane z bboxów istniejących węzłów.
 * Pliki o szerokości 1.8 m z origin w środku są przesuwane o +0.9 m, aby każdy
 * moduł miał układ 0..szerokość (pivot: lewy dolny róg).
 */
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'assets/source-models');
const OUT = join(ROOT, 'assets/seed-modules');

/**
 * Interpretacja węzłów po inspekcji geometrii (docs/ASSET_REQUIREMENTS.md §1).
 * Indeksy odnoszą się do kolejności dzieci sceny w pliku źródłowym.
 */
const SPLITS = [
  {
    source: 'basic-flat.glb',
    modelKey: 'porta-lite-pelne',
    shiftX: 0,
    baseWidthMm: 900,
    baseHeightMm: 2100,
    scalePolicy: 'width_height',
    range: { minWidthMm: 700, maxWidthMm: 1000, minHeightMm: 1900, maxHeightMm: 2300 },
    modules: [
      {
        name: 'leaf',
        semanticRole: 'door_leaf',
        baseHingeSide: 'right',
        keep: [
          { index: 3, role: 'door_leaf' },
          { index: 1, role: 'handle_inside' },
          { index: 7, role: 'handle_outside' },
          { index: 0, role: 'lock_escutcheon' },
          { index: 2, role: 'lock_escutcheon' },
          { index: 5, role: 'hinges_public' },
          { index: 6, role: 'hinges_public' },
        ],
        anchors: { hinge_axis: [5, 6], handle_center: [1] },
        materialBindings: [
          { slotKey: 'leaf_side_a', appliesToRoles: ['door_leaf'], side: 'a' },
          { slotKey: 'handle', appliesToRoles: ['handle_inside', 'handle_outside', 'lock_escutcheon'] },
          { slotKey: 'hinges', appliesToRoles: ['hinges_public'] },
        ],
      },
      {
        name: 'frame',
        semanticRole: 'frame',
        keep: [{ index: 4, role: 'frame' }],
        anchors: {},
        materialBindings: [{ slotKey: 'frame_inside', appliesToRoles: ['frame'] }],
      },
    ],
  },
  {
    source: 'basic-glass.glb',
    modelKey: 'porta-lite-szklane',
    shiftX: 0,
    baseWidthMm: 900,
    baseHeightMm: 2100,
    scalePolicy: 'width_height',
    range: { minWidthMm: 700, maxWidthMm: 1000, minHeightMm: 1900, maxHeightMm: 2300 },
    modules: [
      {
        name: 'leaf',
        semanticRole: 'door_leaf',
        baseHingeSide: 'right',
        keep: [
          { index: 7, role: 'door_leaf' },
          { index: 0, role: 'handle_inside' },
          { index: 4, role: 'handle_outside' },
          { index: 2, role: 'hinges_public' },
          { index: 3, role: 'hinges_public' },
          { index: 5, role: 'glass' },
          { index: 6, role: 'glass' },
        ],
        anchors: { hinge_axis: [2, 3], handle_center: [0], glass_center: [5, 6] },
        materialBindings: [
          { slotKey: 'leaf_side_a', appliesToRoles: ['door_leaf'], side: 'a' },
          { slotKey: 'glass', appliesToRoles: ['glass'] },
          { slotKey: 'handle', appliesToRoles: ['handle_inside', 'handle_outside'] },
          { slotKey: 'hinges', appliesToRoles: ['hinges_public'] },
        ],
      },
      {
        name: 'frame',
        semanticRole: 'frame',
        keep: [{ index: 1, role: 'frame' }],
        anchors: {},
        materialBindings: [{ slotKey: 'frame_inside', appliesToRoles: ['frame'] }],
      },
    ],
  },
  {
    source: 'basic-apartment-solid.glb',
    modelKey: 'porta-loft-pelne',
    shiftX: 0,
    baseWidthMm: 900,
    baseHeightMm: 2100,
    scalePolicy: 'width_height',
    range: { minWidthMm: 700, maxWidthMm: 1000, minHeightMm: 1900, maxHeightMm: 2300 },
    modules: [
      {
        name: 'leaf',
        semanticRole: 'door_leaf',
        baseHingeSide: 'right',
        keep: [
          { index: 6, role: 'door_leaf' },
          { index: 0, role: 'handle_inside' },
          { index: 4, role: 'handle_outside' },
          { index: 2, role: 'hinges_public' },
          { index: 3, role: 'hinges_public' },
          { index: 5, role: 'decor_strip' },
        ],
        anchors: { hinge_axis: [2, 3], handle_center: [0] },
        materialBindings: [
          { slotKey: 'leaf_side_a', appliesToRoles: ['door_leaf'], side: 'a' },
          { slotKey: 'decor', appliesToRoles: ['decor_strip'] },
          { slotKey: 'handle', appliesToRoles: ['handle_inside', 'handle_outside'] },
          { slotKey: 'hinges', appliesToRoles: ['hinges_public'] },
        ],
      },
      {
        name: 'frame',
        semanticRole: 'frame',
        keep: [{ index: 1, role: 'frame' }],
        anchors: {},
        materialBindings: [{ slotKey: 'frame_inside', appliesToRoles: ['frame'] }],
      },
    ],
  },
  {
    source: 'basic-double.glb',
    modelKey: 'porta-duo-dwuskrzydlowe',
    shiftX: 0.9,
    baseWidthMm: 1800,
    baseHeightMm: 2100,
    scalePolicy: 'width_height',
    range: { minWidthMm: 1500, maxWidthMm: 2000, minHeightMm: 1900, maxHeightMm: 2300 },
    modules: [
      {
        name: 'leaf-active',
        semanticRole: 'active_leaf',
        baseHingeSide: 'right',
        keep: [
          { index: 5, role: 'active_leaf' },
          { index: 2, role: 'handle_inside' },
          { index: 3, role: 'handle_outside' },
          { index: 11, role: 'hinges_public' },
          { index: 12, role: 'hinges_public' },
          { index: 4, role: 'decor_strip' },
        ],
        anchors: { hinge_axis: [11, 12], handle_center: [2] },
        materialBindings: [
          { slotKey: 'leaf_side_a', appliesToRoles: ['active_leaf'], side: 'a' },
          { slotKey: 'decor', appliesToRoles: ['decor_strip'] },
          { slotKey: 'handle', appliesToRoles: ['handle_inside', 'handle_outside'] },
          { slotKey: 'hinges', appliesToRoles: ['hinges_public'] },
        ],
      },
      {
        name: 'leaf-passive',
        semanticRole: 'passive_leaf',
        baseHingeSide: 'left',
        keep: [
          { index: 7, role: 'passive_leaf' },
          { index: 0, role: 'handle_inside' },
          { index: 1, role: 'handle_outside' },
          { index: 8, role: 'hinges_public' },
          { index: 9, role: 'hinges_public' },
          { index: 6, role: 'decor_strip' },
        ],
        anchors: { hinge_axis: [8, 9], handle_center: [0] },
        materialBindings: [
          { slotKey: 'leaf_side_a', appliesToRoles: ['passive_leaf'], side: 'a' },
          { slotKey: 'decor', appliesToRoles: ['decor_strip'] },
          { slotKey: 'handle', appliesToRoles: ['handle_inside', 'handle_outside'] },
          { slotKey: 'hinges', appliesToRoles: ['hinges_public'] },
        ],
      },
      {
        name: 'frame',
        semanticRole: 'frame',
        keep: [{ index: 10, role: 'frame' }],
        anchors: {},
        materialBindings: [{ slotKey: 'frame_inside', appliesToRoles: ['frame'] }],
      },
    ],
  },
  {
    source: 'basic-hidden.glb',
    modelKey: 'porta-invisible-ukryte',
    // Viewer, kamera i ściana demo zakładają kompozycję w przedziale
    // 0..baseWidth. Skrzydło (0.87 m) centrujemy na 0.45 m, a panel ściany
    // przycinamy do otworu 0..0.9 m + reveal. Płaszczyzna lustra DIN = 450 mm,
    // więc kompozycja odbija się sama na siebie (stabilny widok przy zmianie DIN).
    shiftX: 0,
    centerLeafAtM: 0.45,
    baseWidthMm: 900,
    baseHeightMm: 2100,
    scalePolicy: 'variant_only',
    // Zestaw o stałym wymiarze - geometria nie skaluje się do wymiaru,
    // więc dopuszczamy wyłącznie rozmiar bazowy.
    range: { minWidthMm: 900, maxWidthMm: 900, minHeightMm: 2100, maxHeightMm: 2100 },
    modules: [
      {
        name: 'leaf',
        // Model klienta (patrz scripts/convert-user-hidden.mjs): skrzydło
        // z klamkami obustronnie. BEZ modułu ściany: ścianę wokół otworu
        // i cienką ciemną ramkę rysuje scena viewera (własny panel ściany
        // dublował ścianę sceny i wyglądał jak zbyt szeroka ościeżnica).
        source: 'hidden-user.glb',
        semanticRole: 'door_leaf',
        baseHingeSide: 'left',
        // Sama płyta, bez osprzętu klamki z modelu źródłowego (surowa bryła
        // CAD renderowała się jako nieczytelne klocki) - drzwi ukryte
        // działają jako push-to-open.
        keep: [{ index: 0, role: 'door_leaf' }],
        anchors: { hinge_axis: 'leaf_left_edge' },
        materialBindings: [
          { slotKey: 'leaf_side_a', appliesToRoles: ['door_leaf'], side: 'a' },
        ],
      },
    ],
  },
  {
    source: 'basic-frame.glb',
    modelKey: 'porta-vista-naswietle',
    shiftX: 0,
    centerLeafAtM: 0.45,
    baseWidthMm: 900,
    baseHeightMm: 2100,
    scalePolicy: 'variant_only',
    range: { minWidthMm: 900, maxWidthMm: 900, minHeightMm: 2100, maxHeightMm: 2100 },
    modules: [
      {
        name: 'leaf',
        semanticRole: 'door_leaf',
        baseHingeSide: 'right',
        keep: [
          { index: 0, role: 'leaf_side_a' },
          { index: 1, role: 'leaf_side_b' },
          { index: 2, role: 'handle_inside' },
          { index: 3, role: 'handle_outside' },
        ],
        anchors: { handle_center: [2], hinge_axis: 'leaf_right_edge' },
        materialBindings: [
          { slotKey: 'leaf_side_a', appliesToRoles: ['leaf_side_a'], side: 'a' },
          { slotKey: 'leaf_side_b', appliesToRoles: ['leaf_side_b'], side: 'b' },
          { slotKey: 'handle', appliesToRoles: ['handle_inside', 'handle_outside'] },
        ],
      },
      {
        name: 'wall',
        semanticRole: 'frame',
        trimToOpeningRevealMm: 150,
        keep: [
          { index: 5, role: 'wall_panel' },
          { index: 4, role: 'toplight' },
        ],
        anchors: {},
        materialBindings: [
          { slotKey: 'wall_panel', appliesToRoles: ['wall_panel'] },
          { slotKey: 'glass', appliesToRoles: ['toplight'] },
        ],
      },
    ],
  },
];

/** Zakres X (świat, z przesunięciem) skrzydła danego modelu - do centrowania ściany. */
function leafXRange(split, bboxes) {
  const leafRoles = new Set(['door_leaf', 'leaf_side_a', 'leaf_side_b', 'active_leaf']);
  const leafMod = split.modules.find((m) => ['door_leaf', 'active_leaf'].includes(m.semanticRole));
  let min = Infinity;
  let max = -Infinity;
  for (const k of leafMod.keep) {
    if (!leafRoles.has(k.role)) continue;
    const bb = bboxes[k.index];
    min = Math.min(min, bb.min[0]);
    max = Math.max(max, bb.max[0]);
  }
  return [min, max];
}

/**
 * Przycięcie marginesów panelu ściany w X BEZ ruszania otworu drzwiowego:
 * wierzchołki na lewo od otworu są liniowo ściągane do [targetLo, holeLo],
 * na prawo - do [holeHi, targetHi]; wierzchołki otworu zostają 1:1.
 * (Skalowanie całego węzła przesuwałoby i zwężało otwór razem z panelem -
 * skrzydło przestawało pasować do otworu.)
 */
function trimNodeMarginsX(node, holeLoL, holeHiL, targetLoL, targetHiL, doneAccessors) {
  const mesh = node.getMesh();
  if (!mesh) return;
  const EPS = 1e-6;
  let lo = Infinity;
  let hi = -Infinity;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    lo = Math.min(lo, pos.getMin([])[0]);
    hi = Math.max(hi, pos.getMax([])[0]);
  }
  const leftFactor = holeLoL - lo > EPS ? (holeLoL - targetLoL) / (holeLoL - lo) : 0;
  const rightFactor = hi - holeHiL > EPS ? (targetHiL - holeHiL) / (hi - holeHiL) : 0;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos || doneAccessors.has(pos)) continue;
    doneAccessors.add(pos);
    const arr = pos.getArray().slice();
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i];
      if (leftFactor > 0 && x < holeLoL - EPS) {
        arr[i] = holeLoL - (holeLoL - x) * leftFactor;
      } else if (rightFactor > 0 && x > holeHiL + EPS) {
        arr[i] = holeHiL + (x - holeHiL) * rightFactor;
      }
    }
    pos.setArray(arr);
  }
}

function nodeWorldBbox(node, shiftX) {
  const mesh = node.getMesh();
  if (!mesh) return null;
  const t = node.getTranslation();
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const pMin = pos.getMin([]);
    const pMax = pos.getMax([]);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], pMin[i] + t[i] + (i === 0 ? shiftX : 0));
      max[i] = Math.max(max[i], pMax[i] + t[i] + (i === 0 ? shiftX : 0));
    }
  }
  return { min, max, center: min.map((v, i) => (v + max[i]) / 2) };
}

const io = new NodeIO();
mkdirSync(OUT, { recursive: true });
// Czyścimy stare wyjście - moduły usunięte z konfiguracji nie mogą zostawać
// na dysku (seed wgrywa wszystkie pliki *.glb z tego katalogu).
for (const f of readdirSync(OUT)) {
  if (f.endsWith('.glb') || f.endsWith('.json')) rmSync(join(OUT, f));
}
const manifestIndex = [];

for (const split of SPLITS) {
  // Moduł może mieć własny plik źródłowy (np. skrzydło od klienta + ściana
  // z modelu katalogowego).
  const sourceOf = (moduleDef) => join(SRC, moduleDef.source ?? split.source);
  const leafModule = split.modules.find((m) =>
    ['door_leaf', 'active_leaf'].includes(m.semanticRole),
  );

  // Przesunięcie skrzydła: stałe (shiftX) albo automatyczne centrowanie
  // na baseWidth/2, aby kompozycja zajmowała przedział 0..baseWidth.
  let leafShiftX = split.shiftX;
  let leafFinal = null;
  if (split.centerLeafAtM != null) {
    const probe = await io.read(sourceOf(leafModule));
    const probeBoxes = probe.getRoot().getDefaultScene().listChildren().map((n) => nodeWorldBbox(n, 0));
    const [lmin, lmax] = leafXRange(split, probeBoxes);
    leafShiftX = split.centerLeafAtM - (lmin + lmax) / 2;
    leafFinal = [lmin + leafShiftX, lmax + leafShiftX];
    console.log(
      `  ${split.modelKey}: skrzydło [${lmin.toFixed(3)}, ${lmax.toFixed(3)}] -> shiftX ${leafShiftX.toFixed(3)} (finalnie [${leafFinal[0].toFixed(3)}, ${leafFinal[1].toFixed(3)}])`,
    );
  }

  for (const moduleDef of split.modules) {
    const document = await io.read(sourceOf(moduleDef));
    const scene = document.getRoot().getDefaultScene();
    const children = scene.listChildren();

    // Przesunięcie modułu: domyślnie jak skrzydło; moduł z alignHoleToLeaf
    // (otwór w innym pliku niż skrzydło) dosuwa otwór do finalnej pozycji
    // skrzydła.
    let shiftX = leafShiftX;
    let holeWorld = null;
    if (moduleDef.alignHoleToLeaf) {
      const rawBoxes = children.map((n) => nodeWorldBbox(n, 0));
      let holeLo = Infinity;
      let holeHi = -Infinity;
      for (const idx of moduleDef.alignHoleToLeaf) {
        holeLo = Math.min(holeLo, rawBoxes[idx].min[0]);
        holeHi = Math.max(holeHi, rawBoxes[idx].max[0]);
      }
      shiftX = leafFinal[0] - holeLo;
      holeWorld = [leafFinal[0], leafFinal[0] + (holeHi - holeLo)];
    }

    // bboxy WSZYSTKICH węzłów źródłowych (do anchorów), z przesunięciem.
    const bboxes = children.map((n) => nodeWorldBbox(n, shiftX));

    const keepIndices = new Set(moduleDef.keep.map((k) => k.index));
    const keptNodes = [];
    children.forEach((node, index) => {
      if (!keepIndices.has(index)) {
        node.dispose();
        return;
      }
      if (shiftX !== 0) {
        const t = node.getTranslation();
        node.setTranslation([t[0] + shiftX, t[1], t[2]]);
      }
      keptNodes.push(node);
    });

    // Przycięcie panelu ściany do otworu 0..baseWidth + reveal (drzwi
    // ukryte/naświetle) - otwór drzwiowy zostaje 1:1 pod skrzydłem.
    if (moduleDef.trimToOpeningRevealMm != null) {
      const [holeLo, holeHi] = holeWorld ?? leafXRange(split, bboxes);
      const reveal = moduleDef.trimToOpeningRevealMm / 1000;
      const targetLo = 0 - reveal;
      const targetHi = split.baseWidthMm / 1000 + reveal;
      const doneAccessors = new Set();
      for (const node of keptNodes) {
        const t = node.getTranslation();
        trimNodeMarginsX(node, holeLo - t[0], holeHi - t[0], targetLo - t[0], targetHi - t[0], doneAccessors);
      }
      console.log(
        `  trim ${split.modelKey}.${moduleDef.name}: otwór [${holeLo.toFixed(3)}, ${holeHi.toFixed(3)}] -> panel [${targetLo.toFixed(3)}, ${targetHi.toFixed(3)}]`,
      );
    }
    await document.transform(prune());

    // nodePath = indeks w NOWEJ scenie; kolejność zachowana względem `keep`.
    const kept = [...keepIndices].sort((a, b) => a - b);
    const nodeBindings = moduleDef.keep.map((k) => ({
      role: k.role,
      nodePath: String(kept.indexOf(k.index)),
      nodeName: null,
      mirrorable: true,
    }));

    const anchorBindings = [];
    for (const [anchor, sourceIndices] of Object.entries(moduleDef.anchors)) {
      let center;
      if (sourceIndices === 'leaf_right_edge' || sourceIndices === 'leaf_left_edge') {
        const leafIdx = moduleDef.keep.find((k) => k.role === 'door_leaf' || k.role === 'leaf_side_a').index;
        const bb = bboxes[leafIdx];
        center = [sourceIndices === 'leaf_left_edge' ? bb.min[0] : bb.max[0], 0, 0];
      } else {
        const points = sourceIndices.map((i) => bboxes[i].center);
        center = [0, 1, 2].map((axis) => points.reduce((s, p) => s + p[axis], 0) / points.length);
      }
      anchorBindings.push({
        anchor,
        positionMm: center.map((v) => Math.round(v * 1000)),
        normalized: false,
      });
    }

    const fileName = `${split.modelKey}.${moduleDef.name}.glb`;
    const glb = await io.writeBinary(document);
    writeFileSync(join(OUT, fileName), glb);
    const checksum = createHash('sha256').update(glb).digest('hex');

    const manifest = {
      manifestVersion: '1',
      assetKey: `${split.modelKey}.${moduleDef.name}`,
      assetVersion: 1,
      semanticRole: moduleDef.semanticRole,
      variantKey: null,
      baseWidthMm: split.baseWidthMm,
      baseHeightMm: split.baseHeightMm,
      baseDepthMm: 115,
      units: 'meters',
      upAxis: 'y',
      forwardAxis: '-z',
      mountingPlane: 'wall',
      pivotPolicy: 'bottom_left_front',
      scalePolicy: moduleDef.semanticRole === 'frame' && split.scalePolicy === 'width_height'
        ? 'width_height'
        : split.scalePolicy,
      allowedDimensionRange: split.range,
      mirrorPolicy: 'allow',
      ...(moduleDef.baseHingeSide ? { baseHingeSide: moduleDef.baseHingeSide } : {}),
      nodeBindings,
      materialBindings: moduleDef.materialBindings,
      anchorBindings,
      animationBindings: [],
      compression: 'none',
      checksum: `sha256:${checksum}`,
    };
    writeFileSync(join(OUT, `${fileName}.manifest.json`), JSON.stringify(manifest, null, 2));
    manifestIndex.push({
      modelKey: split.modelKey,
      module: moduleDef.name,
      slot: moduleDef.semanticRole,
      file: fileName,
      source: split.source,
      byteSize: glb.byteLength,
    });
    console.log(`OK ${fileName} (${Math.round(glb.byteLength / 1024)} kB, ${nodeBindings.length} ról)`);
  }
}

const sources = JSON.parse(readFileSync(join(SRC, 'door-model-sources.json'), 'utf8'));
writeFileSync(
  join(OUT, 'index.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), modules: manifestIndex, sources }, null, 2),
);
console.log(`\nZapisano ${manifestIndex.length} modułów do ${OUT}/`);
