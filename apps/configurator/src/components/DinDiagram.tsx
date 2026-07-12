'use client';

/** Czytelny diagram kierunku otwierania (rzut z góry, konwencja od strony zawiasów). */
export function DinDiagram({ hingeSide, opensInward }: { hingeSide: 'left' | 'right'; opensInward: boolean }) {
  const mirrored = hingeSide === 'right';
  const arcSweep = opensInward ? 1 : 0;
  const leafY2 = opensInward ? 44 : 8;
  return (
    <div className="flex items-center gap-3 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5">
      <svg width="72" height="52" viewBox="0 0 72 52" style={{ transform: mirrored ? 'scaleX(-1)' : undefined }}>
        <line x1="4" y1="26" x2="18" y2="26" stroke="var(--c-text-muted)" strokeWidth="4" />
        <line x1="54" y1="26" x2="68" y2="26" stroke="var(--c-text-muted)" strokeWidth="4" />
        <circle cx="20" cy="26" r="2.6" fill="var(--c-accent)" />
        <line x1="20" y1="26" x2="20" y2={leafY2} stroke="var(--c-text)" strokeWidth="3" strokeLinecap="round" />
        <path
          d={`M 52 26 A 32 32 0 0 ${arcSweep} 20 ${leafY2}`}
          fill="none"
          stroke="var(--c-accent)"
          strokeWidth="1.4"
          strokeDasharray="3 3"
        />
      </svg>
      <div className="text-xs leading-5 text-[var(--c-text-muted)]">
        <div className="font-medium text-[var(--c-text)]">
          Drzwi {hingeSide === 'left' ? 'lewe' : 'prawe'} (DIN {hingeSide === 'left' ? 'L' : 'P'})
        </div>
        <div>zawiasy po stronie {hingeSide === 'left' ? 'lewej' : 'prawej'}, otwierane {opensInward ? 'do wnętrza' : 'na zewnątrz'}</div>
      </div>
    </div>
  );
}
