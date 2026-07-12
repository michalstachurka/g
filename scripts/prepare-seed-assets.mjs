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
import { mkdirSync, writeFileSync } from 'node:fs';
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
    shiftX: 0.9,
    baseWidthMm: 1800,
    baseHeightMm: 2100,
    scalePolicy: 'variant_only',
    range: { minWidthMm: 1800, maxWidthMm: 1800, minHeightMm: 2100, maxHeightMm: 2100 },
    modules: [
      {
        name: 'leaf',
        semanticRole: 'door_leaf',
        baseHingeSide: 'right',
        keep: [
          { index: 3, role: 'leaf_side_a' },
          { index: 2, role: 'leaf_side_b' },
          { index: 0, role: 'handle_inside' },
          { index: 1, role: 'handle_outside' },
        ],
        anchors: { handle_center: [0], hinge_axis: 'leaf_right_edge' },
        materialBindings: [
          { slotKey: 'leaf_side_a', appliesToRoles: ['leaf_side_a'], side: 'a' },
          { slotKey: 'leaf_side_b', appliesToRoles: ['leaf_side_b'], side: 'b' },
          { slotKey: 'handle', appliesToRoles: ['handle_inside', 'handle_outside'] },
        ],
      },
      {
        name: 'wall',
        semanticRole: 'frame',
        keep: [{ index: 4, role: 'wall_panel' }],
        anchors: {},
        materialBindings: [{ slotKey: 'wall_panel', appliesToRoles: ['wall_panel'] }],
      },
    ],
  },
  {
    source: 'basic-frame.glb',
    modelKey: 'porta-vista-naswietle',
    shiftX: 0.9,
    baseWidthMm: 1800,
    baseHeightMm: 2100,
    scalePolicy: 'variant_only',
    range: { minWidthMm: 1800, maxWidthMm: 1800, minHeightMm: 2100, maxHeightMm: 2100 },
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
const manifestIndex = [];

for (const split of SPLITS) {
  const srcPath = join(SRC, split.source);
  for (const moduleDef of split.modules) {
    const document = await io.read(srcPath);
    const scene = document.getRoot().getDefaultScene();
    const children = scene.listChildren();

    // bboxy WSZYSTKICH węzłów źródłowych (do anchorów), z przesunięciem.
    const bboxes = children.map((n) => nodeWorldBbox(n, split.shiftX));

    const keepIndices = new Set(moduleDef.keep.map((k) => k.index));
    children.forEach((node, index) => {
      if (!keepIndices.has(index)) {
        node.dispose();
      } else if (split.shiftX !== 0) {
        const t = node.getTranslation();
        node.setTranslation([t[0] + split.shiftX, t[1], t[2]]);
      }
    });
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
      if (sourceIndices === 'leaf_right_edge') {
        const leafIdx = moduleDef.keep.find((k) => k.role === 'door_leaf' || k.role === 'leaf_side_a').index;
        const bb = bboxes[leafIdx];
        center = [bb.max[0], 0, 0];
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
