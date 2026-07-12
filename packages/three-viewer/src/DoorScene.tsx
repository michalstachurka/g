'use client';

import { Component, type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls } from '@react-three/drei';

type OrbitControlsImpl = React.ComponentRef<typeof OrbitControls>;
import type { PublicAssetManifest, PublicMaterialDef, RenderSpec } from '@door/contracts';
import { MM_TO_M } from '@door/contracts';
import { placeAll } from './composition';
import { MaterialLibrary } from './materials';
import { DoorModule } from './DoorModule';

export interface DoorSceneProps {
  renderSpec: RenderSpec;
  manifests: Record<string, PublicAssetManifest>;
  materialDefs: PublicMaterialDef[];
  /** Zwraca URL pliku GLB dla publicznego identyfikatora assetu. */
  assetFileUrl: (publicAssetId: string) => string;
  open?: boolean;
  viewSide?: 'a' | 'b';
  interactive?: boolean;
  showMeasurements?: boolean;
  diagnostics?: boolean;
  onReady?: () => void;
  className?: string;
  backgroundColor?: string;
}

/** Neutralna ściana demonstracyjna wokół otworu - element sceny, nie produktu. */
function DemoWall({ widthM, heightM, color }: { widthM: number; heightM: number; color: string }) {
  const side = 1.4;
  const top = 0.7;
  const thickness = 0.1;
  const z = thickness / 2 + 0.062;
  return (
    <group position-z={z}>
      <mesh position={[-side / 2, heightM / 2, 0]} receiveShadow>
        <boxGeometry args={[side, heightM, thickness]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[widthM + side / 2, heightM / 2, 0]} receiveShadow>
        <boxGeometry args={[side, heightM, thickness]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[widthM / 2, heightM + top / 2, 0]} receiveShadow>
        <boxGeometry args={[widthM + side * 2, top, thickness]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
    </group>
  );
}

function MeasurementOverlay({ widthM, heightM, widthMm, heightMm }: {
  widthM: number; heightM: number; widthMm: number; heightMm: number;
}) {
  const label = {
    background: 'rgba(28,28,30,0.82)',
    color: '#fff',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontFamily: 'system-ui',
    whiteSpace: 'nowrap' as const,
  };
  return (
    <group>
      <Html position={[widthM / 2, -0.12, 0]} center zIndexRange={[10, 0]}>
        <div style={label}>{widthMm} mm</div>
      </Html>
      <Html position={[widthM + 0.16, heightM / 2, 0]} center zIndexRange={[10, 0]}>
        <div style={label}>{heightMm} mm</div>
      </Html>
    </group>
  );
}

function CameraRig({ widthM, heightM, viewSide, interactive }: {
  widthM: number; heightM: number; viewSide: 'a' | 'b'; interactive: boolean;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  useEffect(() => {
    const distance = Math.max(widthM * 1.9, heightM * 1.15, 2.6);
    const z = viewSide === 'a' ? -distance : distance;
    camera.position.set(widthM / 2 + (viewSide === 'a' ? -0.4 : 0.4), heightM * 0.55, z);
    camera.lookAt(widthM / 2, heightM * 0.5, 0);
    controls.current?.target.set(widthM / 2, heightM * 0.5, 0);
    controls.current?.update();
  }, [widthM, heightM, viewSide, camera]);
  return (
    <OrbitControls
      ref={controls}
      enabled={interactive}
      enablePan={false}
      minDistance={1.1}
      maxDistance={8}
      maxPolarAngle={Math.PI * 0.55}
      minPolarAngle={Math.PI * 0.2}
    />
  );
}

function ReadySignal({ onReady }: { onReady?: () => void }) {
  const fired = useRef(false);
  useFrame(() => {
    if (!fired.current) {
      fired.current = true;
      onReady?.();
      if (typeof window !== 'undefined') {
        (window as unknown as { __RENDER_READY?: boolean }).__RENDER_READY = true;
      }
    }
  });
  return null;
}

function DiagnosticsProbe({ enabled }: { enabled: boolean }) {
  const [info, setInfo] = useState<string | null>(null);
  const { scene, raycaster, pointer, camera } = useThree();
  useFrame(() => {
    if (!enabled) return;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    const hit = hits.find((h) => (h.object as THREE.Mesh).isMesh);
    if (!hit) {
      setInfo(null);
      return;
    }
    let node: THREE.Object3D | null = hit.object;
    while (node && !node.userData.semanticRole) node = node.parent;
    const box = new THREE.Box3().setFromObject(hit.object);
    const size = box.getSize(new THREE.Vector3());
    setInfo(
      `${node?.userData.semanticRole ?? 'bez roli'} | slot: ${node?.userData.materialSlot ?? '-'} | ` +
        `${hit.object.name || '(bez nazwy)'} | ${(size.x * 1000).toFixed(0)}x${(size.y * 1000).toFixed(0)}x${(size.z * 1000).toFixed(0)} mm`,
    );
  });
  if (!enabled || !info) return null;
  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', bottom: 12, left: 12, background: '#111c', color: '#9fe3b3', font: '11px monospace', padding: '6px 10px', borderRadius: 6 }}>
        {info}
      </div>
    </Html>
  );
}

class SceneErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function DoorScene(props: DoorSceneProps) {
  const {
    renderSpec,
    manifests,
    materialDefs,
    assetFileUrl,
    open = false,
    viewSide = 'a',
    interactive = true,
    showMeasurements,
    diagnostics = false,
    onReady,
    className,
    backgroundColor = '#eceae5',
  } = props;

  const placements = useMemo(() => placeAll(renderSpec, manifests), [renderSpec, manifests]);
  const materials = useMemo(() => new MaterialLibrary(materialDefs), [materialDefs]);
  useEffect(() => () => materials.dispose(), [materials]);

  const [openAmount, setOpenAmount] = useState(0);
  const target = open ? 1 : 0;

  const widthM = renderSpec.widthMm * MM_TO_M;
  const heightM = renderSpec.heightMm * MM_TO_M;
  const measurements = showMeasurements ?? renderSpec.scene.showMeasurementOverlay;

  return (
    <div className={className} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <SceneErrorBoundary
        fallback={
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#8a8a8a', fontSize: 14, padding: 24, textAlign: 'center' }}>
            Nie udało się załadować widoku 3D. Odśwież stronę albo spróbuj na innym urządzeniu.
          </div>
        }
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ fov: 42, near: 0.05, far: 40 }}
          style={{ background: backgroundColor }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
        >
          <hemisphereLight intensity={0.55} color="#ffffff" groundColor="#cfc9bd" />
          <directionalLight
            position={[-2.4, 3.6, -3.2]}
            intensity={1.35}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[3, 2.2, 2.5]} intensity={0.35} />
          <Suspense fallback={<Html center><div style={{ font: '13px system-ui', color: '#777' }}>Ładowanie modelu…</div></Html>}>
            <SmoothOpen openAmount={openAmount} target={target} onChange={setOpenAmount} />
            {placements.map((placement) => (
              <DoorModule
                key={`${placement.slot}:${placement.publicAssetId}`}
                placement={placement}
                fileUrl={assetFileUrl(placement.publicAssetId)}
                publicMaterials={renderSpec.publicMaterials}
                materials={materials}
                animation={renderSpec.animation}
                openAmount={openAmount}
              />
            ))}
            {renderSpec.scene.background === 'studio' ? (
              <DemoWall widthM={widthM} heightM={heightM} color="#dcd7ce" />
            ) : null}
            <ContactShadows position={[widthM / 2, 0.001, 0]} scale={6} blur={2.4} opacity={0.4} far={2} />
            <mesh rotation-x={-Math.PI / 2} position={[widthM / 2, -0.002, 0]} receiveShadow>
              <circleGeometry args={[5, 48]} />
              <meshStandardMaterial color="#e5e1d8" roughness={1} />
            </mesh>
            {measurements ? (
              <MeasurementOverlay widthM={widthM} heightM={heightM} widthMm={renderSpec.widthMm} heightMm={renderSpec.heightMm} />
            ) : null}
            <ReadySignal onReady={onReady} />
            <DiagnosticsProbe enabled={diagnostics} />
          </Suspense>
          <CameraRig widthM={widthM} heightM={heightM} viewSide={viewSide} interactive={interactive} />
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}

function SmoothOpen({ openAmount, target, onChange }: { openAmount: number; target: number; onChange: (v: number) => void }) {
  useFrame((_, delta) => {
    const next = THREE.MathUtils.damp(openAmount, target, 6, delta);
    if (Math.abs(next - openAmount) > 0.0005) onChange(next);
    else if (openAmount !== target && Math.abs(target - openAmount) <= 0.0005) onChange(target);
  });
  return null;
}
