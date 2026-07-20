'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { buildPbrMaterial, preparePbrGeometryForAo, type PbrTextureSet } from './pbr';
import type { LoftVariant } from './loft-variants';

/**
 * Scena pomieszczenia w stylu loft (tło do wizualizacji drzwi) na prawdziwych
 * teksturach PBR CC0 (Poly Haven): czerwona cegła (brick_wall_006) na ścianie
 * bocznej z przemysłowym oknem, mikrocement (brushed_concrete) na podłodze
 * i ścianie drzwiowej. Kompozycja wg referencji klienta:
 * czarny słup stalowy, ciemny sufit z belkami i szyną reflektorów, ciepłe
 * światło dzienne z okna. Wymiary w metrach; ściana drzwiowa w z=0.
 */

const ROOM = { xMin: -2.4, xMax: 4.4, height: 3.2, depth: 6.5, wallThickness: 0.25 };

/** Ile metrów świata pokrywa jeden kafel tekstury (dobrane pod realną skalę). */
const BRICK_TILE_M = 2.0; // ~25 rzędów cegły/kafel -> ~8 cm na rząd
const MICRO_FLOOR_TILE_M = 3.4; // mikrocement na podłodze - duże pole bez widocznego kafla
const MICRO_WALL_TILE_M = 2.8; // mikrocement na ścianie - widoczne ślady pacy
const WOOD_TILE_M = 1.6;

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
  const [
    brickColor, brickNormal, brickRough, brickAo,
    mcColor, mcNormal, mcRough, mcAo,
    woodColor, woodBump, woodRough,
  ] = tex;

  const brickSet: PbrTextureSet = { color: brickColor, normal: brickNormal, roughness: brickRough, ao: brickAo };
  const microSet: PbrTextureSet = { color: mcColor, normal: mcNormal, roughness: mcRough, ao: mcAo };

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

    // ── materiały ──────────────────────────────────────────────────────────
    const brickMat = (widthM: number, heightM: number) =>
      buildPbrMaterial(brickSet, {
        repeat: [widthM / BRICK_TILE_M, heightM / BRICK_TILE_M],
        tint: variant.brickTint,
      });

    const roomW = ROOM.xMax - ROOM.xMin;

    // Mikrocement (brushed_concrete) - wg referencji klienta na podłodze i
    // ścianie drzwiowej. Naturalny ciepły odcień; delikatny lift jasności.
    const floorMat =
      variant.floor === 'wood'
        ? buildPbrMaterial(
            { color: woodColor, bump: woodBump, roughness: woodRough },
            { repeat: [roomW / WOOD_TILE_M, ROOM.depth / WOOD_TILE_M], tint: variant.floorTint, bumpScale: 0.02 },
          )
        : buildPbrMaterial(microSet, {
            repeat: [roomW / MICRO_FLOOR_TILE_M, ROOM.depth / MICRO_FLOOR_TILE_M],
            tint: variant.floorTint,
            roughness: 0.72,
            brighten: variant.floorBrighten,
            saturation: 0.12,
            aoIntensity: 0.5,
          });
    if (variant.floor === 'concrete') {
      (floorMat as THREE.MeshStandardMaterial).envMapIntensity = 0.4;
    }

    // Ściana drzwiowa i prawa: ten sam mikrocement co podłoga (spójna zabudowa).
    const wallMat = () =>
      buildPbrMaterial(microSet, {
        repeat: [roomW / MICRO_WALL_TILE_M, ROOM.height / MICRO_WALL_TILE_M],
        tint: variant.wallTint,
        roughness: 0.9,
        brighten: variant.wallBrighten,
        saturation: 0.12,
        aoIntensity: 0.55,
      });
    const plaster = wallMat();
    const plasterSide = wallMat();
    const ceilingMat = new THREE.MeshStandardMaterial({ color: '#26262a', roughness: 0.9 });
    const steel = new THREE.MeshStandardMaterial({ color: '#202124', roughness: 0.42, metalness: 0.85, envMapIntensity: 0.7 });
    const daylight = new THREE.MeshBasicMaterial({ color: '#fdf7ec' });

    // ── podłoga i sufit ──────────────────────────────────────────────────────
    add(new THREE.PlaneGeometry(roomW, ROOM.depth), floorMat, [(ROOM.xMin + ROOM.xMax) / 2, 0, ROOM.depth / 2], { rotationX: -Math.PI / 2, receiveShadow: true });
    add(new THREE.PlaneGeometry(roomW, ROOM.depth), ceilingMat, [(ROOM.xMin + ROOM.xMax) / 2, ROOM.height, ROOM.depth / 2], { rotationX: Math.PI / 2 });

    for (const z of [1.6, 3.6]) {
      add(new THREE.BoxGeometry(roomW, 0.24, 0.18), ceilingMat.clone(), [(ROOM.xMin + ROOM.xMax) / 2, ROOM.height - 0.12, z], { castShadow: true });
    }
    add(new THREE.BoxGeometry(1.7, 0.04, 0.05), steel.clone(), [1.0, ROOM.height - 0.3, 2.6], { castShadow: true });
    for (const x of [0.45, 1.55]) {
      add(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 16), steel.clone(), [x, ROOM.height - 0.42, 2.6], { castShadow: true });
    }

    // ── ściana drzwiowa (tynk) i ściana prawa ────────────────────────────────
    add(new THREE.PlaneGeometry(roomW, ROOM.height), plaster, [(ROOM.xMin + ROOM.xMax) / 2, ROOM.height / 2, 0]);
    add(new THREE.PlaneGeometry(ROOM.depth, ROOM.height), plasterSide, [ROOM.xMax, ROOM.height / 2, ROOM.depth / 2], { rotationY: -Math.PI / 2 });

    // czarny słup stalowy (dwuteownik)
    const beamX = ROOM.xMax - 0.16;
    add(new THREE.BoxGeometry(0.1, ROOM.height, 0.24), steel.clone(), [beamX, ROOM.height / 2, 1.35], { castShadow: true });
    for (const dz of [-0.12, 0.12]) {
      add(new THREE.BoxGeometry(0.26, ROOM.height, 0.03), steel.clone(), [beamX, ROOM.height / 2, 1.35 + dz], { castShadow: true });
    }

    // ── ceglana ściana boczna z oknem przemysłowym ───────────────────────────
    const bx = ROOM.xMin;
    const t = ROOM.wallThickness;
    const win = { z0: 1.5, z1: 4.7, y0: 0.85, y1: 2.7 };
    const brickBox = (lenZ: number, height: number, centerZ: number, centerY: number) => {
      add(new THREE.BoxGeometry(t, height, lenZ), brickMat(lenZ, height), [bx + t / 2, centerY, centerZ], { castShadow: true });
    };
    brickBox(win.z0, ROOM.height, win.z0 / 2, ROOM.height / 2);
    brickBox(ROOM.depth - win.z1, ROOM.height, (win.z1 + ROOM.depth) / 2, ROOM.height / 2);
    brickBox(win.z1 - win.z0, win.y0, (win.z0 + win.z1) / 2, win.y0 / 2);
    brickBox(win.z1 - win.z0, ROOM.height - win.y1, (win.z0 + win.z1) / 2, (win.y1 + ROOM.height) / 2);

    add(new THREE.BoxGeometry(t + 0.06, 0.05, win.z1 - win.z0 + 0.08), new THREE.MeshStandardMaterial({ color: '#c9c4ba', roughness: 0.8 }), [bx + t / 2 + 0.015, win.y0 - 0.025, (win.z0 + win.z1) / 2], { castShadow: true });

    // rama okna + szprosy (czarna stal)
    const fz = (win.z0 + win.z1) / 2;
    const fy = (win.y0 + win.y1) / 2;
    const winLen = win.z1 - win.z0;
    const winH = win.y1 - win.y0;
    const frame = (w: number, h: number, y: number, z: number) => add(new THREE.BoxGeometry(0.07, h, w), steel.clone(), [bx + t - 0.06, y, z], { castShadow: true });
    frame(winLen, 0.06, win.y0 + 0.03, fz);
    frame(winLen, 0.06, win.y1 - 0.03, fz);
    frame(0.06, winH, fy, win.z0 + 0.03);
    frame(0.06, winH, fy, win.z1 - 0.03);
    for (let i = 1; i <= 3; i++) frame(0.045, winH, fy, win.z0 + (winLen * i) / 4);
    frame(winLen, 0.045, fy, fz);

    // prześwietlona tafla dzienna za oknem
    add(new THREE.PlaneGeometry(winLen + 0.4, winH + 0.4), daylight, [bx - 0.4, fy, fz], { rotationY: Math.PI / 2, receiveShadow: false });

    return { group: g, dispose: () => disposables.forEach((d) => d.dispose()) };
  }, [variant, brickColor, brickNormal, brickRough, brickAo, mcColor, mcNormal, mcRough, mcAo, woodColor, woodBump, woodRough]);

  useEffect(() => () => group.dispose(), [group]);

  return (
    <group>
      <primitive object={group.group} />

      {/* Proceduralne środowisko (bez pobierania HDR) - daje metalom i betonowi
          czym odbijać: jasny "kierunek okna" po lewej + ciemniejsze wnętrze. */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#2a2622']} />
        <Lightformer position={[-6, 2.2, 2.8]} scale={[3, 4, 1]} intensity={3} color="#fff1dc" />
        <Lightformer position={[5, 3, 3]} scale={[4, 4, 1]} intensity={0.4} color="#8f9298" />
        <Lightformer position={[0, 4, 0]} scale={[6, 6, 1]} rotation={[Math.PI / 2, 0, 0]} intensity={0.3} color="#6b6660" />
      </Environment>

      <hemisphereLight intensity={1.25} color="#eef0f2" groundColor="#83837f" />
      <WindowLight color={variant.sunColor} intensity={variant.sunIntensity} />
      <directionalLight position={[3.5, 2.4, 5.5]} intensity={0.7} color="#e8ecf0" />
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
