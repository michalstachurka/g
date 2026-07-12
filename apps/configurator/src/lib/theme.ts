import type { CSSProperties } from 'react';
import type { PublicBranding } from '@door/contracts';

/** Tokeny wyglądu tenanta jako zmienne CSS - white-label bez zmian w kodzie. */
export function themeVars(branding: PublicBranding): CSSProperties {
  const t = branding.theme;
  return {
    '--c-primary': t.colorPrimary,
    '--c-accent': t.colorAccent,
    '--c-bg': t.colorBackground,
    '--c-surface': t.colorSurface,
    '--c-text': t.colorText,
    '--c-text-muted': t.colorTextMuted,
    '--c-border': t.colorBorder,
    '--c-success': t.colorSuccess,
    '--c-warning': t.colorWarning,
    '--c-error': t.colorError,
    '--radius': `${t.radiusPx}px`,
    '--font-heading': t.fontHeading,
    '--font-body': t.fontBody,
    '--panel-width': `${branding.layout.panelWidthPx}px`,
    '--viewer-h-mobile': `${branding.layout.viewerHeightMobileVh}vh`,
  } as CSSProperties;
}
