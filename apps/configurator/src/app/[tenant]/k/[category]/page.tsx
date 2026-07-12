'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { EvaluateRequest } from '@door/contracts';
import { useConfiguratorStore, createEvaluateScheduler } from '@door/config-engine';
import { Badge, Button, Card, Modal, Spinner, cn } from '@door/ui';
import { formatPrice, publicApi } from '@/lib/api';
import { useBranding, useText } from '@/components/providers';
import { DoorViewer } from '@/components/DoorViewer';
import { DinDiagram } from '@/components/DinDiagram';
import { FieldControl } from '@/components/FieldControl';
import { SaveShareDialog } from '@/components/SaveShareDialog';

export default function ConfiguratorPage({
  params,
}: {
  params: Promise<{ tenant: string; category: string }>;
}) {
  const { tenant, category } = use(params);
  const branding = useBranding();
  const store = useConfiguratorStore();
  const [activeStep, setActiveStep] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const priceLabel = useText('price_label', 'Cena');

  const { data: schema, isLoading } = useQuery({
    queryKey: ['schema', tenant, category],
    queryFn: () => publicApi.schema(tenant, category),
  });

  // Start kategorii + model domyślny.
  useEffect(() => {
    if (store.categoryKey !== category) store.start(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);
  useEffect(() => {
    if (schema && !store.modelKey && schema.models[0]) store.setModel(schema.models[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, store.modelKey]);

  // Po każdej zmianie: evaluate na backendzie (debounce + anulowanie).
  const requestRef = useRef<EvaluateRequest | null>(null);
  requestRef.current = {
    categoryKey: category,
    modelKey: store.modelKey,
    selections: store.selections,
    revision: store.revision,
  };
  const scheduler = useMemo(
    () =>
      createEvaluateScheduler(
        async (signal) => {
          const request = requestRef.current;
          if (!request?.modelKey) return null;
          useConfiguratorStore.getState().setEvaluating(true);
          return publicApi.evaluate(tenant, request, signal);
        },
        (response) => useConfiguratorStore.getState().applyEvaluate(response),
        220,
      ),
    [tenant],
  );
  useEffect(() => {
    if (store.modelKey) scheduler.schedule();
    return () => undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.modelKey, store.revision]);
  useEffect(() => () => scheduler.cancel(), [scheduler]);

  const evaluate = store.lastEvaluate;
  const renderSpec = evaluate?.renderSpec ?? null;
  const issuesByField = useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of evaluate?.errors ?? []) if (issue.fieldKey) map.set(issue.fieldKey, issue.message);
    return map;
  }, [evaluate]);

  const saveRequest = useCallback(async () => {
    const request = requestRef.current;
    if (!request) throw new Error('Brak konfiguracji.');
    const result = await publicApi.saveConfiguration(tenant, {
      request,
      shareId: store.shareId,
    });
    useConfiguratorStore.getState().setShareId(result.shareId);
    return result;
  }, [tenant, store.shareId]);

  if (isLoading || !schema) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner label="Wczytywanie konfiguratora…" />
      </div>
    );
  }

  const panelRight = branding.layout.preset !== 'panel_left';
  const globalErrors = (evaluate?.errors ?? []).filter((e) => !e.fieldKey);

  const viewer = (
    <div className={cn('relative bg-[#eceae5]', fullscreen ? 'fixed inset-0 z-40' : 'h-[var(--viewer-h-mobile)] lg:h-auto lg:flex-1')}>
      {renderSpec ? (
        <DoorViewer tenant={tenant} renderSpec={renderSpec} open={store.doorOpen} viewSide={store.viewSide} />
      ) : (
        <div className="grid h-full place-items-center p-8 text-center">
          {evaluate && evaluate.visualizationStatus === 'missing_asset' ? (
            <div className="max-w-sm space-y-2">
              <Badge tone="warning">Wizualizacja niedostępna</Badge>
              <p className="text-sm text-[var(--c-text-muted)]">{evaluate.missingAssetNotice}</p>
            </div>
          ) : (
            <Spinner label="Przeliczanie konfiguracji…" />
          )}
        </div>
      )}
      {renderSpec ? (
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          <ViewerButton onClick={() => store.toggleDoor()} label={store.doorOpen ? 'Zamknij drzwi' : 'Otwórz drzwi'}>
            {store.doorOpen ? '⇤' : '⇥'}
          </ViewerButton>
          <ViewerButton
            onClick={() => store.setViewSide(store.viewSide === 'a' ? 'b' : 'a')}
            label={`Pokaż stronę ${store.viewSide === 'a' ? 'B' : 'A'}`}
          >
            {store.viewSide === 'a' ? 'B' : 'A'}
          </ViewerButton>
          <ViewerButton onClick={() => setFullscreen((v) => !v)} label={fullscreen ? 'Zamknij pełny ekran' : 'Pełny ekran'}>
            {fullscreen ? '✕' : '⛶'}
          </ViewerButton>
        </div>
      ) : null}
      {store.evaluating ? (
        <div className="absolute right-3 top-3">
          <Spinner />
        </div>
      ) : null}
    </div>
  );

  const panel = (
    <div
      className="flex w-full flex-col border-[var(--c-border)] bg-[var(--c-surface)] lg:h-[calc(100vh-3.5rem)] lg:w-[var(--panel-width)] lg:overflow-y-auto"
      style={{ borderLeftWidth: panelRight ? 1 : 0, borderRightWidth: panelRight ? 0 : 1 }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--c-border)] px-4 py-3">
        <div>
          <Link href={`/${tenant}`} className="text-xs text-[var(--c-text-muted)] hover:underline">
            ← {schema.category.name}
          </Link>
          <h1 className="text-lg font-semibold">{schema.models.find((m) => m.key === store.modelKey)?.name ?? 'Konfiguracja'}</h1>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" onClick={() => store.undo()} title="Cofnij" aria-label="Cofnij">↶</Button>
          <Button variant="ghost" onClick={() => store.redo()} title="Ponów" aria-label="Ponów">↷</Button>
        </div>
      </div>

      {/* Wybór modelu */}
      <section className="border-b border-[var(--c-border)] px-4 py-4">
        <h2 className="mb-2 text-sm font-semibold">Model</h2>
        <div className="grid grid-cols-2 gap-2">
          {schema.models.map((model) => (
            <button
              key={model.key}
              onClick={() => store.setModel(model.key)}
              className={cn(
                'rounded-[var(--radius)] border p-3 text-left transition',
                store.modelKey === model.key
                  ? 'border-[var(--c-primary)] bg-[color-mix(in_srgb,var(--c-primary)_6%,white)]'
                  : 'border-[var(--c-border)] hover:border-[var(--c-primary)]',
              )}
            >
              <div className="text-sm font-medium">{model.name}</div>
              <div className="mt-0.5 text-xs text-[var(--c-text-muted)]">{model.familyName}</div>
              {!model.visualizationReady ? <Badge tone="warning" className="mt-1">bez 3D</Badge> : null}
            </button>
          ))}
        </div>
      </section>

      {/* Kroki ze schematu tenanta */}
      <div className="flex-1">
        {schema.steps.map((step, index) => {
          const openStep = index === activeStep;
          const stepFields = step.fields.filter((f) => !(evaluate?.hiddenFields ?? []).includes(f.key));
          if (stepFields.length === 0) return null;
          return (
            <section key={step.key} className="border-b border-[var(--c-border)]">
              <button
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() => setActiveStep(openStep ? -1 : index)}
                aria-expanded={openStep}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[11px]', openStep ? 'bg-[var(--c-primary)] text-white' : 'bg-black/10 text-[var(--c-text-muted)]')}>
                    {index + 1}
                  </span>
                  {step.title}
                </span>
                <span className="text-[var(--c-text-muted)]">{openStep ? '−' : '+'}</span>
              </button>
              {openStep ? (
                <div className="space-y-4 px-4 pb-4">
                  {step.description ? <p className="text-xs text-[var(--c-text-muted)]">{step.description}</p> : null}
                  {stepFields.map((field) => (
                    <FieldControl
                      key={field.key}
                      field={field}
                      value={store.selections[field.key] ?? field.defaultValue}
                      availability={evaluate?.availableOptions[field.key]}
                      issueMessage={issuesByField.get(field.key)}
                      onChange={(value) => store.setSelection(field.key, value)}
                    />
                  ))}
                  {step.key === 'kierunek' && evaluate?.renderSpec ? (
                    <DinDiagram
                      hingeSide={evaluate.renderSpec.dinDiagram.hingeSide}
                      opensInward={evaluate.renderSpec.dinDiagram.opensInward}
                    />
                  ) : null}
                  <div className="flex justify-between pt-1">
                    <Button variant="ghost" disabled={index === 0} onClick={() => setActiveStep(index - 1)}>
                      Wstecz
                    </Button>
                    <Button variant="secondary" disabled={index >= schema.steps.length - 1} onClick={() => setActiveStep(index + 1)}>
                      Dalej
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}

        {/* Komunikaty walidacji i korekt */}
        <div className="space-y-2 px-4 py-4">
          {globalErrors.map((issue) => (
            <p key={issue.code + issue.message} className="rounded-md bg-[color-mix(in_srgb,var(--c-error)_8%,white)] px-3 py-2 text-xs text-[var(--c-error)]">
              {issue.message}
            </p>
          ))}
          {(evaluate?.warnings ?? []).map((issue) => (
            <p key={issue.code + issue.message} className="rounded-md bg-[color-mix(in_srgb,var(--c-warning)_10%,white)] px-3 py-2 text-xs text-[var(--c-warning)]">
              {issue.message}
            </p>
          ))}
          {(evaluate?.automaticAdjustments ?? []).map((adjustment) => (
            <p key={adjustment.fieldKey} className="rounded-md bg-black/5 px-3 py-2 text-xs text-[var(--c-text-muted)]">
              {adjustment.reason}
            </p>
          ))}
        </div>
      </div>

      {/* Pasek ceny i CTA */}
      <div className="sticky bottom-0 border-t border-[var(--c-border)] bg-[var(--c-surface)] p-4">
        {branding.layout.showPrice && evaluate?.priceSummary ? (
          <div className="mb-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-[var(--c-text-muted)]">{priceLabel}</span>
              <span className="text-xl font-semibold">
                {evaluate.priceSummary.individualQuote
                  ? 'Wycena indywidualna'
                  : formatPrice(evaluate.priceSummary.amount, evaluate.priceSummary.currency)}
              </span>
            </div>
            {branding.layout.showPriceLines && evaluate.priceSummary.lines?.length ? (
              <details className="mt-1 text-xs text-[var(--c-text-muted)]">
                <summary className="cursor-pointer select-none">Szczegóły ceny</summary>
                <ul className="mt-1 space-y-0.5">
                  {evaluate.priceSummary.lines.map((line, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{line.label}</span>
                      <span>{formatPrice(line.amount, evaluate.priceSummary!.currency)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!evaluate?.valid} onClick={() => setShareOpen(true)}>
            {useTextStatic(branding.texts, 'cta_save', 'Zapisz projekt')}
          </Button>
        </div>
        {!evaluate?.valid && evaluate ? (
          <p className="mt-2 text-center text-xs text-[var(--c-error)]">Popraw błędy konfiguracji, aby zapisać projekt.</p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className={cn('flex flex-col lg:flex-row', panelRight ? '' : 'lg:flex-row-reverse')}>
      {viewer}
      {panel}
      <SaveShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        tenant={tenant}
        onSave={saveRequest}
      />
    </div>
  );
}

function useTextStatic(texts: Record<string, string>, key: string, fallback: string) {
  return texts[key] ?? fallback;
}

function ViewerButton({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--c-border)] bg-white/90 text-sm shadow-sm backdrop-blur transition hover:bg-white"
    >
      {children}
    </button>
  );
}
