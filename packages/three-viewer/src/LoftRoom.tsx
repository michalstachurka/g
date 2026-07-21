'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useLoader } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { buildPbrMaterial, type PbrTextureSet } from './pbr';
import type { LoftVariant } from './loft-variants';

/**
 * Scena ekspozycyjna drzwi odtwarzająca referencyjny render klienta:
 * - ściana drzwiowa: ciepły greige (mikrocement), drzwi ukryte ze szczeliną
 *   i CZARNĄ klamką,
 * - lewa ściana: czerwona cegła w ciepłym bocznym świetle,
 * - prawa ściana: ciemny beton w półcieniu,
 * - podłoga: deski biegnące w głąb (do widza),
 * - sufit: ciemny tynk + czarne belki w poprzek,
 * - czarny reflektor punktowy na pręcie przy suficie (ciepła plama światła
 *   na ścianie na prawo od drzwi),
 * - czarna fasetowana rzeźba na wysokim ciemnym postumencie po lewej.
 * Reflektor i rzeźba są proceduralne 1:1 z referencją (brak takich modeli
 * CC0 na Poly Haven - sprawdzone w katalogu).
 *
 * Kamera: bez ograniczeń sceny - limity wyłącznie w OrbitControls strony
 * (identyczne ze standardowym konfiguratorem produktu).
 *
 * ── REGULACJA ────────────────────────────────────────────────────────────────
 *   props room/wallColor - wymiary ściany drzwiowej i kolor mikrocementu,
 *   LOFT_ROOM_DEFAULTS   - domyślne wymiary + zakresy suwaków,
 *   STAGE                - głębokość wnęki, grubości płyt,
 *   DOOR                 - otwór drzwi (wyśrodkowany),
 *   BEAMS                - belki sufitowe (przekrój, rozstaw),
 *   DECOR                - pozycje rzeźby i reflektora,
 *   *_TILE               - skala tekstur (metry na kafel),
 *   światła              - JSX na dole: reflektor (sunColor/sunIntensity
 *                          wariantu), skim cegły, hemisfera, fill tylny.
 */

// ── Wymiary (metry) ──────────────────────────────────────────────────────────
export const LOFT_ROOM_DEFAULTS = {
  w: 4.2, h: 2.95, d: 5.2,
  minW: 3.4, maxW: 7.2, minH: 2.5, maxH: 3.4,
};
const STAGE = { wall: 0.2, floorT: 0.3, ceilT: 0.22, depth: 3.9, back: 0.5 };
const DOOR = { w: 0.9, h: 2.1, niche: 0.26, gap: 0.005, leafT: 0.045 };
const BEAMS = { w: 0.16, h: 0.24, z0: 0.4, gap: 0.78, count: 5 };
const DECOR = { sculptGap: 0.82, sculptZ: 0.5, lampGap: 0.95, lampZ: 0.85, lampY: 2.3 };

// metry świata na jeden kafel tekstury (mniejsze = drobniejszy wzór)
const BRICK_TILE = 1.85; // rząd cegły ~7.5 cm
const WALL_TILE = 1.7; // mikrocement ściana
const FLOOR_TILE = 2.2; // podłoga
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
  brick: THREE.Mesh[];
  wall: THREE.Mesh[];
  wallDark: THREE.Mesh[];
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

/** SpotLight z celem podanym jako punkt (target dodawany do sceny). */
function AimedSpot({
  pos, aim, color, intensity, angle, penumbra, decay = 1.4, castShadow = false,
}: {
  pos: [number, number, number];
  aim: [number, number, number];
  color: string;
  intensity: number;
  angle: number;
  penumbra: number;
  decay?: number;
  castShadow?: boolean;
}) {
  const target = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    target.position.set(...aim);
    target.updateMatrixWorld();
  }, [aim, target]);
  return (
    <>
      <primitive object={target} />
      <spotLight
        position={pos}
        target={target}
        color={color}
        intensity={intensity}
        angle={angle}
        penumbra={penumbra}
        decay={decay}
        castShadow={castShadow}
        shadow-mapSize={castShadow ? [1024, 1024] : undefined}
        shadow-radius={castShadow ? 4 : undefined}
        shadow-bias={castShadow ? -0.0003 : undefined}
      />
    </>
  );
}

/** Czarny reflektor na pręcie (jak w referencji) - oprawa + celowanie. */
function CeilingSpot({
  x, y, z, ceilingY, aim,
}: {
  x: number; y: number; z: number; ceilingY: number; aim: [number, number, number];
}) {
  const head = useRef<THREE.Group>(null);
  useEffect(() => {
    head.current?.lookAt(new THREE.Vector3(...aim));
  }, [aim]);
  const black = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#121213', roughness: 0.45, metalness: 0.8, envMapIntensity: 0.9 }),
    [],
  );
  const lens = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.3, metalness: 0.2 });
    m.emissive = new THREE.Color('#ffc487');
    m.emissiveIntensity = 3.2;
    return m;
  }, []);
  useEffect(() => () => { black.dispose(); lens.dispose(); }, [black, lens]);
  return (
    <group position={[x, 0, z]}>
      {/* mocowanie i pręt od sufitu */}
      <mesh material={black} position={[0, ceilingY - 0.012, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.024, 20]} />
      </mesh>
      <mesh material={black} position={[0, (ceilingY + y) / 2, 0]}>
        <cylinderGeometry args={[0.011, 0.011, Math.max(ceilingY - y, 0.05), 12]} />
      </mesh>
      {/* głowica celująca w ścianę (widelec + tuba + soczewka) */}
      <group ref={head} position={[0, y, 0]}>
        <mesh material={black} position={[0, 0, -0.02]}>
          <boxGeometry args={[0.032, 0.05, 0.05]} />
        </mesh>
        <mesh material={black} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.05]}>
          <cylinderGeometry args={[0.078, 0.062, 0.19, 24]} />
        </mesh>
        <mesh material={lens} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.145]}>
          <cylinderGeometry args={[0.062, 0.062, 0.006, 24]} />
        </mesh>
      </group>
    </group>
  );
}

export interface LoftRoomProps {
  variant: LoftVariant;
  texturesBase?: string;
  /** Wymiary ściany drzwiowej (m); brak pola = wartość z LOFT_ROOM_DEFAULTS. */
  room?: { w?: number; h?: number; d?: number };
  /** Nadpisanie koloru ścian z mikrocementu (tint; undefined = kolor wariantu). */
  wallColor?: string;
}

export function LoftRoom({
  variant,
  texturesBase = '/textures',
  room,
  wallColor,
}: LoftRoomProps) {
  const W = THREE.MathUtils.clamp(room?.w ?? LOFT_ROOM_DEFAULTS.w, LOFT_ROOM_DEFAULTS.minW, LOFT_ROOM_DEFAULTS.maxW);
  const H = THREE.MathUtils.clamp(room?.h ?? LOFT_ROOM_DEFAULTS.h, LOFT_ROOM_DEFAULTS.minH, LOFT_ROOM_DEFAULTS.maxH);
  const dx0 = (W - DOOR.w) / 2;
  const dx1 = dx0 + DOOR.w;
  const sculptX = Math.max(dx0 - DECOR.sculptGap, 0.42);
  const lampX = Math.min(dx1 + DECOR.lampGap, W - 0.4);

  const tex = useLoader(THREE.TextureLoader, [
    `${texturesBase}/brick/color.jpg`,
    `${texturesBase}/brick/normal.jpg`,
    `${texturesBase}/brick/roughness.jpg`,
    `${texturesBase}/brick/ao.jpg`,
    `${texturesBase}/microcement/color.jpg`,
    `${texturesBase}/microcement/normal.jpg`,
    `${texturesBase}/microcement/roughness.jpg`,
    `${texturesBase}/microcement/ao.jpg`,
    `${texturesBase}/wood/color.jpg`,
    `${texturesBase}/wood/bump.jpg`,
    `${texturesBase}/wood/roughness.jpg`,
  ]);
  const [bC, bN, bR, bAo, mC, mN, mR, mAo, wC, wB, wR] = tex;
  const brickSet: PbrTextureSet = { color: bC, normal: bN, roughness: bR, ao: bAo };
  const microSet: PbrTextureSet = { color: mC, normal: mN, roughness: mR, ao: mAo };
  const woodSet: PbrTextureSet = { color: wC, bump: wB, roughness: wR };

  // ── GEOMETRIA + materiały stałe (raz na wymiary) ──────────────────────────
  const built = useMemo(() => {
    const group = new THREE.Group();
    const dispose: { dispose: () => void }[] = [];
    const slots: Slots = { brick: [], wall: [], wallDark: [], floor: [], ceil: [], niche: [], door: [] };
    const T = STAGE.wall;
    const { w: dw, h: dh, niche: nd, gap, leafT } = DOOR;
    const dxc = dx0 + dw / 2;
    const depth = STAGE.depth;

    const track = <G extends THREE.BufferGeometry>(g: G) => (dispose.push(g), g);
    const box = (w: number, h: number, d: number, r = 0) =>
      track(r > 0 ? (new RoundedBoxGeometry(w, h, d, 2, r) as THREE.BufferGeometry) : new THREE.BoxGeometry(w, h, d));

    // materiały stałe
    const steel = new THREE.MeshStandardMaterial({ color: '#35383d', roughness: 0.55, metalness: 0.75, envMapIntensity: 0.85 });
    // klamka i profil szczeliny: CZARNE jak w referencji
    const blackMetal = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.45, metalness: 0.7, envMapIntensity: 0.8 });
    const slotDark = new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.92, metalness: 0.1 });
    const skirt = new THREE.MeshStandardMaterial({ color: '#232427', roughness: 0.85, metalness: 0.2 });
    const beamMat = new THREE.MeshStandardMaterial({ color: '#171614', roughness: 0.9, metalness: 0.05 });
    // postument: ciemny kamień (mikrocement przyciemniony, pełny relief)
    const plinth = buildPbrMaterial(microSet, {
      repeat: [1.6, 1.6], tint: '#4a4744', brighten: 0.75, saturation: 0.25,
      contrast: 1.05, normalScale: 1.0, roughness: 0.8, aoIntensity: 0.8,
    });
    // rzeźba: czarna fasetowana bryła (flat shading przez niezindeksowaną geometrię)
    const shardMat = new THREE.MeshStandardMaterial({
      color: '#141414', roughness: 0.32, metalness: 0.25, envMapIntensity: 1.4, flatShading: true,
    });
    const blobMat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, opacity: 0.4, depthWrite: false, color: '#000000' });
    const edgeShadowMat = new THREE.MeshBasicMaterial({ map: makeEdgeShadowTexture(), transparent: true, opacity: 0.22, depthWrite: false, color: '#000000' });
    dispose.push(steel, blackMetal, slotDark, skirt, beamMat, plinth, shardMat, blobMat, blobMat.map!, edgeShadowMat, edgeShadowMat.map!);
    for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap'] as const) {
      const t = (plinth as THREE.MeshStandardMaterial)[k];
      if (t) dispose.push(t);
    }

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

    // ── PODŁOGA (deski w głąb) i SUFIT (ciemny tynk) ────────────────────────
    const floorD = depth + STAGE.back;
    const floorZc = (depth - STAGE.back) / 2;
    const floorMesh = slot(slots.floor, projectUv(box(W, STAGE.floorT, floorD), new THREE.Vector3(W / 2, 0, floorZc), 0, 2, FLOOR_TILE), [W / 2, -STAGE.floorT / 2, floorZc]);
    floorMesh.castShadow = false;
    const ceilMesh = slot(slots.ceil, projectUv(box(W, STAGE.ceilT, floorD), new THREE.Vector3(W / 2, 0, floorZc), 0, 2, CEIL_TILE), [W / 2, H + STAGE.ceilT / 2, floorZc]);
    ceilMesh.castShadow = false;

    // czarne belki w poprzek (pod sufitem, na całą szerokość)
    for (let i = 0; i < BEAMS.count; i++) {
      const z = BEAMS.z0 + i * BEAMS.gap;
      if (z > depth - 0.15) break;
      mesh(box(W + 0.02, BEAMS.h, BEAMS.w, 0.004), beamMat, [W / 2, H - BEAMS.h / 2, z], undefined, false, true);
    }

    // cienka szczelina cokołowa u styku ścian z podłogą
    mesh(box(W, 0.012, 0.008), skirt, [W / 2, 0.006, 0.004], undefined, false, true);
    mesh(box(0.008, 0.012, depth), skirt, [0.004, 0.006, depth / 2], undefined, false, true);
    mesh(box(0.008, 0.012, depth), skirt, [W - 0.004, 0.006, depth / 2], undefined, false, true);

    // ── ŚCIANY BOCZNE: cegła (lewa) + ciemny beton (prawa) ──────────────────
    slot(slots.brick, projectUv(box(T, H, depth + STAGE.back), new THREE.Vector3(0, H / 2, floorZc), 2, 1, BRICK_TILE), [-T / 2, H / 2, floorZc]);
    slot(slots.wallDark, projectUv(box(T, H, depth + STAGE.back), new THREE.Vector3(W, H / 2, floorZc), 2, 1, WALL_TILE), [W + T / 2, H / 2, floorZc]);

    // ── ŚCIANA DRZWIOWA (mikrocement, lico z=0) ─────────────────────────────
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
    revealPlane(slots.wall, nd, dh, [dx0 + 0.002, dh / 2, -nd / 2], [0, Math.PI / 2, 0], WALL_TILE);
    revealPlane(slots.wall, nd, dh, [dx1 - 0.002, dh / 2, -nd / 2], [0, -Math.PI / 2, 0], WALL_TILE);
    revealPlane(slots.wall, dw, nd, [dxc, dh - 0.002, -nd / 2], [Math.PI / 2, 0, 0], WALL_TILE);
    revealPlane(slots.floor, dw, nd, [dxc, 0.004, -nd / 2], [-Math.PI / 2, 0, 0], FLOOR_TILE);
    {
      const g = planeUv(track(new THREE.PlaneGeometry(dw, dh)), WALL_TILE);
      slot(slots.niche, g, [dxc, dh / 2, -nd + 0.004]);
    }

    // ── DRZWI UKRYTE: cienka ciemna szczelina (bez srebrnych profili) ───────
    mesh(box(0.038, dh, 0.05), slotDark, [dx0 + 0.019, dh / 2, -0.033], undefined, false, false);
    mesh(box(0.038, dh, 0.05), slotDark, [dx1 - 0.019, dh / 2, -0.033], undefined, false, false);
    mesh(box(dw, 0.038, 0.05), slotDark, [dxc, dh - 0.019, -0.033], undefined, false, false);
    {
      const lw = dw - 2 * gap;
      const lh = dh - gap - 0.008;
      const g = projectUv(box(lw, lh, leafT, 0.003), new THREE.Vector3(dxc, 0.008 + lh / 2, 0), 0, 1, WALL_TILE);
      const leaf = new THREE.Mesh(g, steel);
      leaf.position.set(dxc, 0.008 + lh / 2, 0.004 - leafT / 2);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      group.add(leaf);
      slots.door.push(leaf);
    }
    // Klamka jak w referencji: CZARNA prosta dźwignia na małej rozecie, 100 cm.
    const hx = dx1 - 0.085;
    mesh(track(new THREE.CylinderGeometry(0.013, 0.013, 0.01, 18)), blackMetal, [hx, 1.0, 0.011], [Math.PI / 2, 0, 0], false, false);
    mesh(track(new THREE.CylinderGeometry(0.007, 0.007, 0.022, 12)), blackMetal, [hx, 1.0, 0.021], [Math.PI / 2, 0, 0], false, false);
    mesh(box(0.15, 0.017, 0.014, 0.004), blackMetal, [hx - 0.064, 1.0, 0.032], undefined, false, false);
    // cienie kontaktowe drzwi: spód + boki
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

    // ── RZEŹBA: czarna fasetowana bryła na wysokim ciemnym postumencie ──────
    {
      const b = new THREE.Mesh(track(new THREE.PlaneGeometry(0.75, 0.75)), blobMat);
      b.rotation.x = -Math.PI / 2;
      b.position.set(sculptX, 0.012, DECOR.sculptZ);
      group.add(b);
      mesh(box(0.3, 1.06, 0.3, 0.006), plinth, [sculptX, 0.53, DECOR.sculptZ]);
      const shardGeo = track(new THREE.IcosahedronGeometry(0.135, 0).toNonIndexed() as THREE.BufferGeometry);
      shardGeo.scale(0.95, 1.45, 0.78);
      shardGeo.computeVertexNormals();
      mesh(shardGeo, shardMat, [sculptX, 1.06 + 0.2, DECOR.sculptZ], [0.06, 0.55, 0.04]);
    }

    return { group, slots, dispose: () => dispose.forEach((d) => d.dispose()) };
  }, [microSet, W, H, dx0, dx1, sculptX]);

  useEffect(() => () => built.dispose(), [built]);

  // ── MATERIAŁY wariantowe (podmiana + dispose poprzednich) ─────────────────
  const prevMats = useRef<THREE.Material[]>([]);
  useEffect(() => {
    const wallTint = wallColor ?? variant.wallTint;
    // ciemniejsza pochodna koloru ściany na prawą ścianę (półcień jak w referencji)
    const darkTint = `#${new THREE.Color(wallTint).multiplyScalar(0.58).getHexString()}`;
    // cegła: naturalna, ciepła - doświetlana bocznym światłem
    const brickMat = buildPbrMaterial(brickSet, {
      repeat: [1, 1], tint: variant.brickTint, saturation: 0.92, brighten: 0.95,
      contrast: 0.95, normalScale: 0.85, aoIntensity: 0.75, roughness: 0.95, breakup: 0.1,
    });
    const wallMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: wallTint, brighten: variant.wallBrighten,
      saturation: 0.14, contrast: 0.78, normalScale: 0.6, roughness: 0.87,
      aoIntensity: 0.55, breakup: 0.08,
    });
    const wallDarkMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: darkTint, brighten: variant.wallBrighten * 0.95,
      saturation: 0.12, contrast: 0.82, normalScale: 0.7, roughness: 0.9,
      aoIntensity: 0.6, breakup: 0.09,
    });
    const woodRepeat = FLOOR_TILE / WOOD_TILE;
    const floorMat =
      variant.floor === 'wood'
        ? buildPbrMaterial(woodSet, {
            repeat: [woodRepeat, woodRepeat], tint: variant.floorTint, brighten: variant.floorBrighten,
            saturation: 1, bumpScale: 0.018, roughness: 0.52, envMapIntensity: 0.5, rotate90: true,
          })
        : buildPbrMaterial(microSet, {
            repeat: [1, 1], tint: variant.floorTint, brighten: variant.floorBrighten,
            saturation: 0.14, contrast: 0.78, normalScale: 0.8, roughness: 0.7,
            aoIntensity: 0.5, breakup: 0.07, envMapIntensity: 0.55,
          });
    const ceilMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: variant.ceilingTint, brighten: variant.ceilingBrighten,
      saturation: 0.14, contrast: 0.7, normalScale: 0.55, roughness: 0.92, aoIntensity: 0.5, breakup: 0.05,
    });
    const nicheMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: wallTint, brighten: variant.wallBrighten * 0.8,
      saturation: 0.14, contrast: 0.7, normalScale: 0.6, roughness: 0.9, aoIntensity: 0.4,
    });
    nicheMat.emissive = new THREE.Color('#2b2723');
    nicheMat.emissiveIntensity = 0.5;
    nicheMat.side = THREE.DoubleSide; // widoczna też zza ściany (otwarta scena)
    const doorMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: wallTint, brighten: variant.wallBrighten * 1.03,
      saturation: 0.14, contrast: 0.78, normalScale: 0.8, roughness: 0.78, aoIntensity: 0.4,
    });

    for (const m of built.slots.brick) m.material = brickMat;
    for (const m of built.slots.wall) m.material = wallMat;
    for (const m of built.slots.wallDark) m.material = wallDarkMat;
    for (const m of built.slots.floor) m.material = floorMat;
    for (const m of built.slots.ceil) m.material = ceilMat;
    for (const m of built.slots.niche) m.material = nicheMat;
    for (const m of built.slots.door) m.material = doorMat;

    const created = [brickMat, wallMat, wallDarkMat, floorMat, ceilMat, nicheMat, doorMat];
    const toDispose = prevMats.current;
    prevMats.current = created;
    for (const m of toDispose) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'bumpMap'] as const) {
        (m as THREE.MeshStandardMaterial)[k]?.dispose();
      }
      m.dispose();
    }
  }, [variant, wallColor, built, brickSet, microSet, woodSet]);

  useEffect(() => () => { for (const m of prevMats.current) m.dispose(); }, []);

  // cele świateł zależne od układu
  const spotAim: [number, number, number] = [dx1 + 0.5, 1.7, 0];
  const brickAim: [number, number, number] = [0.05, 0.7, 1.5];

  return (
    <group>
      {/* tło sceny: nigdy czysta czerń */}
      <color attach="background" args={['#151516']} />
      <primitive object={built.group} />

      {/* czarny reflektor na pręcie (oprawa) + jego światło */}
      <CeilingSpot x={lampX} y={DECOR.lampY} z={DECOR.lampZ} ceilingY={H} aim={spotAim} />
      <AimedSpot
        pos={[lampX, DECOR.lampY, DECOR.lampZ]}
        aim={spotAim}
        color={variant.sunColor}
        intensity={variant.sunIntensity * 9}
        angle={0.44}
        penumbra={0.88}
        decay={1.5}
        castShadow
      />
      {/* ciepły skim po cegle (jak smuga z góry w referencji) */}
      <AimedSpot
        pos={[1.15, H - 0.05, 2.4]}
        aim={brickAim}
        color="#ffc79b"
        intensity={12}
        angle={0.8}
        penumbra={0.9}
        decay={1.2}
      />
      {/* szeroki, ciepły wypełniacz na CAŁĄ ścianę drzwiową - drzwi mają być
          czytelne jak w referencji, reflektor jest tylko akcentem */}
      <AimedSpot
        pos={[W / 2, 1.9, 3.4]}
        aim={[W / 2, 1.2, 0]}
        color="#ffd2a0"
        intensity={9}
        angle={0.95}
        penumbra={1}
        decay={1.05}
      />

      {/* Przygaszone środowisko (odbicia na metalach/podłodze). */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#191a1c']} />
        <Lightformer position={[-5, 2.5, 3]} scale={[3, 3.4, 1]} intensity={1.1} color="#f4e3cd" />
        <Lightformer position={[5, 3, 2]} scale={[3.4, 3.4, 1]} intensity={0.4} color="#8e9298" />
        <Lightformer position={[0, 5, 3]} scale={[7, 3.4, 1]} rotation={[Math.PI / 2, 0, 0]} intensity={0.35} color="#7d7a75" />
      </Environment>

      {/* miękki ciepły ambient + przedni i tylny fill */}
      <hemisphereLight intensity={1.35} color="#a99f92" groundColor="#665849" />
      <directionalLight position={[W / 2 + 1.2, 2.0, 4.8]} intensity={0.75} color="#f0dcc4" />
      <directionalLight position={[W / 2 - 1.4, 2.6, -4.5]} intensity={0.4} color="#8b8f96" />
    </group>
  );
}
