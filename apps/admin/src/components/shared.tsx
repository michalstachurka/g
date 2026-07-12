'use client';

import { useState } from 'react';
import { Badge, Button, cn } from '@door/ui';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-[var(--c-text-muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'published' || status === 'done' || status === 'valid'
      ? 'success'
      : status === 'failed' || status === 'invalid'
        ? 'error'
        : status === 'draft' || status === 'queued' || status === 'processing'
          ? 'warning'
          : 'neutral';
  const labels: Record<string, string> = {
    published: 'opublikowany',
    draft: 'szkic',
    archived: 'archiwum',
    valid: 'poprawny',
    invalid: 'niepoprawny',
    queued: 'w kolejce',
    processing: 'w toku',
    done: 'gotowy',
    failed: 'błąd',
    new: 'nowy',
    contacted: 'w kontakcie',
    closed: 'zamknięty',
    saved: 'zapisana',
  };
  return <Badge tone={tone}>{labels[status] ?? status}</Badge>;
}

export function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--c-border)] bg-[var(--c-surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--c-border)] text-left text-xs uppercase tracking-wide text-[var(--c-text-muted)]">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2.5 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-8 text-center text-[var(--c-text-muted)]">
                Brak danych.
              </td>
            </tr>
          ) : (
            rows.map((cells, i) => (
              <tr key={i} className="border-b border-[var(--c-border)] last:border-0 hover:bg-black/2">
                {cells.map((cell, j) => (
                  <td key={j} className="px-3 py-2 align-middle">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Edytor strukturalny JSON z walidacją i czytelnym błędem. Używany dla reguł,
 * cenników, BOM i szablonów (dane deklaratywne, nigdy kod).
 */
export function JsonEditor({
  value,
  onChange,
  rows = 18,
  onValidate,
}: {
  value: unknown;
  onChange: (parsed: unknown) => void;
  rows?: number;
  onValidate?: (parsed: unknown) => string | null;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <textarea
        className={cn(
          'w-full rounded-[var(--radius)] border bg-[#101214] p-3 font-mono text-xs leading-5 text-[#d8e0d8] outline-none',
          error ? 'border-[var(--c-error)]' : 'border-[var(--c-border)]',
        )}
        rows={rows}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value);
            const problem = onValidate?.(parsed) ?? null;
            if (problem) {
              setError(problem);
            } else {
              setError(null);
              onChange(parsed);
            }
          } catch (err) {
            setError(`Niepoprawny JSON: ${(err as Error).message}`);
          }
        }}
      />
      {error ? <p className="mt-1 text-xs text-[var(--c-error)]">{error}</p> : null}
    </div>
  );
}

export function InlineForm({ onSubmit, children, submitLabel = 'Dodaj' }: { onSubmit: () => Promise<void> | void; children: React.ReactNode; submitLabel?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      <Button type="submit" disabled={busy}>
        {busy ? '…' : submitLabel}
      </Button>
      {error ? <p className="w-full text-xs text-[var(--c-error)]">{error}</p> : null}
    </form>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, className, ...rest } = props;
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-[var(--c-text-muted)]">{label}</span>
      <input
        className={cn('rounded-[var(--radius)] border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-primary)]', className)}
        {...rest}
      />
    </label>
  );
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: { value: string; label: string }[] }) {
  const { label, options, className, ...rest } = props;
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-[var(--c-text-muted)]">{label}</span>
      <select
        className={cn('rounded-[var(--radius)] border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-primary)]', className)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
