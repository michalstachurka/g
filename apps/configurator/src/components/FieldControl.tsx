'use client';

import { useEffect, useRef, useState } from 'react';
import type { AvailableOption, PublicField, SelectionValue } from '@door/contracts';
import { FieldLabel, cn } from '@door/ui';

/**
 * Generyczna kontrolka pola ze schematu tenanta. Dostępność opcji pochodzi
 * WYŁĄCZNIE z odpowiedzi evaluate (żadnych lokalnych reguł produktowych).
 */
export function FieldControl({
  field,
  value,
  availability,
  issueMessage,
  onChange,
}: {
  field: PublicField;
  value: SelectionValue;
  availability?: AvailableOption[];
  issueMessage?: string | null;
  onChange: (value: SelectionValue) => void;
}) {
  const options = availability ?? field.options?.map((o) => ({
    value: o.value,
    label: o.label,
    available: true,
    reasonUnavailable: null,
    imageUrl: o.imageUrl,
    description: o.description,
  })) ?? [];
  const colorByValue = new Map(field.options?.map((o) => [o.value, o.colorHex] as const) ?? []);

  // Pola liczbowe: stan roboczy pozwala swobodnie kasować/wpisywać wartości
  // (bez natychmiastowego resetu do domyślnej); zatwierdzenie po walidacji.
  const committed =
    typeof value === 'number' ? value : Number(value ?? field.defaultValue ?? field.min ?? 0);
  const [draft, setDraft] = useState<string | null>(null);
  const sliderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setDraft(null);
  }, [value]);
  useEffect(() => () => {
    if (sliderTimer.current) clearTimeout(sliderTimer.current);
  }, []);

  const step = field.step ?? (field.unit === 'mm' ? 10 : 1);
  const clamp = (n: number) => {
    let v = n;
    if (field.min != null) v = Math.max(field.min, v);
    if (field.max != null) v = Math.min(field.max, v);
    return Math.round(v);
  };
  const commitNumber = (n: number) => {
    const v = clamp(n);
    if (v !== committed) onChange(v);
    setDraft(null);
  };

  return (
    <div>
      <FieldLabel label={field.label} required={field.required} tooltip={field.tooltip} />
      {renderControl()}
      {issueMessage ? <p className="mt-1 text-xs text-[var(--c-error)]">{issueMessage}</p> : null}
    </div>
  );

  function renderControl() {
    switch (field.type) {
      case 'number':
      case 'dimensions': {
        const shown = draft ?? String(committed);
        const stepBtn =
          'grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius)] border border-[var(--c-border)] bg-[var(--c-surface)] text-lg leading-none text-[var(--c-text)] transition hover:border-[var(--c-primary)] disabled:cursor-not-allowed disabled:opacity-35';
        return (
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={stepBtn}
                aria-label={`Zmniejsz: ${field.label}`}
                disabled={field.min != null && committed <= field.min}
                onClick={() => commitNumber(committed - step)}
              >
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                className="h-10 w-full min-w-0 rounded-[var(--radius)] border border-[var(--c-border)] bg-[var(--c-surface)] px-3 text-center text-sm outline-none focus:border-[var(--c-primary)]"
                value={shown}
                min={field.min ?? undefined}
                max={field.max ?? undefined}
                step={step}
                onChange={(e) => {
                  const raw = e.target.value;
                  setDraft(raw);
                  const n = Number(raw);
                  // Zatwierdzaj w trakcie pisania tylko wartości w zakresie;
                  // stany pośrednie (np. puste pole, "9" przy min 600) czekają.
                  if (
                    raw !== '' &&
                    Number.isFinite(n) &&
                    (field.min == null || n >= field.min) &&
                    (field.max == null || n <= field.max)
                  ) {
                    if (n !== committed) onChange(n);
                  }
                }}
                onBlur={() => {
                  if (draft == null) return;
                  const n = Number(draft);
                  if (draft !== '' && Number.isFinite(n)) commitNumber(n);
                  else setDraft(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                aria-label={field.label}
              />
              <button
                type="button"
                className={stepBtn}
                aria-label={`Zwiększ: ${field.label}`}
                disabled={field.max != null && committed >= field.max}
                onClick={() => commitNumber(committed + step)}
              >
                +
              </button>
              {field.unit ? <span className="shrink-0 text-sm text-[var(--c-text-muted)]">{field.unit}</span> : null}
            </div>
            {field.min != null && field.max != null && field.min < field.max ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  className="h-1.5 w-full cursor-pointer accent-[var(--c-primary)]"
                  min={field.min}
                  max={field.max}
                  step={step}
                  value={clamp(Number(draft ?? committed) || committed)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setDraft(String(n));
                    if (sliderTimer.current) clearTimeout(sliderTimer.current);
                    sliderTimer.current = setTimeout(() => commitNumber(n), 180);
                  }}
                  aria-label={`${field.label} (suwak)`}
                />
                <span className="shrink-0 text-xs tabular-nums text-[var(--c-text-muted)]">
                  {field.min}–{field.max}
                </span>
              </div>
            ) : null}
          </div>
        );
      }
      case 'toggle':
        return (
          <button
            type="button"
            role="switch"
            aria-checked={value === true}
            onClick={() => onChange(!(value === true))}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors',
              value === true ? 'bg-[var(--c-primary)]' : 'bg-black/15',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                value === true ? 'translate-x-5' : 'translate-x-0.5',
              )}
            />
          </button>
        );
      case 'text':
      case 'textarea':
        return field.type === 'textarea' ? (
          <textarea
            className="w-full rounded-[var(--radius)] border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--c-primary)]"
            rows={3}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            aria-label={field.label}
          />
        ) : (
          <input
            type="text"
            className="w-full max-w-xs rounded-[var(--radius)] border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--c-primary)]"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            aria-label={field.label}
          />
        );
      case 'select':
        return (
          <select
            className="w-full max-w-xs rounded-[var(--radius)] border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--c-primary)]"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            aria-label={field.label}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={!option.available}>
                {option.label}
                {!option.available ? ' (niedostępne)' : ''}
              </option>
            ))}
          </select>
        );
      case 'color_select':
        return (
          <div className="flex flex-wrap gap-2">
            {options.map((option) => {
              const selected = value === option.value;
              const color = colorByValue.get(option.value) ?? '#d8d5cf';
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={!option.available}
                  title={option.available ? option.label : `${option.label}: ${option.reasonUnavailable ?? 'niedostępne'}`}
                  onClick={() => onChange(option.value)}
                  className={cn(
                    'group flex flex-col items-center gap-1 rounded-md p-1.5 transition',
                    selected ? 'ring-2 ring-[var(--c-primary)]' : 'hover:bg-black/5',
                    !option.available && 'cursor-not-allowed opacity-35',
                  )}
                >
                  <span
                    className="h-9 w-9 rounded-full border border-black/10 shadow-inner"
                    style={{ background: color ?? undefined }}
                  />
                  <span className="max-w-16 truncate text-[10px] text-[var(--c-text-muted)]">{option.label}</span>
                </button>
              );
            })}
          </div>
        );
      case 'radio_cards':
      default:
        return (
          <div className="grid grid-cols-2 gap-2">
            {options.map((option) => {
              const selected = value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={!option.available}
                  onClick={() => onChange(option.value)}
                  className={cn(
                    'rounded-[var(--radius)] border px-3 py-2.5 text-left text-sm transition',
                    selected
                      ? 'border-[var(--c-primary)] bg-[color-mix(in_srgb,var(--c-primary)_6%,white)] font-medium'
                      : 'border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary)]',
                    !option.available && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <span>{option.label}</span>
                  {!option.available && option.reasonUnavailable ? (
                    <span className="mt-0.5 block text-xs text-[var(--c-warning)]">{option.reasonUnavailable}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        );
    }
  }
}
