import { Document, Material, NodeIO, type Node as GltfNode } from '@gltf-transform/core';
import { mergeDocuments, prune, transformPrimitive, unpartition } from '@gltf-transform/functions';
import type { AssetManifest, PublicMaterialDef, RenderSpec } from '@door/contracts';
import { MM_TO_M } from '@door/contracts';

/**
 * Składanie wynikowego publicznego GLB dla AR - z DOKŁADNIE tych samych
 * modułów, transformacji i widoczności, które opisuje zapisany renderSpec
 * (semantyka identyczna z viewerem, patrz DOMAIN_MODEL §6 i three-viewer).
 *
 * Dozwolone operacje: składanie, skalowanie, pozycjonowanie, odbicie
 * (bake do geometrii z odwróceniem windingu przez transformPrimitive),
 * podmiana materiałów publicznych i konwersja formatu. Zero nowej geometrii.
 */

export interface AssembleInput {
  renderSpec: RenderSpec;
  manifests: Record<string, AssetManifest>;
  files: Record<string, Uint8Array>;
  materials: PublicMaterialDef[];
}

type Mat4 = number[];

const translation = (x: number, y: number, z: number): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const scaleM = (x: number, y: number, z: number): Mat4 => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
const rotY180 = (): Mat4 => [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];

function mul(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++) out[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
  return out;
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function hexToLinearRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

function buildMaterial(doc: Document, def: PublicMaterialDef): Material {
  const [r, g, b] = hexToLinearRgb(def.baseColorHex);
  const material = doc
    .createMaterial(def.key)
    .setBaseColorFactor([r, g, b, def.transmission > 0 ? Math.max(0.28, 1 - def.transmission) : def.opacity])
    .setRoughnessFactor(def.roughness)
    .setMetallicFactor(def.metalness)
    .setDoubleSided(true);
  // Szkło: alpha blend zamiast transmission - stabilne w Scene Viewer i Quick Look.
  if (def.transmission > 0 || def.opacity < 1) material.setAlphaMode('BLEND');
  return material;
}

function resolveNodePath(sceneChildren: GltfNode[], path: string): GltfNode | null {
  const segments = path.split('/').map(Number);
  let current: GltfNode | undefined = sceneChildren[segments[0]];
  for (const index of segments.slice(1)) {
    if (!current) return null;
    current = current.listChildren()[index];
  }
  return current ?? null;
}

export async function assembleGlb(input: AssembleInput): Promise<Uint8Array> {
  const io = new NodeIO();
  const output = new Document();
  output.getRoot().getAsset().generator = 'door-configurator-worker';
  const outputScene = output.createScene('door');
  output.getRoot().setDefaultScene(outputScene);

  const materialByKey = new Map(input.materials.map((def) => [def.key, def]));
  const spec = input.renderSpec;

  for (const module of spec.modules) {
    if (!module.visible) continue;
    const manifest = input.manifests[module.publicAssetId];
    const bytes = input.files[module.publicAssetId];
    if (!manifest || !bytes) {
      throw new Error(`Brak manifestu albo pliku dla assetu ${module.publicAssetId}`);
    }

    const moduleDoc = await io.readBinary(bytes);
    const moduleScene = moduleDoc.getRoot().getDefaultScene() ?? moduleDoc.getRoot().listScenes()[0];
    const children = moduleScene.listChildren();

    const posM = module.transform.positionMm.map((v) => v * MM_TO_M) as [number, number, number];
    const scale = module.transform.scale;
    const mirrorPlaneX = (manifest.baseWidthMm * scale[0] * MM_TO_M) / 2;
    // M_module = T(pos) * Mirror(plane)
    let moduleMatrix = translation(posM[0], posM[1], posM[2]);
    if (module.mirrored) {
      const mirror = mul(mul(translation(mirrorPlaneX, 0, 0), scaleM(-1, 1, 1)), translation(-mirrorPlaneX, 0, 0));
      moduleMatrix = mul(moduleMatrix, mirror);
    }

    // Mapowanie ról na węzły wg manifestu (przed modyfikacjami).
    const resolved = manifest.nodeBindings.map((binding) => ({
      binding,
      node: resolveNodePath(children, binding.nodePath),
      part: module.parts.find((p) => p.role === binding.role),
    }));

    for (const { binding, node, part } of resolved) {
      if (!node) continue;
      const visible = part ? part.visible : true;
      if (!visible) {
        node.dispose();
        continue;
      }
      const fixedOffset = part?.positionMm ?? null;
      const partMatrix = fixedOffset
        ? mul(moduleMatrix, translation(fixedOffset[0] * MM_TO_M, fixedOffset[1] * MM_TO_M, fixedOffset[2] * MM_TO_M))
        : mul(moduleMatrix, scaleM(scale[0], scale[1], scale[2]));
      const nodeT = node.getTranslation();
      const finalMatrix = mul(partMatrix, translation(nodeT[0], nodeT[1], nodeT[2]));

      const mesh = node.getMesh();
      if (mesh) {
        for (const prim of mesh.listPrimitives()) {
          transformPrimitive(prim, finalMatrix as unknown as import('@gltf-transform/core').mat4);
          const slotBinding = manifest.materialBindings.find((b) => b.appliesToRoles.includes(binding.role));
          const materialKey = slotBinding ? spec.publicMaterials[slotBinding.slotKey] : undefined;
          const def =
            (materialKey ? materialByKey.get(materialKey) : undefined) ??
            ({ key: 'neutral', name: 'Neutralny', kind: 'color', baseColorHex: '#c8c5bf', roughness: 0.75, metalness: 0, opacity: 1, transmission: 0, clearcoat: 0 } as PublicMaterialDef);
          prim.setMaterial(buildMaterial(moduleDoc, def));
        }
      }
      node.setTranslation([0, 0, 0]);
      node.setScale([1, 1, 1]);
    }

    // Węzły bez mapowania nie wchodzą do modelu publicznego.
    for (const child of children) {
      const mapped = resolved.some((r) => r.node === child && (r.part ? r.part.visible : true));
      if (!mapped) child.dispose();
    }

    const map = mergeDocuments(output, moduleDoc);
    const mergedScene = map.get(moduleScene) as typeof moduleScene | undefined;
    if (mergedScene) {
      for (const child of [...mergedScene.listChildren()]) outputScene.addChild(child);
      mergedScene.dispose();
    }
  }

  // Obrót 180 stopni wokół osi pionowej w środku szerokości: front modelu w +Z
  // (konwencja ustawienia na ścianie w podglądach AR), pivot przy podłodze.
  const centerX = (spec.widthMm / 2) * MM_TO_M;
  const flip = mul(mul(translation(centerX, 0, 0), rotY180()), translation(-centerX, 0, 0));
  for (const child of outputScene.listChildren()) {
    const mesh = child.getMesh();
    if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) {
      transformPrimitive(prim, flip as unknown as import('@gltf-transform/core').mat4);
    }
  }

  // GLB dopuszcza jeden bufor - scalenie buforów po mergeDocuments.
  await output.transform(prune(), unpartition());
  return io.writeBinary(output);
}
