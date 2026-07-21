'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { buildPbrMaterial, type PbrTextureSet } from './pbr';
import type { LoftVariant } from './loft-variants';

/**
 * Otwarta od frontu scena ekspozycyjna drzwi (ściana drzwiowa + boczne ściany
 * + podłoga + sufit, bez ściany przedniej). Minimalistyczna przestrzeń do
 * prezentacji wariantów drzwi - drzwi są głównym produktem.
 *
 * W scenie: jedno skrzydło drzwiowe (ukryte), czarna rzeźba GLB na jasnym
 * postumencie, jeden reflektor loftowy, dwie smukłe belki. Bez mebli/roślin.
 *
 * Geometria budowana raz na wymiary; zmiana wariantu/koloru podmienia wyłącznie
 * materiały (dispose poprzednich). Drzwi mają STAŁY punkt (DOOR_CX) niezależny
 * od szerokości - zmiana szerokości/wysokości nie przesuwa drzwi ani kamery.
 *
 * ── REGULACJA ────────────────────────────────────────────────────────────────
 *   DOOR_CX            - stały środek drzwi w świecie (doorAnchor),
 *   LOFT_ROOM_DEFAULTS - domyślne wymiary + zakresy suwaków,
 *   STAGE              - grubości przegród i głębokość sceny,
 *   PLINTH             - postument (wymiary + pozycja względem drzwi),
 *   SCULPT_HEIGHT      - docelowa wysokość rzeźby (m),
 *   SCULPT_MATERIAL    - kolor/roughness/metalness rzeźby,
 *   BEAMS              - belki (przekrój, liczba, rozstaw),
 *   *_TILE             - skala tekstur (metry na kafel),
 *   światła            - JSX na dole: hemisfera, front (cień), spot na drzwi,
 *                        temperatura per wariant: sunColor/sunIntensity,
 *   WallFade           - płynne zanikanie bocznych ścian zasłaniających drzwi,
 *   CameraClamp        - bezpieczne granice OrbitControls.
 */

// ── Wymiary (metry) ──────────────────────────────────────────────────────────
export const LOFT_ROOM_DEFAULTS = {
  w: 4.2, h: 2.95, d: 5.2,
  minW: 3.4, maxW: 7.2, minH: 2.5, maxH: 3.4,
};
const DOOR_CX = LOFT_ROOM_DEFAULTS.w / 2; // stały środek drzwi (doorAnchor.x)
const STAGE = { wall: 0.2, floorT: 0.15, ceilT: 0.18, depth: 4.7 };
const DOOR = { w: 0.9, h: 2.1, niche: 0.26, gap: 0.0035, leafT: 0.045 };
const BEAMS = { w: 0.135, h: 0.17, zs: [0.34, 0.66] as const }; // zs = ułamki głębokości
const PLINTH = { w: 0.34, d: 0.34, h: 0.88, gap: 0.55, z: 0.52 }; // gap = odstęp od krawędzi drzwi
const SCULPT_HEIGHT = 0.45; // 40-50 cm
const SCULPT_MATERIAL = { color: '#08090b', roughness: 0.72, metalness: 0.08 };

// metry świata na jeden kafel tekstury (mniejsze = drobniejszy wzór)
const BRICK_TILE = 1.85;
const WALL_TILE = 1.7;
const WOOD_TILE = 1.5;
const CEIL_TILE = 2.6;

type UvAxis = 0 | 1 | 2;

/** Rzutowanie UV wg pozycji świata (ciągłość + brak rozciągania przy zmianie wymiarów) + uv1 dla AO. */
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
  wall: THREE.Mesh[]; // ściana drzwiowa + ościeża (kolor użytkownika)
  ceil: THREE.Mesh[];
  niche: THREE.Mesh[];
  door: THREE.Mesh[];
}

/** Miękki radialny cień kontaktowy (blob) pod postumentem. */
function makeBlobTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Liniowy gradient cienia (krawędzie drzwi). Ciemny przy y=0, zanik do y=1. */
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

/** Czarna rzeźba z przekazanego GLB - materiał nadpisany na spójny matowy czarny. */
function SculptureModel({ url, x, z, topY }: { url: string; x: number; z: number; topY: number }) {
  const gltf = useLoader(GLTFLoader, url);
  const { object, material } = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: SCULPT_MATERIAL.color,
      roughness: SCULPT_MATERIAL.roughness,
      metalness: SCULPT_MATERIAL.metalness,
      flatShading: true, // delikatnie widoczne fasety bryły
      envMapIntensity: 0.4,
    });
    const s = gltf.scene.clone(true);
    // skala do docelowej wysokości (bez deformacji proporcji)
    let bb = new THREE.Box3().setFromObject(s);
    const size = bb.getSize(new THREE.Vector3());
    s.scale.setScalar(SCULPT_HEIGHT / Math.max(size.y, 1e-4));
    // centrowanie na postumencie + podstawa dokładnie na górnej płaszczyźnie
    bb = new THREE.Box3().setFromObject(s);
    const c = bb.getCenter(new THREE.Vector3());
    s.position.set(x - c.x, topY - bb.min.y, z - c.z);
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const old = m.material;
        if (old && old !== mat) (Array.isArray(old) ? old : [old]).forEach((mm) => mm.dispose());
        m.material = mat;
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return { object: s, material: mat };
  }, [gltf, x, z, topY]);
  useEffect(() => () => material.dispose(), [material]);
  return <primitive object={object} />;
}

/** Prosty reflektor loftowy: matowa czarna oprawa na pręcie od sufitu, celuje w drzwi. */
function CeilingSpot({ x, z, ceilingY, headY, aim }: { x: number; z: number; ceilingY: number; headY: number; aim: [number, number, number] }) {
  const head = useRef<THREE.Group>(null);
  useEffect(() => {
    head.current?.lookAt(new THREE.Vector3(...aim));
  }, [aim]);
  const black = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.5, metalness: 0.72, envMapIntensity: 0.7 }),
    [],
  );
  const lens = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#1b1a19', roughness: 0.35, metalness: 0.2 });
    m.emissive = new THREE.Color('#ffdaa8');
    m.emissiveIntensity = 2.2;
    return m;
  }, []);
  useEffect(() => () => { black.dispose(); lens.dispose(); }, [black, lens]);
  return (
    <group position={[x, 0, z]}>
      <mesh material={black} position={[0, ceilingY - 0.01, 0]} castShadow>
        <cylinderGeometry args={[0.032, 0.032, 0.02, 18]} />
      </mesh>
      <mesh material={black} position={[0, (ceilingY + headY) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.01, 0.01, Math.max(ceilingY - headY, 0.05), 10]} />
      </mesh>
      <group ref={head} position={[0, headY, 0]}>
        <mesh material={black} position={[0, 0, -0.018]} castShadow>
          <boxGeometry args={[0.03, 0.046, 0.046]} />
        </mesh>
        <mesh material={black} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.05]} castShadow>
          <cylinderGeometry args={[0.07, 0.056, 0.17, 22]} />
        </mesh>
        <mesh material={lens} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.132]}>
          <cylinderGeometry args={[0.056, 0.056, 0.006, 22]} />
        </mesh>
      </group>
    </group>
  );
}

/** Płynne zanikanie bocznej ściany, gdy kamera zbliża się do niej / zachodzi na drzwi. */
function WallFade({ left, right, roomLeft, roomRight }: { left: THREE.Mesh[]; right: THREE.Mesh[]; roomLeft: number; roomRight: number }) {
  const camera = useThree((s) => s.camera);
  useFrame((_, dt) => {
    const x = camera.position.x;
    // zanikanie startuje ~0.9 m od ściany; przy bardzo małym dystansie opacity ~0.12
    const tL = THREE.MathUtils.clamp((x - roomLeft + 0.1) / 1.0, 0, 1);
    const tR = THREE.MathUtils.clamp((roomRight + 0.1 - x) / 1.0, 0, 1);
    applyFade(left, THREE.MathUtils.lerp(0.12, 1, tL), dt);
    applyFade(right, THREE.MathUtils.lerp(0.12, 1, tR), dt);
  });
  return null;
}

function applyFade(meshes: THREE.Mesh[], target: number, dt: number) {
  for (const m of meshes) {
    const mat = m.material as THREE.MeshStandardMaterial | undefined;
    if (!mat) continue;
    mat.opacity = THREE.MathUtils.damp(mat.opacity, target, 7, dt);
    mat.depthWrite = mat.opacity > 0.6; // poprawne depthWrite podczas zanikania
  }
}

/** Bezpieczne granice kamery: bez wchodzenia pod podłogę/nad sufit/za tylną ścianę. */
function CameraClamp({ roomLeft, roomRight, h, depth }: { roomLeft: number; roomRight: number; h: number; depth: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  useFrame(() => {
    const p = camera.position;
    p.x = THREE.MathUtils.clamp(p.x, roomLeft - 0.5, roomRight + 0.5);
    p.y = THREE.MathUtils.clamp(p.y, 0.3, h + 0.5);
    p.z = THREE.MathUtils.clamp(p.z, 0.25, depth + 3.2);
    if (controls?.target) {
      const t = controls.target;
      t.x = THREE.MathUtils.clamp(t.x, roomLeft + 0.3, roomRight - 0.3);
      t.y = THREE.MathUtils.clamp(t.y, 0.4, h - 0.25);
      t.z = THREE.MathUtils.clamp(t.z, -0.2, depth - 0.4);
    }
  });
  return null;
}

export interface LoftRoomProps {
  variant: LoftVariant;
  texturesBase?: string;
  modelsBase?: string;
  /** Wymiary pomieszczenia (m); brak pola = wartość z LOFT_ROOM_DEFAULTS. */
  room?: { w?: number; h?: number; d?: number };
  /** Nadpisanie koloru ściany drzwiowej z mikrocementu (tint; undefined = kolor wariantu). */
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
  // pomieszczenie rozciąga się symetrycznie wokół DOOR_CX - drzwi zawsze wyśrodkowane
  const roomLeft = DOOR_CX - W / 2;
  const roomRight = DOOR_CX + W / 2;
  const depth = STAGE.depth;
  const dx0 = DOOR_CX - DOOR.w / 2;
  const dx1 = DOOR_CX + DOOR.w / 2;
  const plinthX = dx0 - PLINTH.gap; // postument po lewej stronie drzwi
  const spotX = dx1 + 0.95; // reflektor po prawej

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
    const slots: Slots = { wall: [], ceil: [], niche: [] as THREE.Mesh[], door: [] };
    const T = STAGE.wall;
    const { w: dw, h: dh, niche: nd, gap, leafT } = DOOR;
    const dxc = DOOR_CX;

    const track = <G extends THREE.BufferGeometry>(g: G) => (dispose.push(g), g);
    const box = (w: number, h: number, d: number, r = 0) =>
      track(r > 0 ? (new RoundedBoxGeometry(w, h, d, 2, r) as THREE.BufferGeometry) : new THREE.BoxGeometry(w, h, d));

    // materiały stałe (współdzielone)
    const steel = new THREE.MeshStandardMaterial({ color: '#35383d', roughness: 0.55, metalness: 0.75, envMapIntensity: 0.85 });
    const blackMetal = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.5, metalness: 0.72, envMapIntensity: 0.8 });
    const slotDark = new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.92, metalness: 0.1 });
    const skirt = new THREE.MeshStandardMaterial({ color: '#26272a', roughness: 0.85, metalness: 0.2 });
    const beamMat = new THREE.MeshStandardMaterial({ color: '#171717', roughness: 0.72, metalness: 0.75, envMapIntensity: 0.7 });
    const blobMat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, opacity: 0.4, depthWrite: false, color: '#000000' });
    const edgeShadowMat = new THREE.MeshBasicMaterial({ map: makeEdgeShadowTexture(), transparent: true, opacity: 0.22, depthWrite: false, color: '#000000' });
    dispose.push(steel, blackMetal, slotDark, skirt, beamMat, blobMat, blobMat.map!, edgeShadowMat, edgeShadowMat.map!);

    const mesh = (
      geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], pos: [number, number, number],
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

    // ── PODŁOGA (płyta z grubością; góra = drewno, boki = ciemny beton) ─────
    // Osobne grupy materiałowe BoxGeometry: index 2 (+Y) = drewno, reszta boki.
    const floorZc = (depth - T) / 2;
    const floorGeo = box(W, STAGE.floorT, depth + T);
    const floorMesh: THREE.Mesh = new THREE.Mesh(floorGeo, steel);
    floorMesh.position.set(DOOR_CX, -STAGE.floorT / 2, floorZc);
    floorMesh.castShadow = false;
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    // ── SUFIT (płyta z grubością) ───────────────────────────────────────────
    const ceilMesh = slot(slots.ceil, projectUv(box(W, STAGE.ceilT, depth + T), new THREE.Vector3(DOOR_CX, 0, floorZc), 0, 2, CEIL_TILE), [DOOR_CX, H + STAGE.ceilT / 2, floorZc]);
    ceilMesh.castShadow = false;

    // ── ŚCIANY BOCZNE (osobne meshe dla zanikania) ─────────────────────────
    // Nie rzucają cienia - inaczej boczna ściana kładzie ostry ukośny cień na
    // całą ścianę drzwiową. Kontakt cień dają postument/rzeźba/drzwi.
    const leftWall = mesh(projectUv(box(T, H, depth + T), new THREE.Vector3(0, H / 2, floorZc), 2, 1, BRICK_TILE), steel, [roomLeft - T / 2, H / 2, floorZc], undefined, false, true);
    const rightWall = mesh(projectUv(box(T, H, depth + T), new THREE.Vector3(0, H / 2, floorZc), 2, 1, WALL_TILE), steel, [roomRight + T / 2, H / 2, floorZc], undefined, false, true);

    // cienka szczelina cokołowa u styku ścian z podłogą
    mesh(box(W, 0.012, 0.008), skirt, [DOOR_CX, 0.006, 0.004], undefined, false, true);

    // ── ŚCIANA DRZWIOWA (mikrocement, lico z=0) z otworem ───────────────────
    const wallSeg = (x: number, y: number, w: number, h: number) => {
      slot(slots.wall, projectUv(box(w, h, T), new THREE.Vector3(x, y, 0), 0, 1, WALL_TILE), [x, y, -T / 2]);
    };
    wallSeg((roomLeft + dx0) / 2, H / 2, dx0 - roomLeft, H);
    wallSeg((dx1 + roomRight) / 2, H / 2, roomRight - dx1, H);
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
    // wnęka drzwiowa (glify + nadproże + podłoga wnęki + tylna ścianka)
    revealPlane(slots.wall, nd, dh, [dx0 + 0.002, dh / 2, -nd / 2], [0, Math.PI / 2, 0], WALL_TILE);
    revealPlane(slots.wall, nd, dh, [dx1 - 0.002, dh / 2, -nd / 2], [0, -Math.PI / 2, 0], WALL_TILE);
    revealPlane(slots.wall, dw, nd, [dxc, dh - 0.002, -nd / 2], [Math.PI / 2, 0, 0], WALL_TILE);
    revealPlane(slots.niche, dw, nd, [dxc, 0.004, -nd / 2], [-Math.PI / 2, 0, 0], WALL_TILE);
    {
      const g = planeUv(track(new THREE.PlaneGeometry(dw, dh)), WALL_TILE);
      slot(slots.niche, g, [dxc, dh / 2, -nd + 0.004]);
    }

    // ── DRZWI UKRYTE: szczelina 3.5 mm + ciemna powierzchnia + profil alu ────
    mesh(box(0.03, dh, 0.05), slotDark, [dx0 + 0.015, dh / 2, -0.033], undefined, false, false);
    mesh(box(0.03, dh, 0.05), slotDark, [dx1 - 0.015, dh / 2, -0.033], undefined, false, false);
    mesh(box(dw, 0.03, 0.05), slotDark, [dxc, dh - 0.015, -0.033], undefined, false, false);
    mesh(box(0.01, dh, 0.006), blackMetal, [dx0 + 0.005, dh / 2, -0.007], undefined, false, false);
    mesh(box(0.01, dh, 0.006), blackMetal, [dx1 - 0.005, dh / 2, -0.007], undefined, false, false);
    mesh(box(dw, 0.01, 0.006), blackMetal, [dxc, dh - 0.005, -0.007], undefined, false, false);
    // Skrzydło: szczelina 3.5 mm po bokach/górze, 8 mm nad podłogą,
    // lico 5 mm przed płaszczyzną ściany, tekstura kontynuuje wzór ściany.
    {
      const lw = dw - 2 * gap;
      const lh = dh - gap - 0.008;
      const g = projectUv(box(lw, lh, leafT, 0.003), new THREE.Vector3(dxc, 0.008 + lh / 2, 0), 0, 1, WALL_TILE);
      const leaf = new THREE.Mesh(g, steel);
      leaf.position.set(dxc, 0.008 + lh / 2, 0.005 - leafT / 2);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      group.add(leaf);
      slots.door.push(leaf);
    }
    // Klamka: jedna pozioma dźwignia 125 mm na wys. 100 cm, rozeta + trzpień (czarny grafit).
    const hx = dx1 - 0.085;
    mesh(track(new THREE.CylinderGeometry(0.013, 0.013, 0.01, 18)), blackMetal, [hx, 1.0, 0.011], [Math.PI / 2, 0, 0], false, false);
    mesh(track(new THREE.CylinderGeometry(0.008, 0.008, 0.022, 12)), blackMetal, [hx, 1.0, 0.021], [Math.PI / 2, 0, 0], false, false);
    mesh(box(0.125, 0.02, 0.016, 0.004), blackMetal, [hx - 0.052, 1.0, 0.032], undefined, false, false);
    // cień kontaktowy drzwi (spód + boki)
    {
      const bottom = new THREE.Mesh(track(new THREE.PlaneGeometry(dw + 0.05, 0.06)), edgeShadowMat);
      bottom.rotation.x = -Math.PI / 2;
      bottom.rotation.z = Math.PI;
      bottom.position.set(dxc, 0.012, 0.035);
      group.add(bottom);
      for (const [sx, rz] of [[dx0 - 0.014, -Math.PI / 2], [dx1 + 0.014, Math.PI / 2]] as const) {
        const side = new THREE.Mesh(track(new THREE.PlaneGeometry(dh, 0.028)), edgeShadowMat);
        side.rotation.z = rz;
        side.position.set(sx, dh / 2, 0.002);
        group.add(side);
      }
    }

    // punkt montażu realnych modeli drzwi (wszystkie warianty względem tego samego punktu)
    const doorAnchor = new THREE.Group();
    doorAnchor.name = 'doorAnchor';
    doorAnchor.position.set(DOOR_CX, 0, 0);
    group.add(doorAnchor);

    // ── BELKI (2, smukłe, przy suficie, od ściany do ściany) ────────────────
    const beamY = H - 0.02 - BEAMS.h / 2;
    for (const zf of BEAMS.zs) {
      const z = zf * depth;
      mesh(box(roomRight - roomLeft, BEAMS.h, BEAMS.w, 0.006), beamMat, [DOOR_CX, beamY, z], undefined, false, true);
    }

    // ── POSTUMENT (jasny kamień) + cień kontaktowy ─────────────────────────
    const plinthMesh = mesh(box(PLINTH.w, PLINTH.h, PLINTH.d, 0.01), steel, [plinthX, PLINTH.h / 2, PLINTH.z]);
    plinthMesh.name = 'plinth';
    {
      const b = new THREE.Mesh(track(new THREE.PlaneGeometry(0.78, 0.78)), blobMat);
      b.rotation.x = -Math.PI / 2;
      b.position.set(plinthX, 0.011, PLINTH.z);
      group.add(b);
    }

    return {
      group, slots, floorMesh, leftWall, rightWall, plinthMesh,
      dispose: () => dispose.forEach((d) => d.dispose()),
    };
  }, [bC, bN, bR, bAo, mC, mN, mR, mAo, wC, wB, wR, W, H, roomLeft, roomRight, depth, dx0, dx1, plinthX]);

  useEffect(() => () => built.dispose(), [built]);

  // ── MATERIAŁY wariantowe (podmiana + dispose poprzednich) ─────────────────
  const prevMats = useRef<THREE.Material[]>([]);
  useEffect(() => {
    const wallTint = wallColor ?? variant.wallTint;
    // ściana drzwiowa (kolor użytkownika) - widoczna struktura, matowa
    const wallMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: wallTint, brighten: variant.wallBrighten,
      saturation: 0.14, contrast: 0.72, normalScale: 0.55, roughness: 0.87,
      aoIntensity: 0.5, breakup: 0.07,
    });
    // lewa ściana - cegła (przygaszona), zanikalna
    const brickMat = buildPbrMaterial(brickSet, {
      repeat: [1, 1], tint: variant.brickTint, saturation: 0.9, brighten: variant.brickBrighten,
      contrast: 0.95, normalScale: 0.8, aoIntensity: 0.75, roughness: 0.95, breakup: 0.1,
    });
    brickMat.transparent = true;
    // prawa ściana - ciemny beton (nie czerń), zanikalna
    const wallDarkMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: variant.sideTint, brighten: 1.0,
      saturation: 0.12, contrast: 0.6, normalScale: 0.6, roughness: 0.9,
      aoIntensity: 0.5, breakup: 0.06,
    });
    wallDarkMat.transparent = true;
    // podłoga: góra drewno (odsycone, przyciemnione), boki ciemny beton
    const woodRepeat: [number, number] = [W / WOOD_TILE, (depth + STAGE.wall) / WOOD_TILE];
    const woodMat = buildPbrMaterial(woodSet, {
      repeat: woodRepeat, tint: variant.floorTint, brighten: variant.floorBrighten,
      saturation: 0.78, bumpScale: 0.015, roughness: 0.76, envMapIntensity: 0.35, rotate90: true,
    });
    const floorSideMat = new THREE.MeshStandardMaterial({ color: variant.sideTint, roughness: 0.9, metalness: 0 });
    const floorMats = [floorSideMat, floorSideMat, woodMat, floorSideMat, floorSideMat, floorSideMat];
    // sufit - ciemnoszary beton (nie czerń)
    const ceilMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: variant.ceilingTint, brighten: 1.0,
      saturation: 0.12, contrast: 0.55, normalScale: 0.4, roughness: 0.9, aoIntensity: 0.4, breakup: 0.04,
    });
    // wnęka drzwiowa - lekko ciemniejsza niż ściana
    const nicheMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: wallTint, brighten: variant.wallBrighten * 0.8,
      saturation: 0.14, contrast: 0.68, normalScale: 0.5, roughness: 0.9, aoIntensity: 0.4,
    });
    // skrzydło - kolor ściany, minimalnie inne roughness (czytelna krawędź)
    const doorMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: wallTint, brighten: variant.wallBrighten * 1.02,
      saturation: 0.14, contrast: 0.72, normalScale: 0.5, roughness: 0.78, aoIntensity: 0.4,
    });
    // postument - jasny kamień/trawertyn (matowy, subtelny relief)
    const plinthMat = buildPbrMaterial(microSet, {
      repeat: [1.7, 1.7], tint: variant.plinthTint, brighten: variant.plinthBrighten,
      saturation: 0.18, contrast: 0.7, normalScale: 0.35, roughness: 0.82, aoIntensity: 0.5,
    });

    for (const m of built.slots.wall) m.material = wallMat;
    for (const m of built.slots.ceil) m.material = ceilMat;
    for (const m of built.slots.niche) m.material = nicheMat;
    for (const m of built.slots.door) m.material = doorMat;
    built.leftWall.material = brickMat;
    built.rightWall.material = wallDarkMat;
    built.floorMesh.material = floorMats;
    built.plinthMesh.material = plinthMat;

    const created: THREE.Material[] = [wallMat, brickMat, wallDarkMat, woodMat, floorSideMat, ceilMat, nicheMat, doorMat, plinthMat];
    const toDispose = prevMats.current;
    prevMats.current = created;
    for (const m of toDispose) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'bumpMap'] as const) {
        (m as THREE.MeshStandardMaterial)[k]?.dispose();
      }
      m.dispose();
    }
  }, [variant, wallColor, built, brickSet, microSet, woodSet, W, depth]);

  useEffect(() => () => { for (const m of prevMats.current) m.dispose(); }, []);

  const spotTarget: [number, number, number] = [dx1 - 0.1, 1.15, 0]; // plama na prawej części drzwi/klamce

  return (
    <group>
      {/* tło sceny: nigdy czysta czerń */}
      <color attach="background" args={['#151515']} />
      <primitive object={built.group} />
      <SculptureModel url={`${modelsBase}/czarna_rzezba_abstrakcyjna.glb`} x={plinthX} z={PLINTH.z} topY={PLINTH.h} />
      <CeilingSpot x={spotX} z={BEAMS.zs[0] * depth} ceilingY={H} headY={H - 0.42} aim={spotTarget} />
      <WallFade left={[built.leftWall]} right={[built.rightWall]} roomLeft={roomLeft} roomRight={roomRight} />
      <CameraClamp roomLeft={roomLeft} roomRight={roomRight} h={H} depth={depth} />

      {/* Przygaszone środowisko (subtelne odbicia na metalu/podłodze). */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#202225']} />
        <Lightformer position={[-5, 2.5, 3]} scale={[3.4, 3.6, 1]} intensity={1.5} color="#f1e9dd" />
        <Lightformer position={[5, 3, 2]} scale={[3.6, 3.6, 1]} intensity={0.9} color="#a6acb2" />
        <Lightformer position={[0, 5, 3]} scale={[7, 3.6, 1]} rotation={[Math.PI / 2, 0, 0]} intensity={0.6} color="#8f9296" />
      </Environment>

      {/* Oświetlenie 3-warstwowe. A: ogólne (czytelność wszystkich powierzchni). */}
      <hemisphereLight intensity={1.55} color="#d3d6da" groundColor="#6c6255" />
      {/* B: miękkie światło od otwartego frontu - jedyne rzucające cień. */}
      <FrontKeyLight color="#f4eee3" intensity={1.65} tx={DOOR_CX} depth={depth} />
      {/* fill od prawej - prawa ściana nie może być czarną plamą */}
      <directionalLight position={[roomRight + 1.4, 2.5, depth * 0.55 + 1.2]} intensity={0.55} color="#e9edf1" />
      {/* C: reflektor na drzwi - szeroka miękka plama, bez przepalenia, bez cienia. */}
      <SpotOnDoor color={variant.sunColor} intensity={variant.sunIntensity} pos={[spotX, H - 0.42, BEAMS.zs[0] * depth]} target={spotTarget} />
    </group>
  );
}

/** Miękkie światło kierunkowe od frontu - jedyne dynamiczne światło z cieniem. */
function FrontKeyLight({ color, intensity, tx, depth }: { color: string; intensity: number; tx: number; depth: number }) {
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
      position={[tx + 0.2, 3.5, depth * 0.9]}
      intensity={intensity}
      color={color}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-radius={7}
      shadow-bias={-0.0004}
      shadow-camera-left={-6}
      shadow-camera-right={6}
      shadow-camera-top={5}
      shadow-camera-bottom={-2}
      shadow-camera-far={24}
    />
  );
}

/** Reflektor kierowany na drzwi - miękka plama, wysoka penumbra, bez cienia. */
function SpotOnDoor({ color, intensity, pos, target }: { color: string; intensity: number; pos: [number, number, number]; target: [number, number, number] }) {
  const t = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    t.position.set(...target);
    t.updateMatrixWorld();
  }, [t, target]);
  return (
    <>
      <primitive object={t} />
      <spotLight
        position={pos}
        target={t}
        color={color}
        intensity={intensity}
        angle={0.6}
        penumbra={0.95}
        decay={1.3}
        distance={0}
      />
    </>
  );
}
