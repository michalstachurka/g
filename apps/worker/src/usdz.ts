/**
 * Konwersja GLB -> USDZ w Node przy pomocy eksportera z three (ADR-0003).
 * Modele publiczne są bezteksturowe (materiały parametryczne), więc eksport
 * nie wymaga canvas. Błąd konwersji nie blokuje GLB - strona AR używa wtedy
 * konwersji klienckiej model-viewer na iOS.
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';

export async function glbToUsdz(glb: Uint8Array): Promise<Uint8Array> {
  const loader = new GLTFLoader();
  const buffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
  const gltf = await loader.parseAsync(buffer, '');
  const exporter = new USDZExporter();
  const result = await exporter.parseAsync(gltf.scene);
  return result instanceof Uint8Array ? result : new Uint8Array(result as ArrayBuffer);
}
