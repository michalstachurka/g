'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { buildPbrMaterial, type PbrTextureSet } from './pbr';
import type { LoftVariant } from './loft-variants';

/**
 * Minimalistyczne wnętrze loftowe - tło do prezentacji drzwi.
 * Zamknięta bryła z grubościami, czerwona cegła przy oknie, szary mikrocement
 * na ścianie drzwiowej, DEMONSTRACYJNE drzwi ukryte (szczelina + klamka),
 * pionowy grzejnik loftowy, jedna rzeźba. Bez mebli.
 *
 * Geometria budowana raz; zmiana wariantu podmienia wyłącznie materiały
 * (i zwalnia poprzednie). Kamera nie jest resetowana przy zmianie wariantu,
 * a CameraBounds ogranicza ją do wnętrza pomieszczenia.
 *
 * ── REGULACJA ────────────────────────────────────────────────────────────────
 *   ROOM             - rozmiar pomieszczenia i grubości przegród,
 *   CAMERA_MARGIN    - minimalny odstęp kamery od przegród (granice ruchu),
 *   DOOR             - pozycja/otwór drzwi (doorMount),
 *   WINDOW / BEAM    - okno i belki,
 *   SCULPTURE        - pozycja rzeźby,
 *   *_TILE           - skala (powtarzanie) tekstur w metrach na kafel,
 *   światła          - JSX na dole (WindowLight + hemisphere + fill),
 *                      moc/temperatura dnia per wariant: sunIntensity/sunColor.
 */

// ── Wymiary (metry) ──────────────────────────────────────────────────────────
const ROOM = { W: 5.4, H: 2.95, D: 5.2, wall: 0.2, ceil: 0.25, floor: 0.3 };
const CAMERA_MARGIN = 0.35; // kamera nie zbliża się do przegród bardziej niż to
const DOOR = { w: 0.9, h: 2.1, x0: 2.0, niche: 0.26, gap: 0.005, leafT: 0.045 };
const WINDOW = { z0: 1.3, z1: 4.0, y0: 0.9, y1: 2.45 };
const BEAM = { zs: [1.55, 3.55], h: 0.15, flange: 0.13, web: 0.02, drop: 0.13 };
const SCULPTURE = { x: ROOM.W - 0.5, z: 4.6 };

// metry świata na jeden kafel tekstury (mniejsze = drobniejszy wzór)
const BRICK_TILE = 1.85; // rząd cegły ~7.5 cm
const WALL_TILE = 1.7; // mikrocement ściana (drobniej = brak wielkich plam)
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
  brick: THREE.Mesh[];
  wall: THREE.Mesh[];
  floor: THREE.Mesh[];
  ceil: THREE.Mesh[];
  niche: THREE.Mesh[];
  door: THREE.Mesh[];
}

/** Niebo za oknem: gradient + mocno rozmyty zarys zabudowy przy horyzoncie. */
function makeSkyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#b7c4d0');
  g.addColorStop(0.55, '#cdd2d6');
  g.addColorStop(0.8, '#d8d2c6');
  g.addColorStop(1, '#c8bfb0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 160, 256);
  // rozmyta sylweta budynków/zieleni (tania - jeden przebieg z blur)
  ctx.filter = 'blur(7px)';
  ctx.fillStyle = 'rgba(96,102,108,0.55)';
  const bl: [number, number, number][] = [[4, 168, 26], [34, 150, 22], [58, 176, 30], [92, 158, 24], [118, 170, 34], [146, 162, 18]];
  for (const [x, y, w] of bl) ctx.fillRect(x, y, w, 256 - y);
  ctx.fillStyle = 'rgba(88,104,84,0.5)';
  for (const x of [16, 74, 128]) {
    ctx.beginPath();
    ctx.arc(x, 196, 16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.filter = 'none';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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

/** Ogranicza kamerę i target do wnętrza pomieszczenia (bez blokowania obrotu). */
function CameraBounds() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  useFrame(() => {
    const m = CAMERA_MARGIN;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, m, ROOM.W - m);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.4, ROOM.H - 0.2);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, m, ROOM.D - m);
    if (controls?.target) {
      const t = controls.target;
      t.x = THREE.MathUtils.clamp(t.x, 0.5, ROOM.W - 0.5);
      t.y = THREE.MathUtils.clamp(t.y, 0.3, ROOM.H - 0.4);
      t.z = THREE.MathUtils.clamp(t.z, 0.05, ROOM.D - 0.5);
    }
  });
  return null;
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

  // ── GEOMETRIA + materiały stałe (raz) ─────────────────────────────────────
  const built = useMemo(() => {
    const group = new THREE.Group();
    const dispose: { dispose: () => void }[] = [];
    const slots: Slots = { brick: [], wall: [], floor: [], ceil: [], niche: [], door: [] };
    const { W, H, D, wall: T, ceil: TC, floor: TF } = ROOM;

    const track = <G extends THREE.BufferGeometry>(g: G) => (dispose.push(g), g);
    const box = (w: number, h: number, d: number, r = 0) =>
      track(r > 0 ? (new RoundedBoxGeometry(w, h, d, 2, r) as THREE.BufferGeometry) : new THREE.BoxGeometry(w, h, d));

    // materiały stałe - grafit/antracyt zamiast czerni, współdzielone
    const steel = new THREE.MeshStandardMaterial({ color: '#303236', roughness: 0.55, metalness: 0.75, envMapIntensity: 0.8 });
    const radiatorMat = new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.65, metalness: 0.35, envMapIntensity: 0.7 });
    const alu = new THREE.MeshStandardMaterial({ color: '#9ea3a8', roughness: 0.35, metalness: 0.85, envMapIntensity: 0.9 });
    const sill = new THREE.MeshStandardMaterial({ color: '#5b5955', roughness: 0.75, metalness: 0.05 });
    const skirt = new THREE.MeshStandardMaterial({ color: '#26272a', roughness: 0.85, metalness: 0.2 });
    // wypełnienie szczeliny drzwiowej: ciemne, ale nie czarne (czytelny obrys)
    const slotDark = new THREE.MeshStandardMaterial({ color: '#17181b', roughness: 0.92, metalness: 0.1 });
    const shellMat = new THREE.MeshStandardMaterial({ color: '#232427', roughness: 0.95, metalness: 0 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#dfe6ea', roughness: 0.13, metalness: 0, transparent: true, opacity: 0.26,
      envMapIntensity: 1.3, clearcoat: 0.4, clearcoatRoughness: 0.2,
    });
    const sky = new THREE.MeshBasicMaterial({ map: makeSkyTexture() });
    // rzeźba: jasny kamień z subtelną strukturą (normal mikrocementu, wyciszony)
    const stone = new THREE.MeshStandardMaterial({ color: '#d6d1c6', roughness: 0.75, metalness: 0 });
    const stoneNormal = mN.clone();
    stoneNormal.wrapS = stoneNormal.wrapT = THREE.RepeatWrapping;
    stoneNormal.repeat.set(0.6, 0.6);
    stoneNormal.colorSpace = THREE.NoColorSpace;
    stone.normalMap = stoneNormal;
    stone.normalScale.set(0.25, 0.25);
    const blobMat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, opacity: 0.35, depthWrite: false, color: '#000000' });
    const edgeShadowMat = new THREE.MeshBasicMaterial({ map: makeEdgeShadowTexture(), transparent: true, opacity: 0.22, depthWrite: false, color: '#000000' });
    dispose.push(steel, radiatorMat, alu, sill, skirt, slotDark, shellMat, glass, sky, sky.map!, stone, stoneNormal, blobMat, blobMat.map!, edgeShadowMat, edgeShadowMat.map!);

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

    // ── SKORUPA ZEWNĘTRZNA: od zewnątrz widać ciemny neutralny monolit,
    //    nie dekoracyjne tekstury ani backface'y wnętrza. Od środka niewidoczna.
    mesh(box(W + 1.0, H + 0.9, D + 1.0), shellMat, [W / 2, H / 2 - 0.05, D / 2], undefined, false, false);

    // ── PODŁOGA i SUFIT (płyty z grubością) ─────────────────────────────────
    slot(slots.floor, projectUv(box(W, TF, D), new THREE.Vector3(W / 2, 0, D / 2), 0, 2, FLOOR_TILE), [W / 2, -TF / 2, D / 2]);
    slot(slots.ceil, projectUv(box(W, TC, D), new THREE.Vector3(W / 2, 0, D / 2), 0, 2, CEIL_TILE), [W / 2, H + TC / 2, D / 2]);

    // cienka szczelina cokołowa (12 mm) zamiast grubej listwy
    mesh(box(W, 0.012, 0.008), skirt, [W / 2, 0.006, 0.004], undefined, false, true);
    mesh(box(0.008, 0.012, D), skirt, [0.004, 0.006, D / 2], undefined, false, true);
    mesh(box(0.008, 0.012, D), skirt, [W - 0.004, 0.006, D / 2], undefined, false, true);
    mesh(box(W, 0.012, 0.008), skirt, [W / 2, 0.006, D - 0.004], undefined, false, true);

    // ── ŚCIANA DRZWIOWA (mikrocement, z=0) z otworem ────────────────────────
    const { w: dw, h: dh, x0: dx0, niche: nd, gap, leafT } = DOOR;
    const dx1 = dx0 + dw;
    const dxc = dx0 + dw / 2;
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

    // ── ŚCIANA PRAWA i TYLNA (mikrocement) ──────────────────────────────────
    slot(slots.wall, projectUv(box(T, H, D), new THREE.Vector3(W, H / 2, D / 2), 2, 1, WALL_TILE), [W + T / 2, H / 2, D / 2]);
    slot(slots.wall, projectUv(box(W, H, T), new THREE.Vector3(W / 2, H / 2, D), 0, 1, WALL_TILE), [W / 2, H / 2, D + T / 2]);

    // ── ŚCIANA CEGLANA (x=0) z oknem ────────────────────────────────────────
    const { z0: wz0, z1: wz1, y0: wy0, y1: wy1 } = WINDOW;
    const brickSeg = (z: number, y: number, d: number, h: number) => {
      slot(slots.brick, projectUv(box(T, h, d), new THREE.Vector3(0, y, z), 2, 1, BRICK_TILE), [-T / 2, y, z]);
    };
    brickSeg(wz0 / 2, H / 2, wz0, H);
    brickSeg((wz1 + D) / 2, H / 2, D - wz1, H);
    brickSeg((wz0 + wz1) / 2, wy0 / 2, wz1 - wz0, wy0);
    brickSeg((wz0 + wz1) / 2, (wy1 + H) / 2, wz1 - wz0, H - wy1);
    // glify okna (cegła, osobne UV płaszczyznowe - bez pionowych rozciągnięć)
    revealPlane(slots.brick, T, wy1 - wy0, [-T / 2, (wy0 + wy1) / 2, wz0 + 0.002], [0, 0, 0], BRICK_TILE);
    revealPlane(slots.brick, T, wy1 - wy0, [-T / 2, (wy0 + wy1) / 2, wz1 - 0.002], [0, Math.PI, 0], BRICK_TILE);
    revealPlane(slots.brick, T, wz1 - wz0, [-T / 2, wy1 - 0.002, (wz0 + wz1) / 2], [Math.PI / 2, Math.PI / 2, 0], BRICK_TILE);

    // parapet: ciemny beton, realna grubość, mały bevel
    mesh(box(T + 0.1, 0.055, wz1 - wz0 + 0.1, 0.008), sill, [-T / 2 + 0.02, wy0 - 0.028, (wz0 + wz1) / 2]);

    // okno: profile stalowe (grafit, bevel), szyba, niebo
    const wxc = -0.02;
    const winW = wz1 - wz0;
    const winH = wy1 - wy0;
    const fyc = (wy0 + wy1) / 2;
    const fzc = (wz0 + wz1) / 2;
    const prof = (h: number, d: number, y: number, z: number) => mesh(box(0.06, h, d, 0.006), steel, [wxc, y, z]);
    prof(0.07, winW, wy0 + 0.035, fzc);
    prof(0.07, winW, wy1 - 0.035, fzc);
    prof(winH, 0.07, fyc, wz0 + 0.035);
    prof(winH, 0.07, fyc, wz1 - 0.035);
    for (let i = 1; i <= 2; i++) prof(winH, 0.05, fyc, wz0 + (winW * i) / 3);
    prof(0.05, winW, fyc, fzc);
    mesh(box(0.01, winH, winW), glass, [wxc + 0.03, fyc, fzc], undefined, false, false);
    mesh(track(new THREE.PlaneGeometry(winW + 1.2, winH + 1.2)), sky, [-1.1, fyc, fzc], [0, Math.PI / 2, 0], false, false);

    // ── BELKI (2, przy suficie, zakończone płytami na ścianach) ─────────────
    const beamY = H - BEAM.drop;
    for (const z of BEAM.zs) {
      const x0b = 0.06;
      const x1b = W - 0.06;
      const len = x1b - x0b;
      const cx = (x0b + x1b) / 2;
      mesh(box(len, 0.022, BEAM.flange, 0.004), steel, [cx, beamY + BEAM.h / 2, z]);
      mesh(box(len, 0.022, BEAM.flange, 0.004), steel, [cx, beamY - BEAM.h / 2, z]);
      mesh(box(len, BEAM.h - 0.04, BEAM.web, 0.003), steel, [cx, beamY, z]);
      for (const px of [0.012, W - 0.012]) {
        mesh(box(0.024, BEAM.h + 0.08, BEAM.flange + 0.06, 0.005), steel, [px, beamY, z]);
      }
    }

    // ── GRZEJNIK PIONOWY (loft) na ścianie ceglanej, obok okna ──────────────
    // 10 pionowych żeber (InstancedMesh), 10 cm nad podłogą, 2 uchwyty, cień.
    {
      const finH = 1.5;
      const finY = 0.1 + finH / 2;
      const zStart = wz1 + 0.34; // odcinek cegły między oknem a ścianą tylną
      const finCount = 10;
      const step = 0.049;
      const finGeo = box(0.055, finH, 0.034, 0.006);
      const fins = new THREE.InstancedMesh(finGeo, radiatorMat, finCount);
      fins.castShadow = true;
      const mm = new THREE.Matrix4();
      for (let i = 0; i < finCount; i++) {
        mm.setPosition(0.085, finY, zStart + i * step);
        fins.setMatrixAt(i, mm);
      }
      group.add(fins);
      const zMid = zStart + ((finCount - 1) * step) / 2;
      for (const y of [0.45, 1.35]) mesh(box(0.06, 0.03, 0.05, 0.004), radiatorMat, [0.03, y, zMid], undefined, false, false);
      // miękki cień za grzejnikiem
      const sh = new THREE.Mesh(track(new THREE.PlaneGeometry(0.62, 1.7)), blobMat);
      sh.rotation.y = Math.PI / 2;
      sh.position.set(0.012, finY, zMid);
      group.add(sh);
    }

    // ── RZEŹBA: postument + abstrakcyjna bryła z jasnego kamienia ───────────
    {
      const b = new THREE.Mesh(track(new THREE.PlaneGeometry(0.7, 0.7)), blobMat);
      b.rotation.x = -Math.PI / 2;
      b.position.set(SCULPTURE.x, 0.012, SCULPTURE.z);
      group.add(b);
      mesh(box(0.32, 0.58, 0.32, 0.008), stone, [SCULPTURE.x, 0.29, SCULPTURE.z]);
      mesh(track(new THREE.CapsuleGeometry(0.095, 0.2, 4, 16)), stone, [SCULPTURE.x, 0.77, SCULPTURE.z], [0, 0, 0.16]);
      mesh(track(new THREE.IcosahedronGeometry(0.075, 1)), stone, [SCULPTURE.x + 0.04, 0.95, SCULPTURE.z - 0.02], undefined, true, false);
    }

    return { group, slots, dispose: () => dispose.forEach((d) => d.dispose()) };
  }, [bC, bN, bR, bAo, mC, mN, mR, mAo, wC, wB, wR]);

  useEffect(() => () => built.dispose(), [built]);

  // ── MATERIAŁY wariantowe (podmiana + dispose poprzednich) ─────────────────
  const prevMats = useRef<THREE.Material[]>([]);
  useEffect(() => {
    // cegła: mniej nasycona i ciemniejsza, wyciszony relief
    const brickMat = buildPbrMaterial(brickSet, {
      repeat: [1, 1], tint: variant.brickTint, saturation: 0.83, brighten: 0.92,
      contrast: 0.92, normalScale: 0.8, aoIntensity: 0.7, roughness: 0.95, breakup: 0.12,
    });
    // mikrocement ściana: spłaszczony kontrast, połowa normal mapy, matowy
    const wallMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: variant.wallTint, brighten: variant.wallBrighten,
      saturation: 0.12, contrast: 0.55, normalScale: 0.5, roughness: 0.88,
      aoIntensity: 0.35, breakup: 0.07,
    });
    const woodRepeat = FLOOR_TILE / WOOD_TILE;
    const floorMat =
      variant.floor === 'wood'
        ? buildPbrMaterial(woodSet, { repeat: [woodRepeat, woodRepeat], tint: variant.floorTint, bumpScale: 0.02, roughness: 0.55 })
        : buildPbrMaterial(microSet, {
            repeat: [1, 1], tint: variant.floorTint, brighten: variant.floorBrighten,
            saturation: 0.14, contrast: 0.6, normalScale: 0.5, roughness: 0.78,
            aoIntensity: 0.35, breakup: 0.06, envMapIntensity: 0.45,
          });
    const ceilMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: variant.ceilingTint, brighten: variant.ceilingBrighten,
      saturation: 0.1, contrast: 0.5, normalScale: 0.35, roughness: 0.85, aoIntensity: 0.3, breakup: 0.05,
    });
    const nicheMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: variant.wallTint, brighten: variant.wallBrighten * 0.85,
      saturation: 0.12, contrast: 0.55, normalScale: 0.4, roughness: 0.9, aoIntensity: 0.4,
    });
    nicheMat.emissive = new THREE.Color('#31333a');
    nicheMat.emissiveIntensity = 0.55;
    // skrzydło drzwi: ton ściany, odrobinę jaśniejsze i mniej matowe -
    // delikatnie inaczej łapie światło, więc obrys drzwi jest czytelny
    const doorMat = buildPbrMaterial(microSet, {
      repeat: [1, 1], tint: variant.wallTint, brighten: variant.wallBrighten * 1.03,
      saturation: 0.12, contrast: 0.55, normalScale: 0.45, roughness: 0.8, aoIntensity: 0.3,
    });

    for (const m of built.slots.brick) m.material = brickMat;
    for (const m of built.slots.wall) m.material = wallMat;
    for (const m of built.slots.floor) m.material = floorMat;
    for (const m of built.slots.ceil) m.material = ceilMat;
    for (const m of built.slots.niche) m.material = nicheMat;
    for (const m of built.slots.door) m.material = doorMat;

    const created = [brickMat, wallMat, floorMat, ceilMat, nicheMat, doorMat];
    const toDispose = prevMats.current;
    prevMats.current = created;
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
      {/* tło sceny: nigdy czysta czerń */}
      <color attach="background" args={['#1c1c1d']} />
      <primitive object={built.group} />
      <CameraBounds />

      {/* Neutralne, lekkie środowisko proceduralne (bez pobierania HDR). */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#2a2f36']} />
        <Lightformer position={[-6, 2.2, 3]} scale={[3.4, 4, 1]} intensity={2.6} color="#f2f5f8" />
        <Lightformer position={[6, 3, 3]} scale={[4, 4, 1]} intensity={0.6} color="#a6acb2" />
        <Lightformer position={[0, 5, 3]} scale={[8, 4, 1]} rotation={[Math.PI / 2, 0, 0]} intensity={0.5} color="#8b8e92" />
      </Environment>

      {/* 1 światło cieniujące (okno) + hemisfera + 1 słaby fill. */}
      <hemisphereLight intensity={1.15} color="#eef1f4" groundColor="#94928c" />
      <WindowLight color={variant.sunColor} intensity={variant.sunIntensity} />
      <directionalLight position={[4.5, 2.4, 4.6]} intensity={0.45} color="#e9edf1" />
    </group>
  );
}

/** Kierunkowe światło "z okna" - jedyne rzucające cień; miękkie (PCFSoft + radius). */
function WindowLight({ color, intensity }: { color: string; intensity: number }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(ROOM.W * 0.55, 0.35, ROOM.D * 0.55);
    l.target.updateMatrixWorld();
  }, []);
  return (
    <directionalLight
      ref={light}
      position={[-6, 3.0, 2.6]}
      intensity={intensity}
      color={color}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-radius={5}
      shadow-bias={-0.0004}
      shadow-camera-left={-8}
      shadow-camera-right={8}
      shadow-camera-top={6}
      shadow-camera-bottom={-2}
      shadow-camera-far={26}
    />
  );
}
