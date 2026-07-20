'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { buildPbrMaterial, preparePbrGeometryForAo } from './pbr';
import type { LoftVariant } from './loft-variants';

/**
 * Scena pomieszczenia w stylu loft (tło do wizualizacji drzwi).
 * Kompozycja wg referencji klienta: ściana drzwiowa z szarego tynku,
 * ceglana ściana boczna z przemysłowym oknem (czarna stal), betonowa lub
 * drewniana podłoga, czarny słup stalowy, ciemny sufit z belkami,
 * ciepłe światło dzienne z okna.
 *
 * Wymiary w metrach. Ściana drzwiowa w płaszczyźnie z=0 (x: -2.4..4.4),
 * przyszłe drzwi staną w okolicy x 0..1.
 */

const ROOM = {
  xMin: -2.4,
  xMax: 4.4,
  height: 3.2,
  depth: 6.5,
  wallThickness: 0.25,
};

/** Ile metrów świata pokrywa jeden kafel tekstury (dobrane pod realną skalę). */
const BRICK_TILE_M = 1.35; // ~6.5 cm rząd cegły przy ~20 rzędach na kafel
const WOOD_TILE_M = 1.6; // deski ~12 cm szerokości

export interface LoftRoomProps {
  variant: LoftVariant;
  /** Baza URL tekstur (public/textures). */
  texturesBase?: string;
}

export function LoftRoom({ variant, texturesBase = '/textures' }: LoftRoomProps) {
  const [brickColor, brickBump, brickRough, woodColor, woodBump, woodRough] = useLoader(
    THREE.TextureLoader,
    [
      `${texturesBase}/brick/color.jpg`,
      `${texturesBase}/brick/bump.jpg`,
      `${texturesBase}/brick/roughness.jpg`,
      `${texturesBase}/wood/color.jpg`,
      `${texturesBase}/wood/bump.jpg`,
      `${texturesBase}/wood/roughness.jpg`,
    ],
  );

  const group = useMemo(() => {
    const g = new THREE.Group();
    const disposables: { dispose: () => void }[] = [];

    const add = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      position: [number, number, number],
      opts: { rotationY?: number; rotationX?: number; castShadow?: boolean; receiveShadow?: boolean } = {},
    ) => {
      preparePbrGeometryForAo(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      if (opts.rotationY) mesh.rotation.y = opts.rotationY;
      if (opts.rotationX) mesh.rotation.x = opts.rotationX;
      mesh.castShadow = opts.castShadow ?? false;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      g.add(mesh);
      disposables.push(geometry, material);
      return mesh;
    };

    // ── materiały ────────────────────────────────────────────────────────────
    const brickMat = (widthM: number, heightM: number) =>
      buildPbrMaterial(
        { color: brickColor, bump: brickBump, roughness: brickRough },
        {
          repeat: [widthM / BRICK_TILE_M, heightM / BRICK_TILE_M],
          tint: variant.brickTint,
          bumpScale: 0.05,
        },
      );
    const plaster = new THREE.MeshStandardMaterial({
      color: new THREE.Color(variant.plasterColor),
      roughness: 0.96,
    });
    const plasterSide = plaster.clone();
    const ceilingMat = new THREE.MeshStandardMaterial({ color: '#232326', roughness: 0.92 });
    const steel = new THREE.MeshStandardMaterial({
      color: '#1b1c1e',
      roughness: 0.55,
      metalness: 0.75,
    });
    const daylight = new THREE.MeshBasicMaterial({ color: '#f1ebdf' });

    const floorMat =
      variant.floor === 'wood'
        ? buildPbrMaterial(
            { color: woodColor, bump: woodBump, roughness: woodRough },
            {
              repeat: [
                (ROOM.xMax - ROOM.xMin) / WOOD_TILE_M,
                ROOM.depth / WOOD_TILE_M,
              ],
              tint: variant.woodTint,
              bumpScale: 0.02,
            },
          )
        : new THREE.MeshStandardMaterial({
            color: new THREE.Color(variant.concreteColor),
            roughness: 0.9,
          });

    const roomW = ROOM.xMax - ROOM.xMin;

    // ── podłoga i sufit ──────────────────────────────────────────────────────
    add(new THREE.PlaneGeometry(roomW, ROOM.depth), floorMat, [
      (ROOM.xMin + ROOM.xMax) / 2,
      0,
      ROOM.depth / 2,
    ], { rotationX: -Math.PI / 2, receiveShadow: true });
    add(new THREE.PlaneGeometry(roomW, ROOM.depth), ceilingMat, [
      (ROOM.xMin + ROOM.xMax) / 2,
      ROOM.height,
      ROOM.depth / 2,
    ], { rotationX: Math.PI / 2 });

    // belki sufitowe + szyna oświetleniowa (dekoracja jak w referencji)
    for (const z of [1.6, 3.6]) {
      add(new THREE.BoxGeometry(roomW, 0.24, 0.18), ceilingMat.clone(), [
        (ROOM.xMin + ROOM.xMax) / 2,
        ROOM.height - 0.12,
        z,
      ], { castShadow: true });
    }
    add(new THREE.BoxGeometry(1.7, 0.04, 0.05), steel.clone(), [1.0, ROOM.height - 0.3, 2.6], {
      castShadow: true,
    });
    for (const x of [0.45, 1.55]) {
      add(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 16), steel.clone(), [
        x,
        ROOM.height - 0.42,
        2.6,
      ], { castShadow: true });
    }

    // ── ściana drzwiowa (tynk) i ściana prawa ────────────────────────────────
    add(new THREE.PlaneGeometry(roomW, ROOM.height), plaster, [
      (ROOM.xMin + ROOM.xMax) / 2,
      ROOM.height / 2,
      0,
    ]);
    add(new THREE.PlaneGeometry(ROOM.depth, ROOM.height), plasterSide, [
      ROOM.xMax,
      ROOM.height / 2,
      ROOM.depth / 2,
    ], { rotationY: -Math.PI / 2 });

    // czarny słup stalowy (dwuteownik) przy prawej ścianie
    const beamX = ROOM.xMax - 0.16;
    add(new THREE.BoxGeometry(0.1, ROOM.height, 0.24), steel.clone(), [beamX, ROOM.height / 2, 1.35], { castShadow: true });
    for (const dz of [-0.12, 0.12]) {
      add(new THREE.BoxGeometry(0.26, ROOM.height, 0.03), steel.clone(), [beamX, ROOM.height / 2, 1.35 + dz], { castShadow: true });
    }

    // ── ceglana ściana boczna z oknem przemysłowym ───────────────────────────
    const bx = ROOM.xMin;
    const t = ROOM.wallThickness;
    const win = { z0: 1.5, z1: 4.7, y0: 0.85, y1: 2.7 };
    const brickBox = (
      lenZ: number,
      height: number,
      centerZ: number,
      centerY: number,
    ) => {
      const geometry = new THREE.BoxGeometry(t, height, lenZ);
      add(geometry, brickMat(lenZ, height), [bx + t / 2, centerY, centerZ], {
        castShadow: true,
      });
    };
    brickBox(win.z0, ROOM.height, win.z0 / 2, ROOM.height / 2); // przed oknem
    brickBox(ROOM.depth - win.z1, ROOM.height, (win.z1 + ROOM.depth) / 2, ROOM.height / 2); // za oknem
    brickBox(win.z1 - win.z0, win.y0, (win.z0 + win.z1) / 2, win.y0 / 2); // pod oknem
    brickBox(win.z1 - win.z0, ROOM.height - win.y1, (win.z0 + win.z1) / 2, (win.y1 + ROOM.height) / 2); // nad oknem

    // parapet betonowy
    add(new THREE.BoxGeometry(t + 0.06, 0.05, win.z1 - win.z0 + 0.08), new THREE.MeshStandardMaterial({ color: '#8d8a84', roughness: 0.85 }), [
      bx + t / 2 + 0.015,
      win.y0 - 0.025,
      (win.z0 + win.z1) / 2,
    ], { castShadow: true });

    // rama okna + szprosy (czarna stal)
    const frameD = 0.07;
    const fz = (win.z0 + win.z1) / 2;
    const fy = (win.y0 + win.y1) / 2;
    const winLen = win.z1 - win.z0;
    const winH = win.y1 - win.y0;
    const frame = (w: number, h: number, y: number, z: number) =>
      add(new THREE.BoxGeometry(frameD, h, w), steel.clone(), [bx + t - 0.06, y, z], { castShadow: true });
    frame(winLen, 0.06, win.y0 + 0.03, fz);
    frame(winLen, 0.06, win.y1 - 0.03, fz);
    frame(0.06, winH, fy, win.z0 + 0.03);
    frame(0.06, winH, fy, win.z1 - 0.03);
    for (let i = 1; i <= 3; i++) frame(0.045, winH, fy, win.z0 + (winLen * i) / 4); // pionowe szprosy
    frame(winLen, 0.045, fy, fz); // poziomy szpros

    // "dzienne niebo" za oknem (prześwietlona tafla jak w referencji)
    add(new THREE.PlaneGeometry(winLen + 0.4, winH + 0.4), daylight, [bx - 0.4, fy, fz], {
      rotationY: Math.PI / 2,
      receiveShadow: false,
    });

    return { group: g, dispose: () => disposables.forEach((d) => d.dispose()) };
  }, [variant, brickColor, brickBump, brickRough, woodColor, woodBump, woodRough]);

  useEffect(() => () => group.dispose(), [group]);

  return (
    <group>
      <primitive object={group.group} />
      {/* światło dzienne z okna po lewej + miękkie wypełnienie */}
      <hemisphereLight intensity={1.0} color="#e2dcd2" groundColor="#57534e" />
      <WindowLight color={variant.sunColor} intensity={variant.sunIntensity} />
      <directionalLight position={[3.5, 2.4, 5.5]} intensity={0.55} color="#d8d3cc" />
      <directionalLight position={[-3, 2.8, 6.5]} intensity={0.45} color="#efe3d2" />
    </group>
  );
}

/** Kierunkowe światło "z okna": cel ustawiany ręcznie (target poza grafem). */
function WindowLight({ color, intensity }: { color: string; intensity: number }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(2.2, 0.3, 2.8);
    l.target.updateMatrixWorld();
  }, []);
  return (
    <directionalLight
      ref={light}
      position={[-7, 3.4, 3.1]}
      intensity={intensity}
      color={color}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0003}
      shadow-camera-left={-8}
      shadow-camera-right={8}
      shadow-camera-top={6}
      shadow-camera-bottom={-2}
      shadow-camera-far={25}
    />
  );
}
