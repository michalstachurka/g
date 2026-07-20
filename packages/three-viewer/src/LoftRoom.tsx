'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useLoader } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { buildPbrMaterial, type PbrTextureSet } from './pbr';
import type { LoftVariant } from './loft-variants';

/**
 * Minimalistyczne wnętrze loftowe jako neutralne tło konfiguratora drzwi.
 * Kompletna, zamknięta bryła (podłoga, sufit, 4 ściany z realną grubością),
 * czerwona cegła na ścianie z oknem, szary mikrocement na ścianie drzwiowej,
 * ciemniejsza podłoga, betonowy sufit, 2 stalowe belki tuż pod stropem.
 *
 * Architektura: GEOMETRIA budowana jest raz (useMemo na teksturach); zmiana
 * wariantu podmienia tylko MATERIAŁY zależne od wariantu (cegła/ściana/podłoga/
 * sufit) i zwalnia poprzednie. Kamerą steruje strona (OrbitControls) - nie jest
 * resetowana przy zmianie wariantu.
 *
 * ── REGULACJA (wszystko poniżej) ─────────────────────────────────────────────
 *   ROOM         - rozmiar pomieszczenia i grubości przegród,
 *   DOOR         - otwór i punkt montażu drzwi (doorMount),
 *   WINDOW       - otwór, wnęka i profile okna,
 *   BEAM         - liczba, wysokość i przekrój belek,
 *   *_TILE       - powtarzanie tekstur (metry świata na kafel),
 *   światło      - w JSX na dole (WindowLight, hemisphereLight, reflektory).
 */

// ── Wymiary (metry) - skala mieszkania, nie magazynu ─────────────────────────
const ROOM = { W: 5.4, H: 2.95, D: 5.2, wall: 0.2, ceil: 0.25, floor: 0.3 };
const DOOR = { w: 0.9, h: 2.1, x0: 2.0, niche: 0.26 }; // otwór 90x210 + głębokość wnęki
const WINDOW = { z0: 1.3, z1: 4.0, y0: 0.9, y1: 2.45 }; // otwór w ścianie ceglanej
const BEAM = { zs: [1.55, 3.55], h: 0.15, flange: 0.13, web: 0.02, drop: 0.13 }; // 2 belki

// metry świata na jeden kafel tekstury (realna skala, bez rozciągania)
const BRICK_TILE = 1.85; // ~25 rzędów cegły/kafel -> ~7.5 cm na rząd
const WALL_TILE = 2.6;
const FLOOR_TILE = 3.0;
const CEIL_TILE = 3.4;
const WOOD_TILE = 1.6;

type UvAxis = 0 | 1 | 2; // x=0, y=1, z=2

/** Rzutowanie UV wg pozycji ŚWIATA (ciągłość tekstury między sąsiednimi bryłami)
 *  + drugi zestaw uv1 wymagany przez aoMap. */
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

/** UV płaszczyzny (ościeża) z lokalnych osi powierzchni - bez pasków na cienkich
 *  licach. Zawsze poprawne niezależnie od obrotu płaszczyzny. */
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
  floor: THREE.Mesh[];
  ceil: THREE.Mesh[];
  niche: THREE.Mesh[]; // tylna ściana wnęki drzwiowej (ciemniejszy mikrocement)
}

/** Gradientowe "niebo" za oknem - daje głębię i naturalne światło (nie świeci na biało). */
function makeSkyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#aebfce'); // chłodne niebo u góry (nie biel)
  g.addColorStop(0.5, '#c6cdd2');
  g.addColorStop(0.78, '#d3cdc2');
  g.addColorStop(1, '#c3b8a8'); // cieplejsza mgła przy horyzoncie
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Miękki, okrągły cień kontaktowy (blob) pod meble - tani zamiennik SSAO. */
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

export interface LoftRoomProps {
  variant: LoftVariant;
  texturesBase?: string;
}

export function LoftRoom({ variant, texturesBase = '/textures' }: LoftRoomProps) {
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

  // ── GEOMETRIA + materiały stałe (raz na komplet tekstur) ──────────────────
  const built = useMemo(() => {
    const group = new THREE.Group();
    const dispose: { dispose: () => void }[] = [];
    const slots: Slots = { brick: [], wall: [], floor: [], ceil: [], niche: [] };
    const { W, H, D, wall: T, ceil: TC, floor: TF } = ROOM;

    const track = <G extends THREE.BufferGeometry>(g: G) => (dispose.push(g), g);
    const box = (w: number, h: number, d: number, r = 0) =>
      track(r > 0 ? (new RoundedBoxGeometry(w, h, d, 2, r) as THREE.BufferGeometry) : new THREE.BoxGeometry(w, h, d));

    // materiały stałe, współdzielone (niezależne od wariantu). Grafit, nie czerń.
    const steel = new THREE.MeshStandardMaterial({ color: '#26272b', roughness: 0.48, metalness: 0.85, envMapIntensity: 0.85 });
    const graphite = new THREE.MeshStandardMaterial({ color: '#2a2b2f', roughness: 0.42, metalness: 0.75, envMapIntensity: 0.9 });
    const sill = new THREE.MeshStandardMaterial({ color: '#c4c1ba', roughness: 0.82, metalness: 0 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#dfe6ea', roughness: 0.13, metalness: 0, transparent: true, opacity: 0.26,
      envMapIntensity: 1.3, clearcoat: 0.4, clearcoatRoughness: 0.2,
    });
    const sky = new THREE.MeshBasicMaterial({ map: makeSkyTexture() });
    // tkaniny i meble (tanie: wysoki roughness, bez map włókien)
    const fabric = new THREE.MeshStandardMaterial({ color: '#6d675e', roughness: 0.95, metalness: 0 }); // taupe/ciepły szary
    const rug = new THREE.MeshStandardMaterial({ color: '#98917f', roughness: 0.98, metalness: 0 }); // greige
    const wood = new THREE.MeshStandardMaterial({ color: '#5a4632', roughness: 0.55, metalness: 0 }); // ciemny dąb
    const leaf = new THREE.MeshStandardMaterial({ color: '#5c6b52', roughness: 0.85, metalness: 0 }); // zgaszona zieleń
    const pot = new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 0.85, metalness: 0 });
    const blobMat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, opacity: 0.42, depthWrite: false, color: '#000000' });
    dispose.push(steel, graphite, sill, glass, glass.map!, sky, sky.map!, fabric, rug, wood, leaf, pot, blobMat, blobMat.map!);

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

    // slot-mesh: materiał zależny od wariantu przypisywany później
    const slot = (
      arr: THREE.Mesh[], geo: THREE.BufferGeometry, pos: [number, number, number],
      rot?: [number, number, number],
    ) => {
      const m = mesh(geo, steel /* placeholder */, pos, rot);
      arr.push(m);
      return m;
    };

    // ── PODŁOGA i SUFIT (płyty z grubością) ────────────────────────────────
    {
      const g = projectUv(box(W, TF, D), new THREE.Vector3(W / 2, 0, D / 2), 0, 2, FLOOR_TILE);
      slot(slots.floor, g, [W / 2, -TF / 2, D / 2]);
    }
    {
      const g = projectUv(box(W, TC, D), new THREE.Vector3(W / 2, 0, D / 2), 0, 2, CEIL_TILE);
      slot(slots.ceil, g, [W / 2, H + TC / 2, D / 2]);
    }
    // listwa/dylatacja przy styku ściana-podłoga (perymetr, dyskretna, ciemna)
    const skirt = new THREE.MeshStandardMaterial({ color: '#3a3a3c', roughness: 0.9 });
    dispose.push(skirt);
    mesh(box(W, 0.03, 0.02), skirt, [W / 2, 0.015, 0.02], undefined, false, true);
    mesh(box(0.02, 0.03, D), skirt, [0.02, 0.015, D / 2], undefined, false, true);
    mesh(box(0.02, 0.03, D), skirt, [W - 0.02, 0.015, D / 2], undefined, false, true);

    // ── ŚCIANA DRZWIOWA (mikrocement, z=0) z otworem drzwiowym ──────────────
    const dw = DOOR.w, dh = DOOR.h, dx0 = DOOR.x0, dx1 = DOOR.x0 + DOOR.w, dxc = DOOR.x0 + DOOR.w / 2;
    const wallSeg = (x: number, y: number, w: number, h: number) => {
      const g = projectUv(box(w, h, T), new THREE.Vector3(x, y, 0), 0, 1, WALL_TILE);
      slot(slots.wall, g, [x, y, -T / 2]);
    };
    // Grubość ścian (T) sama tworzy ościeże otworu - boczne/górna ściana boksów
    // to lico glifu, bez osobnych brył (brak z-fightingu).
    wallSeg(dx0 / 2, H / 2, dx0, H); // lewy fragment
    wallSeg((dx1 + W) / 2, H / 2, W - dx1, H); // prawy fragment
    wallSeg(dxc, (dh + H) / 2, dw, H - dh); // nadproże
    // ościeże drzwi jako osobne płaszczyzny (poprawne UV, mikrocement)
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
    // WNĘKA drzwiowa: ościeże na pełną głębokość + tylna ściana + podłoga wnęki,
    // dzięki czemu otwór to czytelna wnęka, nie czarna dziura.
    const nd = DOOR.niche;
    revealPlane(slots.wall, nd, dh, [dx0 + 0.002, dh / 2, -nd / 2], [0, Math.PI / 2, 0], WALL_TILE); // lewy glif
    revealPlane(slots.wall, nd, dh, [dx1 - 0.002, dh / 2, -nd / 2], [0, -Math.PI / 2, 0], WALL_TILE); // prawy glif
    revealPlane(slots.wall, dw, nd, [dxc, dh - 0.002, -nd / 2], [Math.PI / 2, 0, 0], WALL_TILE); // nadproże (spód)
    revealPlane(slots.floor, dw, nd, [dxc, 0.004, -nd / 2], [-Math.PI / 2, 0, 0], FLOOR_TILE); // podłoga wnęki
    // tylna ściana wnęki (ciemniejszy mikrocement - wrażenie korytarza)
    {
      const g = planeUv(track(new THREE.PlaneGeometry(dw, dh)), WALL_TILE);
      slot(slots.niche, g, [dxc, dh / 2, -nd + 0.004]);
    }

    // punkt montażu drzwi - wspólny dla wszystkich wariantów skrzydeł
    const doorMount = new THREE.Group();
    doorMount.name = 'doorMount';
    doorMount.position.set(dxc, 0, 0); // lico ściany drzwiowej, środek progu
    group.add(doorMount);

    // ── ŚCIANA PRAWA i TYLNA (mikrocement, pełne) ──────────────────────────
    {
      const gR = projectUv(box(T, H, D), new THREE.Vector3(W, H / 2, D / 2), 2, 1, WALL_TILE);
      slot(slots.wall, gR, [W + T / 2, H / 2, D / 2]);
      const gB = projectUv(box(W, H, T), new THREE.Vector3(W / 2, H / 2, D), 0, 1, WALL_TILE);
      slot(slots.wall, gB, [W / 2, H / 2, D + T / 2]);
    }

    // ── ŚCIANA CEGLANA (x=0) z otworem okiennym ────────────────────────────
    const { z0: wz0, z1: wz1, y0: wy0, y1: wy1 } = WINDOW;
    const brickSeg = (z: number, y: number, d: number, h: number) => {
      const g = projectUv(box(T, h, d), new THREE.Vector3(0, y, z), 2, 1, BRICK_TILE);
      slot(slots.brick, g, [-T / 2, y, z]);
    };
    brickSeg(wz0 / 2, H / 2, wz0, H); // przed oknem
    brickSeg((wz1 + D) / 2, H / 2, D - wz1, H); // za oknem
    brickSeg((wz0 + wz1) / 2, wy0 / 2, wz1 - wz0, wy0); // pod oknem
    brickSeg((wz0 + wz1) / 2, (wy1 + H) / 2, wz1 - wz0, H - wy1); // nad oknem
    // ościeże okna (cegła) - boczne glify + góra, poprawne UV
    revealPlane(slots.brick, T, wy1 - wy0, [-T / 2, (wy0 + wy1) / 2, wz0 + 0.002], [0, 0, 0], BRICK_TILE);
    revealPlane(slots.brick, T, wy1 - wy0, [-T / 2, (wy0 + wy1) / 2, wz1 - 0.002], [0, Math.PI, 0], BRICK_TILE);
    revealPlane(slots.brick, T, wz1 - wz0, [-T / 2, wy1 - 0.002, (wz0 + wz1) / 2], [Math.PI / 2, Math.PI / 2, 0], BRICK_TILE);

    // parapet betonowy z lekkim bevelem
    mesh(box(T + 0.1, 0.06, wz1 - wz0 + 0.1, 0.02), sill, [-T / 2 + 0.02, wy0 - 0.03, (wz0 + wz1) / 2]);

    // ── OKNO: rama + szprosy (stal, bevel), szyba, niebo ───────────────────
    const wxc = -0.02; // profile tuż przy licu wnęki
    const winW = wz1 - wz0, winH = wy1 - wy0, fyc = (wy0 + wy1) / 2, fzc = (wz0 + wz1) / 2;
    const prof = (h: number, d: number, y: number, z: number) => mesh(box(0.06, h, d, 0.008), steel, [wxc, y, z]);
    prof(0.07, winW, wy0 + 0.035, fzc);
    prof(0.07, winW, wy1 - 0.035, fzc);
    prof(winH, 0.07, fyc, wz0 + 0.035);
    prof(winH, 0.07, fyc, wz1 - 0.035);
    for (let i = 1; i <= 2; i++) prof(winH, 0.05, fyc, wz0 + (winW * i) / 3); // pionowe szprosy
    prof(0.05, winW, fyc, fzc); // poziomy szpros
    // szyba (fizyczna, lekko za profilami)
    mesh(box(0.01, winH, winW), glass, [wxc + 0.03, fyc, fzc], undefined, false, false);
    // niebo za oknem
    mesh(track(new THREE.PlaneGeometry(winW + 1.2, winH + 1.2)), sky, [-1.1, fyc, fzc], [0, Math.PI / 2, 0], false, false);

    // ── BELKI STALOWE (2, tuż pod sufitem, dwuteownik, płyty montażowe) ─────
    const beamY = H - BEAM.drop;
    for (const z of BEAM.zs) {
      // dwuteownik: górna i dolna półka + środnik, między ścianami (nie przez nie)
      const x0 = 0.06, x1 = W - 0.06, len = x1 - x0, cx = (x0 + x1) / 2;
      mesh(box(len, 0.022, BEAM.flange, 0.004), steel, [cx, beamY + BEAM.h / 2, z]);
      mesh(box(len, 0.022, BEAM.flange, 0.004), steel, [cx, beamY - BEAM.h / 2, z]);
      mesh(box(len, BEAM.h - 0.04, BEAM.web, 0.003), steel, [cx, beamY, z]);
      // płyty montażowe przy ścianach + śruby
      for (const [px, sx] of [[0.01, 1] as const, [W - 0.01, -1] as const]) {
        mesh(box(0.02, BEAM.h + 0.08, BEAM.flange + 0.06, 0.006), steel, [px, beamY, z]);
        for (const dy of [-1, 1]) for (const dz of [-1, 1])
          mesh(track(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8)), steel,
            [px + sx * 0.012, beamY + dy * (BEAM.h / 2 - 0.005), z + dz * (BEAM.flange / 2 - 0.02)],
            [0, 0, Math.PI / 2], false, false);
      }
    }

    // szynoprzewód + 2 reflektory (subtelne, neutralne) pod sufitem przy ścianie drzwiowej
    mesh(box(1.8, 0.04, 0.05, 0.008), steel, [dxc, H - 0.09, 1.4]);
    for (const dx of [-0.5, 0.5]) {
      mesh(track(new THREE.CylinderGeometry(0.05, 0.06, 0.11, 16)), steel, [dxc + dx, H - 0.2, 1.4], [Math.PI / 2.6, 0, 0], true, false);
    }

    // ── STREFA SALONOWA (spójny zestaw, prowadzi wzrok do drzwi) ────────────
    // blob = miękki cień kontaktowy pod meblem (tani, zamiast SSAO)
    const blob = (x: number, z: number, w: number, d: number) =>
      mesh(track(new THREE.PlaneGeometry(w, d)), blobMat, [x, 0.012, z], [-Math.PI / 2, 0, 0], false, false);

    // Sofa przy prawej ścianie (x=W), tyłem do niej, twarzą w głąb pokoju (-x).
    // Bliżej przodu (mniejsze z) -> strefa salonu wypełnia pierwszy plan.
    const sofaX = W - 0.48, sofaZ = 2.0, sofaW = 1.9; // szer. wzdłuż Z
    blob(sofaX - 0.15, sofaZ, 1.5, sofaW + 0.5);
    mesh(box(0.85, 0.18, sofaW, 0.06), fabric, [sofaX, 0.24, sofaZ]); // podstawa siedziska
    mesh(box(0.28, 0.5, sofaW, 0.08), fabric, [sofaX + 0.34, 0.45, sofaZ]); // oparcie
    for (let i = -1; i <= 1; i++) mesh(box(0.7, 0.16, sofaW / 3 - 0.04, 0.07), fabric, [sofaX - 0.03, 0.4, sofaZ + i * (sofaW / 3)]); // poduszki siedziska
    for (const s of [-1, 1]) {
      mesh(box(0.85, 0.42, 0.22, 0.07), fabric, [sofaX, 0.42, sofaZ + s * (sofaW / 2 + 0.11)]); // podłokietniki
      mesh(box(0.6, 0.5, sofaW / 3 - 0.06, 0.08), fabric, [sofaX + 0.28, 0.62, sofaZ + s * (sofaW / 3)]); // poduszki oparcia
    }
    for (const [dx, dz] of [[-0.35, -sofaW / 2 + 0.1], [-0.35, sofaW / 2 - 0.1], [0.3, -sofaW / 2 + 0.1], [0.3, sofaW / 2 - 0.1]] as const)
      mesh(track(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8)), graphite, [sofaX + dx, 0.08, sofaZ + dz], undefined, false, false); // nóżki

    // Dywan pod strefą (greige, płaski) - kotwiczy meble.
    mesh(box(2.0, 0.012, 2.4, 0.004), rug, [sofaX - 0.9, 0.008, sofaZ], undefined, false, true);

    // Stolik kawowy przed sofą (blat drewno, konstrukcja grafit).
    const tX = sofaX - 1.05, tZ = sofaZ;
    blob(tX, tZ, 1.3, 0.9);
    mesh(box(1.0, 0.05, 0.55, 0.02), wood, [tX, 0.38, tZ]);
    for (const [ex, ez] of [[-0.42, -0.22], [-0.42, 0.22], [0.42, -0.22], [0.42, 0.22]] as const)
      mesh(box(0.04, 0.36, 0.04, 0.008), graphite, [tX + ex, 0.18, tZ + ez], undefined, false, false);

    // Lampa podłogowa (łuk, grafit) przy dalszym końcu sofy - ciepły akcent.
    const lampX = sofaX + 0.1, lampZ = sofaZ + sofaW / 2 + 0.45;
    blob(lampX, lampZ, 0.5, 0.5);
    mesh(track(new THREE.CylinderGeometry(0.16, 0.2, 0.03, 20)), graphite, [lampX, 0.02, lampZ], undefined, false, false); // podstawa
    mesh(track(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 10)), graphite, [lampX, 0.77, lampZ], undefined, true, false); // słup
    mesh(track(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 10)), graphite, [lampX - 0.42, 1.5, lampZ], [0, 0, Math.PI / 2.2], false, false); // ramię
    mesh(track(new THREE.CylinderGeometry(0.11, 0.13, 0.16, 18, 1, true)), graphite, [lampX - 0.78, 1.4, lampZ], undefined, false, false); // klosz

    // Element pionowy w dalszym rogu: wysoka roślina w prostej donicy.
    const plX = W - 0.5, plZ = 4.5;
    blob(plX, plZ, 0.6, 0.6);
    mesh(track(new THREE.CylinderGeometry(0.16, 0.13, 0.42, 20, 1, false)), pot, [plX, 0.21, plZ], undefined, true, true);
    mesh(track(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8)), wood, [plX, 0.6, plZ], undefined, false, false); // pień
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      mesh(box(0.03, 0.7, 0.12, 0.01), leaf, [plX + Math.cos(a) * 0.12, 1.0 + (i % 2) * 0.12, plZ + Math.sin(a) * 0.12], [0.25 * Math.cos(a), a, 0.35 * Math.sin(a)], false, false); // liście
    }

    // Grzejnik loftowy pod oknem - żeberka jako InstancedMesh (1 draw call).
    const radZ0 = (WINDOW.z0 + WINDOW.z1) / 2 - 0.7;
    mesh(box(0.05, 0.52, 1.5, 0.01), graphite, [0.14, 0.44, radZ0 + 0.7]); // korpus
    {
      const finGeo = box(0.09, 0.48, 0.02, 0.005);
      const fins = new THREE.InstancedMesh(finGeo, graphite, 15);
      fins.castShadow = true;
      const m = new THREE.Matrix4();
      for (let i = 0; i < 15; i++) {
        m.setPosition(0.15, 0.44, radZ0 + 0.06 + i * 0.093);
        fins.setMatrixAt(i, m);
      }
      group.add(fins);
    }

    return {
      group,
      slots,
      dispose: () => dispose.forEach((d) => d.dispose()),
    };
  }, [bC, bN, bR, bAo, mC, mN, mR, mAo, wC, wB, wR]);

  useEffect(() => () => built.dispose(), [built]);

  // ── MATERIAŁY zależne od wariantu (podmiana + zwolnienie poprzednich) ──────
  const prevMats = useRef<THREE.Material[]>([]);
  useEffect(() => {
    // Cegła: breakup rozbija powtarzalność; AO subtelne (postarzana, nie brudna).
    const brickMat = buildPbrMaterial(brickSet, { repeat: [1, 1], tint: variant.brickTint, saturation: 1, breakup: 0.14, aoIntensity: 0.7, roughness: 0.95 });
    // Ściana mikrocement: subtelny normal (bumpScale niski przez roughness),
    // breakup przeciw monotonii; wyższy roughness niż podłoga.
    const wallMat = buildPbrMaterial(microSet, { repeat: [1, 1], tint: variant.wallTint, brighten: variant.wallBrighten, saturation: 0.12, roughness: 0.9, aoIntensity: 0.45, breakup: 0.1 });
    // podłoga ma zapieczone UV w skali FLOOR_TILE; deski gęstsze -> mnożnik repeat
    const woodRepeat = FLOOR_TILE / WOOD_TILE;
    const floorMat =
      variant.floor === 'wood'
        ? buildPbrMaterial(woodSet, { repeat: [woodRepeat, woodRepeat], tint: variant.floorTint, bumpScale: 0.02, roughness: 0.55 })
        : // podłoga: gładsza od ścian + subtelne odbicie env (bez połysku), inna skala/ton
          buildPbrMaterial(microSet, { repeat: [1, 1], tint: variant.floorTint, brighten: variant.floorBrighten, saturation: 0.14, roughness: 0.55, aoIntensity: 0.4, breakup: 0.08, envMapIntensity: 0.55 });
    const ceilMat = buildPbrMaterial(microSet, { repeat: [1, 1], tint: variant.ceilingTint, brighten: variant.ceilingBrighten, saturation: 0.1, roughness: 0.96, aoIntensity: 0.4, breakup: 0.06 });
    // tylna ściana wnęki: ten sam mikrocement, ciemniejszy + delikatna emisja,
    // żeby wnęka nigdy nie była czarną dziurą (czyta się jako szary korytarz).
    const nicheMat = buildPbrMaterial(microSet, { repeat: [1, 1], tint: variant.wallTint, brighten: variant.wallBrighten * 0.85, saturation: 0.12, roughness: 0.92, aoIntensity: 0.5 });
    nicheMat.emissive = new THREE.Color('#31333a');
    nicheMat.emissiveIntensity = 0.55;

    for (const m of built.slots.brick) m.material = brickMat;
    for (const m of built.slots.wall) m.material = wallMat;
    for (const m of built.slots.floor) m.material = floorMat;
    for (const m of built.slots.ceil) m.material = ceilMat;
    for (const m of built.slots.niche) m.material = nicheMat;

    const created = [brickMat, wallMat, floorMat, ceilMat, nicheMat];
    const toDispose = prevMats.current;
    prevMats.current = created;
    // zwolnij materiały poprzedniego wariantu (i ich klony tekstur)
    for (const m of toDispose) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'bumpMap'] as const) {
        (m as THREE.MeshStandardMaterial)[k]?.dispose();
      }
      m.dispose();
    }
  }, [variant, built, brickSet, microSet, woodSet]);

  useEffect(() => () => { for (const m of prevMats.current) m.dispose(); }, []);

  return (
    <group>
      <primitive object={built.group} />

      {/* Proceduralne środowisko (bez pobierania HDR) - miękkie odbicia i wypełnienie. */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#2a2f36']} />
        <Lightformer position={[-6, 2.2, 3]} scale={[3.4, 4, 1]} intensity={3.0} color="#f2f5f8" />
        <Lightformer position={[6, 3, 3]} scale={[4, 4, 1]} intensity={0.7} color="#a6acb2" />
        <Lightformer position={[0, 5, 3]} scale={[8, 4, 1]} rotation={[Math.PI / 2, 0, 0]} intensity={0.55} color="#8b8e92" />
      </Environment>

      {/* Światło dzienne z okna (jedyne rzucające cień) + miękkie wypełnienie,
          więcej średnich tonów, brak zlania w czerń. */}
      <hemisphereLight intensity={1.65} color="#eef1f4" groundColor="#9a9790" />
      <WindowLight color={variant.sunColor} intensity={variant.sunIntensity} />
      <directionalLight position={[5, 2.6, 5]} intensity={0.65} color="#e7ecf1" />
      {/* ciepły akcent z lampy podłogowej (subtelny, nie dominuje nad dniem) */}
      <pointLight position={[4.2, 1.35, 3.35]} intensity={4} distance={4} decay={2} color="#ffd9a0" castShadow={false} />
      {/* subtelne, neutralne reflektory z szyny */}
      <spotLight position={[DOOR.x0 + DOOR.w / 2 - 0.5, ROOM.H - 0.2, 1.4]} target-position={[DOOR.x0, 1.1, 0]} angle={0.6} penumbra={0.8} intensity={6} distance={6} color="#f2f3f5" castShadow={false} />
      <spotLight position={[DOOR.x0 + DOOR.w / 2 + 0.5, ROOM.H - 0.2, 1.4]} target-position={[DOOR.x0 + DOOR.w, 1.1, 0]} angle={0.6} penumbra={0.8} intensity={6} distance={6} color="#f2f3f5" castShadow={false} />
    </group>
  );
}

/** Kierunkowe światło "z okna" (cel ustawiany ręcznie; miękki cień). */
function WindowLight({ color, intensity }: { color: string; intensity: number }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(ROOM.W * 0.5, 0.4, 3.0);
    l.target.updateMatrixWorld();
  }, []);
  return (
    <directionalLight
      ref={light}
      position={[-6, 3.0, 3.0]}
      intensity={intensity}
      color={color}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-radius={4}
      shadow-bias={-0.0004}
      shadow-camera-left={-9}
      shadow-camera-right={9}
      shadow-camera-top={7}
      shadow-camera-bottom={-2}
      shadow-camera-far={28}
    />
  );
}
