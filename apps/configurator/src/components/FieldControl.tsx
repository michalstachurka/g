'use client';

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
      case 'dimensions':
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="w-32 rounded-[var(--radius)] border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--c-primary)]"
              value={typeof value === 'number' ? value : Number(value ?? field.defaultValue ?? 0)}
              min={field.min ?? undefined}
              max={field.max ?? undefined}
              step={field.step ?? 1}
              onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
              aria-label={field.label}
            />
            {field.unit ? <span className="text-sm text-[var(--c-text-muted)]">{field.unit}</span> : null}
            {field.min != null && field.max != null ? (
              <span className="text-xs text-[var(--c-text-muted)]">zakres {field.min}-{field.max}</span>
            ) : null}
          </div>
        );
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
