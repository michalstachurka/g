'use client';

import { useState } from 'react';
import { Button, Card } from '@door/ui';
import type { VersionedRow } from '@/lib/admin-api';
import { JsonEditor, StatusBadge } from './shared';

/**
 * Wspólny widok dla bytów wersjonowanych (reguły, cenniki, BOM, szablony):
 * lista wersji, edycja szkicu (dane deklaratywne JSON z walidacją Zod po
 * stronie klienta i serwera), publikacja, test na przykładowych danych.
 */
export function VersionedEditor({
  rows,
  editableField,
  onCreateVersion,
  onSaveDraft,
  onPublish,
  onTest,
  testDefaults,
  validate,
  extraColumns,
}: {
  rows: VersionedRow[];
  editableField: string;
  onCreateVersion: (base: VersionedRow | null, payloadField: unknown) => Promise<void>;
  onSaveDraft?: (row: VersionedRow, payloadField: unknown) => Promise<void>;
  onPublish: (row: VersionedRow) => Promise<void>;
  onTest?: (row: VersionedRow, testInput: unknown) => Promise<unknown>;
  testDefaults?: unknown;
  validate?: (parsed: unknown) => string | null;
  extraColumns?: (row: VersionedRow) => React.ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [testInput, setTestInput] = useState<unknown>(testDefaults ?? {});
  const [testResult, setTestResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-md bg-[color-mix(in_srgb,var(--c-error)_8%,white)] px-3 py-2 text-xs text-[var(--c-error)]">{error}</p> : null}
      {rows.map((row) => {
        const open = openId === row.id;
        const payload = drafts[row.id] ?? (row[editableField] as unknown);
        const editable = row.status !== 'published';
        return (
          <Card key={row.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button className="text-left" onClick={() => setOpenId(open ? null : row.id)}>
                <span className="font-semibold">{row.name}</span>{' '}
                <span className="text-xs text-[var(--c-text-muted)]">v{row.version}</span>
              </button>
              <div className="flex items-center gap-2">
                {extraColumns?.(row)}
                <StatusBadge status={row.status} />
                {editable ? (
                  <Button variant="secondary" onClick={() => run(() => onPublish(row))}>
                    Opublikuj
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => run(() => onCreateVersion(row, payload))}
                    title="Utwórz nową wersję roboczą na bazie tej"
                  >
                    Nowa wersja
                  </Button>
                )}
              </div>
            </div>
            {open ? (
              <div className="mt-3 space-y-3">
                <JsonEditor
                  value={payload}
                  onChange={(parsed) => setDrafts({ ...drafts, [row.id]: parsed })}
                  onValidate={validate}
                />
                <div className="flex flex-wrap gap-2">
                  {editable && onSaveDraft ? (
                    <Button variant="secondary" onClick={() => run(() => onSaveDraft(row, drafts[row.id] ?? payload))}>
                      Zapisz szkic
                    </Button>
                  ) : null}
                  {onTest ? (
                    <details className="w-full rounded-md border border-[var(--c-border)] p-3">
                      <summary className="cursor-pointer text-sm font-medium">Przetestuj na przykładowej konfiguracji</summary>
                      <div className="mt-2 grid gap-3 lg:grid-cols-2">
                        <div>
                          <p className="mb-1 text-xs text-[var(--c-text-muted)]">Dane wejściowe testu</p>
                          <JsonEditor rows={8} value={testInput} onChange={setTestInput} />
                          <Button className="mt-2" variant="secondary" onClick={() => run(async () => setTestResult(await onTest(row, testInput)))}>
                            Uruchom test
                          </Button>
                        </div>
                        <div>
                          <p className="mb-1 text-xs text-[var(--c-text-muted)]">Wynik</p>
                          <pre className="max-h-64 overflow-auto rounded-md bg-[#101214] p-3 text-xs text-[#9fe3b3]">
                            {testResult ? JSON.stringify(testResult, null, 2) : '(uruchom test)'}
                          </pre>
                        </div>
                      </div>
                    </details>
                  ) : null}
                </div>
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
