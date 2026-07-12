'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ANCHOR_KEYS, MATERIAL_SLOTS, SEMANTIC_ROLES } from '@door/contracts';
import { Badge, Button, Card, Spinner } from '@door/ui';
import { adminApi, type GlbNodeDto } from '@/lib/admin-api';
import { PageHeader, SelectInput, StatusBadge, TextInput } from '@/components/shared';
import { AssetPreview } from '@/components/AssetPreview';

interface NodeBindingDraft {
  role: string;
  nodePath: string;
  nodeName: string | null;
  mirrorable: boolean;
}
interface AnchorDraft {
  anchor: string;
  positionMm: [number, number, number];
  normalized: boolean;
}
interface MaterialBindingDraft {
  slotKey: string;
  appliesToRoles: string[];
  side?: 'a' | 'b' | null;
}

function flattenTree(nodes: GlbNodeDto[]): GlbNodeDto[] {
  const result: GlbNodeDto[] = [];
  const walk = (node: GlbNodeDto) => {
    result.push(node);
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return result;
}

/**
 * Asset manager - krok 2-13: raport, podgląd, wizualne mapowanie węzłów na
 * role semantyczne (klik w 3D albo w drzewie), wymiary bazowe, polityki,
 * anchory, materiały, walidacja i publikacja.
 */
export default function AssetDetailPage({
  params,
}: {
  params: Promise<{ assetKey: string; version: string }>;
}) {
  const { assetKey, version: versionStr } = use(params);
  const version = Number(versionStr);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['asset', assetKey, version],
    queryFn: () => adminApi.assetVersion(assetKey, version),
  });

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [bindings, setBindings] = useState<NodeBindingDraft[]>([]);
  const [anchors, setAnchors] = useState<AnchorDraft[]>([]);
  const [materialBindings, setMaterialBindings] = useState<MaterialBindingDraft[]>([]);
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [saveState, setSaveState] = useState<{ status: string; errors: string[] } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const manifest = data.manifest;
    setBindings((manifest?.nodeBindings as NodeBindingDraft[]) ?? []);
    setAnchors((manifest?.anchorBindings as AnchorDraft[]) ?? []);
    setMaterialBindings((manifest?.materialBindings as MaterialBindingDraft[]) ?? []);
    setMeta({
      semanticRole: manifest?.semanticRole ?? 'door_leaf',
      baseWidthMm: manifest?.baseWidthMm ?? data.report?.suggestedBaseWidthMm ?? 900,
      baseHeightMm: manifest?.baseHeightMm ?? data.report?.suggestedBaseHeightMm ?? 2100,
      baseDepthMm: manifest?.baseDepthMm ?? data.report?.suggestedBaseDepthMm ?? 50,
      scalePolicy: manifest?.scalePolicy ?? 'width_height',
      mirrorPolicy: manifest?.mirrorPolicy ?? 'allow',
      baseHingeSide: manifest?.baseHingeSide ?? '',
      mountingPlane: manifest?.mountingPlane ?? 'wall',
      pivotPolicy: manifest?.pivotPolicy ?? 'bottom_left_front',
      forwardAxis: manifest?.forwardAxis ?? '-z',
      minWidthMm: (manifest?.allowedDimensionRange as { minWidthMm?: number })?.minWidthMm ?? 600,
      maxWidthMm: (manifest?.allowedDimensionRange as { maxWidthMm?: number })?.maxWidthMm ?? 1200,
      minHeightMm: (manifest?.allowedDimensionRange as { minHeightMm?: number })?.minHeightMm ?? 1900,
      maxHeightMm: (manifest?.allowedDimensionRange as { maxHeightMm?: number })?.maxHeightMm ?? 2400,
    });
  }, [data]);

  const flatNodes = useMemo(() => (data?.report ? flattenTree(data.report.tree) : []), [data]);
  const mappedPaths = useMemo(() => new Set(bindings.map((b) => b.nodePath)), [bindings]);
  const bindingForSelected = bindings.find((b) => b.nodePath === selectedPath);
  const readOnly = data?.status === 'published';

  if (isLoading || !data) return <Spinner label="Wczytywanie assetu…" />;
  const report = data.report;

  async function saveManifest() {
    setPublishError(null);
    const result = await adminApi.updateManifest(assetKey, version, {
      semanticRole: meta.semanticRole,
      baseWidthMm: Number(meta.baseWidthMm),
      baseHeightMm: Number(meta.baseHeightMm),
      baseDepthMm: Number(meta.baseDepthMm),
      scalePolicy: meta.scalePolicy,
      mirrorPolicy: meta.mirrorPolicy,
      ...(meta.baseHingeSide ? { baseHingeSide: meta.baseHingeSide } : {}),
      mountingPlane: meta.mountingPlane,
      pivotPolicy: meta.pivotPolicy,
      forwardAxis: meta.forwardAxis,
      allowedDimensionRange: {
        minWidthMm: Number(meta.minWidthMm),
        maxWidthMm: Number(meta.maxWidthMm),
        minHeightMm: Number(meta.minHeightMm),
        maxHeightMm: Number(meta.maxHeightMm),
      },
      nodeBindings: bindings,
      anchorBindings: anchors,
      materialBindings: materialBindings,
    });
    setSaveState({ status: result.status, errors: result.validationErrors });
    queryClient.invalidateQueries({ queryKey: ['asset', assetKey, version] });
  }

  async function publish() {
    setPublishError(null);
    try {
      await adminApi.publishAsset(assetKey, version);
      queryClient.invalidateQueries({ queryKey: ['asset', assetKey, version] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    } catch (error) {
      setPublishError((error as Error).message);
    }
  }

  function assignRole(role: string) {
    if (!selectedPath) return;
    const node = flatNodes.find((n) => n.path === selectedPath);
    setBindings((current) => {
      const rest = current.filter((b) => b.nodePath !== selectedPath);
      if (role === '') return rest;
      return [...rest, { role, nodePath: selectedPath, nodeName: node?.name ?? null, mirrorable: true }];
    });
  }

  return (
    <div>
      <PageHeader
        title={`${assetKey} - wersja ${version}`}
        description={`${data.fileName} | ${(data.byteSize / 1024).toFixed(0)} kB | checksum ${data.checksum.slice(0, 12)}…`}
        actions={
          <>
            <Link href="/panel/assets">
              <Button variant="ghost">← lista</Button>
            </Link>
            {!readOnly ? (
              <Button variant="secondary" onClick={saveManifest}>
                Zapisz manifest
              </Button>
            ) : null}
            <Button onClick={publish} disabled={readOnly}>
              {readOnly ? 'Opublikowany' : 'Opublikuj wersję'}
            </Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={data.status} />
        {data.publicAssetId ? <code className="text-xs text-[var(--c-text-muted)]">publiczny id: {data.publicAssetId}</code> : null}
        {saveState ? (
          saveState.errors.length > 0 ? (
            <span className="text-xs text-[var(--c-error)]">Manifest niekompletny: {saveState.errors.join(' ')}</span>
          ) : (
            <span className="text-xs text-[var(--c-success)]">Manifest zapisany i poprawny.</span>
          )
        ) : null}
        {publishError ? <span className="text-xs text-[var(--c-error)]">{publishError}</span> : null}
      </div>

      {report ? (
        <Card className="mb-4 p-3">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--c-text-muted)]">
            <span>węzły: <b className="text-[var(--c-text)]">{report.nodeCount}</b></span>
            <span>meshe: <b className="text-[var(--c-text)]">{report.meshCount}</b></span>
            <span>trójkąty: <b className="text-[var(--c-text)]">{report.totalTriangles}</b></span>
            <span>materiały: <b className="text-[var(--c-text)]">{report.materialCount}</b></span>
            <span>tekstury: <b className="text-[var(--c-text)]">{report.textureCount}</b></span>
            <span>animacje: <b className="text-[var(--c-text)]">{report.animationCount}</b></span>
            <span>
              bbox: <b className="text-[var(--c-text)]">{report.suggestedBaseWidthMm}x{report.suggestedBaseHeightMm}x{report.suggestedBaseDepthMm} mm</b>
            </span>
            {report.generator ? <span>generator: {report.generator}</span> : null}
          </div>
          {report.warnings.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-xs text-[var(--c-warning)]">
              {report.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="h-[460px] overflow-hidden">
          <AssetPreview
            fileUrl={adminApi.assetFileUrl(assetKey, version)}
            selectedPath={selectedPath}
            mappedPaths={mappedPaths}
            onPickNode={setSelectedPath}
          />
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">Drzewo węzłów - kliknij element w 3D albo na liście</h2>
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {flatNodes.map((node) => {
                const binding = bindings.find((b) => b.nodePath === node.path);
                const selected = node.path === selectedPath;
                return (
                  <button
                    key={node.path}
                    onClick={() => setSelectedPath(node.path)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition ${
                      selected ? 'border-[var(--c-accent)] bg-[color-mix(in_srgb,var(--c-accent)_8%,white)]' : 'border-[var(--c-border)] hover:border-[var(--c-primary)]'
                    }`}
                  >
                    <span className="truncate">
                      <code className="text-[var(--c-text-muted)]">[{node.path}]</code>{' '}
                      {node.name ?? '(węzeł bez nazwy)'}{' '}
                      <span className="text-[var(--c-text-muted)]">
                        {node.triangles > 0 ? `${node.triangles} tris` : ''}
                        {node.bboxMin && node.bboxMax
                          ? ` | ${((node.bboxMax[0] - node.bboxMin[0]) * 1000).toFixed(0)}x${((node.bboxMax[1] - node.bboxMin[1]) * 1000).toFixed(0)} mm`
                          : ''}
                      </span>
                    </span>
                    {binding ? <Badge tone="success">{binding.role}</Badge> : <Badge>bez roli</Badge>}
                  </button>
                );
              })}
            </div>
            {selectedPath ? (
              <div className="mt-3 flex items-end gap-2 border-t border-[var(--c-border)] pt-3">
                <SelectInput
                  label={`Rola semantyczna węzła [${selectedPath}]`}
                  value={bindingForSelected?.role ?? ''}
                  disabled={readOnly}
                  onChange={(e) => assignRole(e.target.value)}
                  options={[{ value: '', label: '- brak (usuń mapowanie) -' }, ...SEMANTIC_ROLES.map((role) => ({ value: role, label: role }))]}
                />
                {bindingForSelected ? (
                  <label className="mb-1 flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={bindingForSelected.mirrorable}
                      disabled={readOnly}
                      onChange={(e) =>
                        setBindings((current) =>
                          current.map((b) => (b.nodePath === selectedPath ? { ...b, mirrorable: e.target.checked } : b)),
                        )
                      }
                    />
                    odbijalny (DIN)
                  </label>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 border-t border-[var(--c-border)] pt-3 text-xs text-[var(--c-text-muted)]">
                Zaznacz węzeł, aby przypisać rolę. Nazwy meshy są dowolne - mapowanie zapisuje się po ścieżce.
              </p>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">Parametry manifestu</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <SelectInput label="Rola modułu" value={String(meta.semanticRole ?? '')} disabled={readOnly} onChange={(e) => setMeta({ ...meta, semanticRole: e.target.value })} options={SEMANTIC_ROLES.map((r) => ({ value: r, label: r }))} />
              <TextInput label="Baza szer. (mm)" type="number" disabled={readOnly} value={String(meta.baseWidthMm ?? '')} onChange={(e) => setMeta({ ...meta, baseWidthMm: e.target.value })} className="w-full" />
              <TextInput label="Baza wys. (mm)" type="number" disabled={readOnly} value={String(meta.baseHeightMm ?? '')} onChange={(e) => setMeta({ ...meta, baseHeightMm: e.target.value })} className="w-full" />
              <TextInput label="Baza głęb. (mm)" type="number" disabled={readOnly} value={String(meta.baseDepthMm ?? '')} onChange={(e) => setMeta({ ...meta, baseDepthMm: e.target.value })} className="w-full" />
              <SelectInput label="Polityka skalowania" value={String(meta.scalePolicy ?? '')} disabled={readOnly} onChange={(e) => setMeta({ ...meta, scalePolicy: e.target.value })} options={['fixed', 'uniform', 'width_height', 'approved_axes', 'variant_only'].map((v) => ({ value: v, label: v }))} />
              <SelectInput label="Polityka odbicia (DIN)" value={String(meta.mirrorPolicy ?? '')} disabled={readOnly} onChange={(e) => setMeta({ ...meta, mirrorPolicy: e.target.value })} options={[{ value: 'allow', label: 'odbicie dozwolone' }, { value: 'variant_required', label: 'wymagany wariant' }]} />
              <SelectInput label="Autorska strona zawiasów" value={String(meta.baseHingeSide ?? '')} disabled={readOnly} onChange={(e) => setMeta({ ...meta, baseHingeSide: e.target.value })} options={[{ value: '', label: 'nie dotyczy' }, { value: 'left', label: 'lewa' }, { value: 'right', label: 'prawa' }]} />
              <SelectInput label="Płaszczyzna montażu" value={String(meta.mountingPlane ?? '')} disabled={readOnly} onChange={(e) => setMeta({ ...meta, mountingPlane: e.target.value })} options={[{ value: 'wall', label: 'ściana' }, { value: 'floor', label: 'podłoga' }]} />
              <SelectInput label="Pivot" value={String(meta.pivotPolicy ?? '')} disabled={readOnly} onChange={(e) => setMeta({ ...meta, pivotPolicy: e.target.value })} options={['bottom_left_front', 'bottom_center', 'origin_as_authored'].map((v) => ({ value: v, label: v }))} />
              <TextInput label="Min szer. (mm)" type="number" disabled={readOnly} value={String(meta.minWidthMm ?? '')} onChange={(e) => setMeta({ ...meta, minWidthMm: e.target.value })} className="w-full" />
              <TextInput label="Max szer. (mm)" type="number" disabled={readOnly} value={String(meta.maxWidthMm ?? '')} onChange={(e) => setMeta({ ...meta, maxWidthMm: e.target.value })} className="w-full" />
              <TextInput label="Min wys. (mm)" type="number" disabled={readOnly} value={String(meta.minHeightMm ?? '')} onChange={(e) => setMeta({ ...meta, minHeightMm: e.target.value })} className="w-full" />
              <TextInput label="Max wys. (mm)" type="number" disabled={readOnly} value={String(meta.maxHeightMm ?? '')} onChange={(e) => setMeta({ ...meta, maxHeightMm: e.target.value })} className="w-full" />
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">Anchory (mm w układzie assetu)</h2>
            {anchors.map((anchor, index) => (
              <div key={index} className="mb-1.5 flex items-center gap-1.5 text-xs">
                <select className="rounded border border-[var(--c-border)] px-1.5 py-1" disabled={readOnly} value={anchor.anchor} onChange={(e) => setAnchors(anchors.map((a, i) => (i === index ? { ...a, anchor: e.target.value } : a)))}>
                  {ANCHOR_KEYS.map((key) => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
                {[0, 1, 2].map((axis) => (
                  <input key={axis} type="number" className="w-20 rounded border border-[var(--c-border)] px-1.5 py-1" disabled={readOnly} value={anchor.positionMm[axis]} onChange={(e) => setAnchors(anchors.map((a, i) => (i === index ? { ...a, positionMm: a.positionMm.map((v, j) => (j === axis ? Number(e.target.value) : v)) as [number, number, number] } : a)))} />
                ))}
                {!readOnly ? (
                  <button className="text-[var(--c-error)]" onClick={() => setAnchors(anchors.filter((_, i) => i !== index))}>✕</button>
                ) : null}
              </div>
            ))}
            {!readOnly ? (
              <Button variant="ghost" onClick={() => setAnchors([...anchors, { anchor: 'handle_center', positionMm: [0, 0, 0], normalized: false }])}>
                + dodaj anchor
              </Button>
            ) : null}
            <p className="mt-1 text-[10px] text-[var(--c-text-muted)]">
              Wskazówka: zaznacz węzeł na liście - jego środek bboxa (mm) możesz przepisać jako anchor.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">Sloty materiałowe (w tym strona A i B)</h2>
            {materialBindings.map((binding, index) => (
              <div key={index} className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                <select className="rounded border border-[var(--c-border)] px-1.5 py-1" disabled={readOnly} value={binding.slotKey} onChange={(e) => setMaterialBindings(materialBindings.map((b, i) => (i === index ? { ...b, slotKey: e.target.value } : b)))}>
                  {MATERIAL_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </select>
                <span className="text-[var(--c-text-muted)]">role:</span>
                <select multiple className="min-w-40 rounded border border-[var(--c-border)] px-1.5 py-1" disabled={readOnly} value={binding.appliesToRoles} onChange={(e) => { const roles = [...e.target.selectedOptions].map((o) => o.value); setMaterialBindings(materialBindings.map((b, i) => (i === index ? { ...b, appliesToRoles: roles } : b))); }}>
                  {[...new Set(bindings.map((b) => b.role))].map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                {!readOnly ? (
                  <button className="text-[var(--c-error)]" onClick={() => setMaterialBindings(materialBindings.filter((_, i) => i !== index))}>✕</button>
                ) : null}
              </div>
            ))}
            {!readOnly ? (
              <Button variant="ghost" onClick={() => setMaterialBindings([...materialBindings, { slotKey: 'leaf_side_a', appliesToRoles: bindings[0] ? [bindings[0].role] : [] }])}>
                + dodaj slot
              </Button>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
