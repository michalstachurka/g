'use client';

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

/**
 * Współdzielone komponenty bez logiki domenowej. Kolory pochodzą z tokenów
 * tenanta przez zmienne CSS (--c-*), ustawiane w layoutach aplikacji.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      'bg-[var(--c-primary)] text-white hover:opacity-90 disabled:opacity-40 border border-transparent',
    secondary:
      'bg-[var(--c-surface)] text-[var(--c-text)] border border-[var(--c-border)] hover:border-[var(--c-primary)]',
    ghost: 'bg-transparent text-[var(--c-text)] hover:bg-black/5 border border-transparent',
    danger: 'bg-[var(--c-error)] text-white hover:opacity-90 border border-transparent',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius)] px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed',
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius)] border border-[var(--c-border)] bg-[var(--c-surface)]',
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'success' | 'warning' | 'error' }) {
  const tones = {
    neutral: 'bg-black/5 text-[var(--c-text-muted)]',
    success: 'bg-[color-mix(in_srgb,var(--c-success)_12%,white)] text-[var(--c-success)]',
    warning: 'bg-[color-mix(in_srgb,var(--c-warning)_12%,white)] text-[var(--c-warning)]',
    error: 'bg-[color-mix(in_srgb,var(--c-error)_12%,white)] text-[var(--c-error)]',
  };
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}
      {...props}
    />
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-[var(--c-text-muted)]" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--c-border)] border-t-[var(--c-primary)]" />
      {label}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-modal>
      <div
        className={cn('max-h-[90vh] w-full overflow-auto rounded-[var(--radius)] bg-[var(--c-surface)] p-5 shadow-xl', wide ? 'max-w-3xl' : 'max-w-md')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--c-text)]">{title}</h2>
          <button onClick={onClose} aria-label="Zamknij" className="rounded p-1 text-[var(--c-text-muted)] hover:bg-black/5">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FieldLabel({ label, required, tooltip }: { label: string; required?: boolean; tooltip?: string | null }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="text-sm font-medium text-[var(--c-text)]">
        {label}
        {required ? <span className="text-[var(--c-error)]"> *</span> : null}
      </span>
      {tooltip ? (
        <span className="group relative inline-flex">
          <span className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-black/10 text-[10px] text-[var(--c-text-muted)]">?</span>
          <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-56 -translate-x-1/2 rounded-md bg-[#26282c] p-2 text-xs text-white group-hover:block">
            {tooltip}
          </span>
        </span>
      ) : null}
    </div>
  );
}
