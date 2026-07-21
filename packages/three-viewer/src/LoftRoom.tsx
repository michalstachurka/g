'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useLoader } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { buildPbrMaterial, type PbrTextureSet } from './pbr';
import type { LoftVariant } from './loft-variants';

/**
 * Otwarta scena ekspozycyjna drzwi (bez zamkniętego pomieszczenia):
 * ściana z DEMONSTRACYJNYMI drzwiami ukrytymi + podłoga + sufit. Kamera ma
 * pełną swobodę jak w standardowym konfiguratorze - nic jej nie ogranicza
 * poza limitami OrbitControls ustawianymi na stronie.
 *
 * Dekoracje (GLB, CC0 Poly Haven): popiersie na postumencie, kwiat doniczkowy
 * i loftowa lampa wisząca - wszystkie obok drzwi.
 *
 * Geometria budowana raz dla danych wymiarów; zmiana wariantu/koloru podmienia
 * wyłącznie materiały (i zwalnia poprzednie). Kamera nie jest resetowana.
 *
 * ── REGULACJA ────────────────────────────────────────────────────────────────
 *   props room/wallColor - wymiary ściany i kolor mikrocementu (UI strony),
 *   LOFT_ROOM_DEFAULTS   - domyślne wymiary + zakresy suwaków,
 *   STAGE                - głębokość podłogi/sufitu i grubości płyt,
 *   DOOR                 - otwór drzwi (wyśrodkowany na ścianie),
 *   DECOR                - odsunięcia rzeźby/kwiatka/lampy od krawędzi drzwi,
 *   *_TILE               - skala (powtarzanie) tekstur w metrach na kafel,
 *   światła              - JSX na dole (KeyLight + hemisphere + fill),
 *                          moc/temperatura: sunIntensity/sunColor wariantu.
 */

// ── Wymiary (metry) ──────────────────────────────────────────────────────────
export const LOFT_ROOM_DEFAULTS = {
  w: 5.4, h: 2.95, d: 5.2,
  minW: 4.2, maxW: 7.2, minH: 2.5, maxH: 3.4,
};
const STAGE = { wall: 0.2, floorT: 0.3, ceilT: 0.22, floorD: 3.8, ceilD: 2.9, back: 0.6 };
const DOOR = { w: 0.9, h: 2.1, niche: 0.26, gap: 0.005, leafT: 0.045 };
const DECOR = { sculpt: 0.78, plant: 0.62, lamp: 1.05 }; // odstęp od krawędzi otworu

// metry świata na jeden kafel tekstury (mniejsze = drobniejszy wzór)
const WALL_TILE = 1.7; // mikrocement ściana
const FLOOR_TILE = 2.2; // podłoga - inna skala niż ściana
const CEIL_TILE = 2.6;
const WOOD_TILE = 1.6;

type UvAxis = 0 | 1 | 2;

/** Rzutowanie UV wg pozycji świata (ciągłość między bryłami) + uv1 dla AO. */
function projectUv(geo: THREE.BufferGeometry, offset: THREE.Vector3, u: UvAxis, v: UvAxis, tile: number) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const o = [offset.x, offset.y, offset.z];
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    uv[i * 2] = (p[u] + o[u]) / tile;
    uv[i * 2 + 1] = (p[v] + o[v]) / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** UV z lokalnych osi płaszczyzny (ościeża) - bez rozciągnięć na wąskich licach. */
function planeUv(geo: THREE.BufferGeometry, tile: number) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / tile;
    uv[i * 2 + 1] = pos.getY(i) / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
  return geo;
}

interface Slots {
  wall: THREE.Mesh[];
  floor: THREE.Mesh[];
  ceil: THREE.Mesh[];
  niche: THREE.Mesh[];
  door: THREE.Mesh[];
}

/** Miękki radialny cień kontaktowy (blob). */
function makeBlobTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Liniowy gradient cienia (krawędzie drzwi, spód). Ciemny przy y=0, zanik do y=1. */
function makeEdgeShadowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

/** Dekoracja z GLB: skalowana do zadanej wysokości, kotwiczona podstawą lub górą. */
function GltfDecor({
  url, x, z, y = 0, height, rotY = 0, anchor = 'floor',
}: {
  url: string; x: number; z: number; y?: number; height: number; rotY?: number; anchor?: 'floor' | 'top';
}) {
  const gltf = useLoader(GLTFLoader, url);
  const obj = useMemo(() => {
    const s = gltf.scene.clone(true);
    s.rotation.y = rotY;
    let bb = new THREE.Box3().setFromObject(s);
    const size = bb.getSize(new THREE.Vector3());
    s.scale.setScalar(height / Math.max(size.y, 1e-4));
    bb = new THREE.Box3().setFromObject(s);
    const c = bb.getCenter(new THREE.Vector3());
    const yOff = anchor === 'floor' ? y - bb.min.y : y - bb.max.y;
    s.position.set(x - c.x, yOff, z - c.z);
    s.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });
    return s;
  }, [gltf, x, z, y, height, rotY, anchor]);
  return <primitive object={obj} />;
}

export interface LoftRoomProps {
  variant: LoftVariant;
  texturesBase?: string;
  modelsBase?: string;
  /** Wymiary ściany (m); brak pola = wartość z LOFT_ROOM_DEFAULTS. */
  room?: { w?: number; h?: number; d?: number };
  /** Nadpisanie koloru ścian z mikrocementu (tint; undefined = kolor wariantu). */
  wallColor?: string;
}

export function LoftRoom({
  variant,
  texturesBase = '/textures',
  modelsBase = '/models',
  room,
  wallColor,
}: LoftRoomProps) {
  const W = THREE.MathUtils.clamp(room?.w ?? LOFT_ROOM_DEFAULTS.w, LOFT_ROOM_DEFAULTS.minW, LOFT_ROOM_DEFAULTS.maxW);
  const H = THREE.MathUtils.clamp(room?.h ?? LOFT_ROOM_DEFAULTS.h, LOFT_ROOM_DEFAULTS.minH, LOFT_ROOM_DEFAULTS.maxH);
  // drzwi wyśrodkowane; dekoracje odsunięte od krawędzi otworu
  const dx0 = (W - DOOR.w) / 2;
  const dx1 = dx0 + DOOR.w;
  const sculptX = dx0 - DECOR.sculpt;
  const plantX = dx1 + DECOR.plant;
  const lampX = Math.min(dx1 + DECOR.lamp, W - 0.35);

  const tex = useLoader(THREE.TextureLoader, [
    `${texturesBase}/microcement/color.jpg`,
    `${texturesBase}/microcement/normal.jpg`,
    `${texturesBase}/microcement/roughness.jpg`,
    `${texturesBase}/microcement/ao.jpg`,
    `${texturesBase}/wood/color.jpg`,
    `${texturesBase}/wood/bump.jpg`,
    `${texturesBase}/wood/roughness.jpg`,
  ]);
  const [mC, mN, mR, mAo, wC, wB, wR] = tex;
  const microSet: PbrTextureSet = { color: mC, normal: mN, roughness: mR, ao: mAo };
  const woodSet: PbrTextureSet = { color: wC, bump: wB, roughness: wR };

  // ── GEOMETRIA + materiały stałe (raz na wymiary) ──────────────────────────
  const built = useMemo(() => {
    const group = new THREE.Group();
    const dispose: { dispose: () => void }[] = [];
    const slots: Slots = { wall: [], floor: [], ceil: [], niche: [], door: [] };
    const T = STAGE.wall;
    const { w: dw, h: dh, niche: nd, gap, leafT } = DOOR;
    const dxc = dx0 + dw / 2;

    const track = <G extends THREE.BufferGeometry>(g: G) => (dispose.push(g), g);
    const box = (w: number, h: number, d: number, r = 0) =>
      track(r > 0 ? (new RoundedBoxGeometry(w, h, d, 2, r) as THREE.BufferGeometry) : new THREE.BoxGeometry(w, h, d));

    // materiały stałe - grafit/antracyt zamiast czerni, współdzielone
    const steel = new THREE.MeshStandardMaterial({ color: '#35383d', roughness: 0.55, metalness: 0.75, envMapIntensity: 0.85 });
    const alu = new THREE.MeshStandardMaterial({ color: '#a6abb0', roughness: 0.3, metalness: 0.85, envMapIntensity: 1.1 });
    const skirt = new THREE.MeshStandardMaterial({ color: '#26272a', roughness: 0.85, metalness: 0.2 });
    // wypełnienie szczeliny drzwiowej: ciemne, ale nie czarne (czytelny obrys)
    const slotDark = new THREE.MeshStandardMaterial({ color: '#17181b', roughness: 0.92, metalness: 0.1 });
    const stone = new THREE.MeshStandardMaterial({ color: '#d6d1c6', roughness: 0.75, metalness: 0 });
    const stoneNormal = mN.clone();
    stoneNormal.wrapS = stoneNormal.wrapT = THREE.RepeatWrapping;
    stoneNormal.repeat.set(0.6, 0.6);
    stoneNormal.colorSpace = THREE.NoColorSpace;
    stone.normalMap = stoneNormal;
    stone.normalScale.set(0.25, 0.25);
    const blobMat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, opacity: 0.35, depthWrite: false, color: '#000000' });
    const edgeShadowMat = new THREE.MeshBasicMaterial({ map: makeEdgeShadowTexture(), transparent: true, opacity: 0.22, depthWrite: false, color: '#000000' });
    dispose.push(steel, alu, skirt, slotDark, stone, stoneNormal, blobMat, blobMat.map!, edgeShadowMat, edgeShadowMat.map!);

    const mesh = (
      geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number],
      rot?: [number, number, number], cast = true, receive = true,
    ) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      if (rot) m.rotation.set(...rot);
      m.castShadow = cast;
      m.receiveShadow = receive;
      group.add(m);
      return m;
    };
    const slot = (arr: THREE.Mesh[], geo: THREE.BufferGeometry, pos: [number, number, number], rot?: [number, number, number]) => {
      const m = mesh(geo, steel, pos, rot);
      arr.push(m);
      return m;
    };

    // ── PODŁOGA i SUFIT (płyty z grubością, wystają przed ścianę) ───────────
    // Płyty NIE rzucają cienia - światło główne pada znad sufitu i cień
    // płyty zaciemniałby całą ścianę (scena jest otwarta, nie pomieszczenie).
    const floorD = STAGE.floorD + STAGE.back;
    const floorZc = (STAGE.floorD - STAGE.back) / 2;
    const floorMesh = slot(slots.floor, projectUv(box(W, STAGE.floorT, floorD), new THREE.Vector3(W / 2, 0, floorZc), 0, 2, FLOOR_TILE), [W / 2, -STAGE.floorT / 2, floorZc]);
    floorMesh.castShadow = false;
    const ceilD = STAGE.ceilD + STAGE.back;
    const ceilZc = (STAGE.ceilD - STAGE.back) / 2;
    const ceilMesh = slot(slots.ceil, projectUv(box(W, STAGE.ceilT, ceilD), new THREE.Vector3(W / 2, 0, ceilZc), 0, 2, CEIL_TILE), [W / 2, H + STAGE.ceilT / 2, ceilZc]);
    ceilMesh.castShadow = false;

    // cienka szczelina cokołowa (12 mm) u styku ściany z podłogą
    mesh(box(W, 0.012, 0.008), skirt, [W / 2, 0.006, 0.004], undefined, false, true);

    // ── ŚCIANA Z DRZWIAMI (mikrocement, lico z=0) ───────────────────────────
    const wallSeg = (x: number, y: number, w: number, h: number) => {
      slot(slots.wall, projectUv(box(w, h, T), new THREE.Vector3(x, y, 0), 0, 1, WALL_TILE), [x, y, -T / 2]);
    };
    wallSeg(dx0 / 2, H / 2, dx0, H);
    wallSeg((dx1 + W) / 2, H / 2, W - dx1, H);
    wallSeg(dxc, (dh + H) / 2, dw, H - dh);

    const revealPlane = (arr: THREE.Mesh[], w: number, h: number, pos: [number, number, number], rot: [number, number, number], tile: number) => {
      const g = planeUv(track(new THREE.PlaneGeometry(w, h)), tile);
      const m = new THREE.Mesh(g, steel);
      m.position.set(...pos);
      m.rotation.set(...rot);
      m.castShadow = false;
      m.receiveShadow = true;
      group.add(m);
      arr.push(m);
    };
    // wnęka drzwiowa (glify + podłoga + tylna ściana - "korytarz")
    revealPlane(slots.wall, nd, dh, [dx0 + 0.002, dh / 2, -nd / 2], [0, Math.PI / 2, 0], WALL_TILE);
    revealPlane(slots.wall, nd, dh, [dx1 - 0.002, dh / 2, -nd / 2], [0, -Math.PI / 2, 0], WALL_TILE);
    revealPlane(slots.wall, dw, nd, [dxc, dh - 0.002, -nd / 2], [Math.PI / 2, 0, 0], WALL_TILE);
    revealPlane(slots.floor, dw, nd, [dxc, 0.004, -nd / 2], [-Math.PI / 2, 0, 0], FLOOR_TILE);
    {
      const g = planeUv(track(new THREE.PlaneGeometry(dw, dh)), WALL_TILE);
      slot(slots.niche, g, [dxc, dh / 2, -nd + 0.004]);
    }

    // ── DEMONSTRACYJNE DRZWI UKRYTE w otworze ───────────────────────────────
    // Szczelina: ciemne wypełnienie obwodowe (czytelny obrys skrzydła) +
    // aluminiowy profil ukrytej ościeżnicy widoczny w szczelinie.
    mesh(box(0.038, dh, 0.05), slotDark, [dx0 + 0.019, dh / 2, -0.033], undefined, false, false);
    mesh(box(0.038, dh, 0.05), slotDark, [dx1 - 0.019, dh / 2, -0.033], undefined, false, false);
    mesh(box(dw, 0.038, 0.05), slotDark, [dxc, dh - 0.019, -0.033], undefined, false, false);
    mesh(box(0.012, dh, 0.006), alu, [dx0 + 0.006, dh / 2, -0.0065], undefined, false, false);
    mesh(box(0.012, dh, 0.006), alu, [dx1 - 0.006, dh / 2, -0.0065], undefined, false, false);
    mesh(box(dw, 0.012, 0.006), alu, [dxc, dh - 0.006, -0.0065], undefined, false, false);
    // Skrzydło: szczelina 5 mm po bokach/górze, 8 mm nad podłogą,
    // lico 6 mm przed płaszczyzną ściany, tekstura kontynuuje wzór ściany.
    {
      const lw = dw - 2 * gap;
      const lh = dh - gap - 0.008;
      const g = projectUv(box(lw, lh, leafT, 0.003), new THREE.Vector3(dxc, 0.008 + lh / 2, 0), 0, 1, WALL_TILE);
      const leaf = new THREE.Mesh(g, steel);
      leaf.position.set(dxc, 0.008 + lh / 2, 0.006 - leafT / 2);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      group.add(leaf);
      slots.door.push(leaf);
    }
    // Klamka: dźwignia 125 mm na wysokości 100 cm, rozeta + trzpień
    // (aluminium jak profil ościeżnicy - srebrna, nie czarna).
    const hx = dx1 - 0.075;
    mesh(track(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 16)), alu, [hx, 1.0, 0.014], [Math.PI / 2, 0, 0], false, false);
    mesh(track(new THREE.CylinderGeometry(0.008, 0.008, 0.024, 10)), alu, [hx, 1.0, 0.024], [Math.PI / 2, 0, 0], false, false);
    mesh(box(0.125, 0.026, 0.016, 0.005), alu, [hx - 0.052, 1.0, 0.036], undefined, false, false);
    // cienie kontaktowe drzwi: spód (podłoga) + boki (ściana)
    {
      const bottom = new THREE.Mesh(track(new THREE.PlaneGeometry(dw + 0.05, 0.07)), edgeShadowMat);
      bottom.rotation.x = -Math.PI / 2;
      bottom.rotation.z = Math.PI;
      bottom.position.set(dxc, 0.012, 0.04);
      bottom.receiveShadow = false;
      group.add(bottom);
      for (const [sx, rz] of [[dx0 - 0.016, -Math.PI / 2], [dx1 + 0.016, Math.PI / 2]] as const) {
        const side = new THREE.Mesh(track(new THREE.PlaneGeometry(dh, 0.03)), edgeShadowMat);
        side.rotation.z = rz;
        side.position.set(sx, dh / 2, 0.002);
        side.receiveShadow = false;
        group.add(side);
      }
    }

    // punkt montażu realnych modeli drzwi (konfigurator podmienia zawartość)
    const doorMount = new THREE.Group();
    doorMount.name = 'doorMount';
    doorMount.position.set(dxc, 0, 0);
    group.add(doorMount);

    // ── DEKORACJE: postument rzeźby + cienie kontaktowe pod modelami GLB ────
    {
      const b = new THREE.Mesh(track(new THREE.PlaneGeometry(0.8, 0.8)), blobMat);
      b.rotation.x = -Math.PI / 2;
      b.position.set(sculptX, 0.012, 0.42);
      group.add(b);
      mesh(box(0.38, 0.58, 0.38, 0.008), stone, [sculptX, 0.29, 0.42]);
      const p = new THREE.Mesh(track(new THREE.PlaneGeometry(0.5, 0.5)), blobMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(plantX, 0.012, 0.5);
      group.add(p);
    }

    return { group, slots, dispose: () => dispose.forEach((d) => d.dispose()) };
  }, [mN, W, H, dx0, dx1, sculptX, plantX]);

  useEffect(() => () => built.dispose(), [built]);

  // ── MATERIAŁY wariantowe (podmiana + dispose poprzednich) ─────────────────
  const prevMats = useRef<THREE.Material[]>([]);
  useEffect(() => {
    const wallTint = wallColor ?? variant.wallTint;
    // mikrocement ściana: widoczna struktura (kontrast/relief), matowy
    const wallMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: wallTint, brighten: variant.wallBrighten,
      saturation: 0.12, contrast: 0.78, normalScale: 0.85, roughness: 0.87,
      aoIntensity: 0.55, breakup: 0.08,
    });
    const woodRepeat = FLOOR_TILE / WOOD_TILE;
    const floorMat =
      variant.floor === 'wood'
        ? buildPbrMaterial(woodSet, { repeat: [woodRepeat, woodRepeat], tint: variant.floorTint, bumpScale: 0.02, roughness: 0.55 })
        : buildPbrMaterial(microSet, {
            repeat: [1, 1], tint: variant.floorTint, brighten: variant.floorBrighten,
            saturation: 0.14, contrast: 0.78, normalScale: 0.8, roughness: 0.7,
            aoIntensity: 0.5, breakup: 0.07, envMapIntensity: 0.55,
          });
    const ceilMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: variant.ceilingTint, brighten: variant.ceilingBrighten,
      saturation: 0.1, contrast: 0.68, normalScale: 0.55, roughness: 0.85, aoIntensity: 0.45, breakup: 0.05,
    });
    const nicheMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: wallTint, brighten: variant.wallBrighten * 0.85,
      saturation: 0.12, contrast: 0.7, normalScale: 0.6, roughness: 0.9, aoIntensity: 0.4,
    });
    nicheMat.emissive = new THREE.Color('#31333a');
    nicheMat.emissiveIntensity = 0.55;
    nicheMat.side = THREE.DoubleSide; // widoczna też zza ściany (otwarta scena)
    // skrzydło drzwi: ton ściany, odrobinę jaśniejsze i mniej matowe -
    // delikatnie inaczej łapie światło, więc obrys drzwi jest czytelny
    const doorMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: wallTint, brighten: variant.wallBrighten * 1.03,
      saturation: 0.12, contrast: 0.78, normalScale: 0.8, roughness: 0.78, aoIntensity: 0.4,
    });

    for (const m of built.slots.wall) m.material = wallMat;
    for (const m of built.slots.floor) m.material = floorMat;
    for (const m of built.slots.ceil) m.material = ceilMat;
    for (const m of built.slots.niche) m.material = nicheMat;
    for (const m of built.slots.door) m.material = doorMat;

    const created = [wallMat, floorMat, ceilMat, nicheMat, doorMat];
    const toDispose = prevMats.current;
    prevMats.current = created;
    for (const m of toDispose) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'bumpMap'] as const) {
        (m as THREE.MeshStandardMaterial)[k]?.dispose();
      }
      m.dispose();
    }
  }, [variant, wallColor, built, microSet, woodSet]);

  useEffect(() => () => { for (const m of prevMats.current) m.dispose(); }, []);

  return (
    <group>
      {/* tło sceny: nigdy czysta czerń */}
      <color attach="background" args={['#1c1c1d']} />
      <primitive object={built.group} />
      {/* Dekoracje GLB (CC0, Poly Haven) obok drzwi */}
      <GltfDecor url={`${modelsBase}/marble_bust_01/marble_bust_01_1k.gltf`} x={sculptX} z={0.42} y={0.58} height={0.52} rotY={0.35} />
      <GltfDecor url={`${modelsBase}/potted_plant_04/potted_plant_04_1k.gltf`} x={plantX} z={0.45} height={0.52} rotY={-0.4} />
      <GltfDecor url={`${modelsBase}/hanging_industrial_lamp/hanging_industrial_lamp_1k.gltf`} x={lampX} z={0.55} y={H} height={1.05} anchor="top" />

      {/* Neutralne, lekkie środowisko proceduralne (bez pobierania HDR). */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#2a2f36']} />
        <Lightformer position={[-6, 2.2, 3]} scale={[3.4, 4, 1]} intensity={2.6} color="#f2f5f8" />
        <Lightformer position={[6, 3, 3]} scale={[4, 4, 1]} intensity={0.6} color="#a6acb2" />
        <Lightformer position={[0, 5, 3]} scale={[8, 4, 1]} rotation={[Math.PI / 2, 0, 0]} intensity={0.5} color="#8b8e92" />
      </Environment>

      {/* 1 światło cieniujące + hemisfera + fill przedni i tylny
          (tylny: orbita 360° nie może pokazywać czarnej ściany od tyłu). */}
      <hemisphereLight intensity={1.15} color="#eef1f4" groundColor="#a5a29a" />
      <KeyLight color={variant.sunColor} intensity={variant.sunIntensity * 0.85} tx={W / 2} />
      <directionalLight position={[4.5, 2.2, 4.2]} intensity={0.4} color="#e9edf1" />
      <directionalLight position={[W / 2 - 1.4, 2.6, -4.5]} intensity={0.55} color="#dfe4e9" />
    </group>
  );
}

/** Główne światło kierunkowe (jedyne rzucające cień); miękkie (PCFSoft + radius). */
function KeyLight({ color, intensity, tx }: { color: string; intensity: number; tx: number }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(tx, 0.9, 0);
    l.target.updateMatrixWorld();
  }, [tx]);
  return (
    <directionalLight
      ref={light}
      position={[-2.8, 3.6, 4.6]}
      intensity={intensity}
      color={color}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-radius={5}
      shadow-bias={-0.0004}
      shadow-camera-left={-6}
      shadow-camera-right={6}
      shadow-camera-top={5}
      shadow-camera-bottom={-2}
      shadow-camera-far={24}
    />
  );
}
