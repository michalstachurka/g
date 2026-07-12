/**
 * Publiczny stan interakcji konfiguratora (zustand). Zgodnie ze specyfikacją
 * NIE zawiera reguł produktowych, formuł cen ani decyzji wizualnych -
 * jedynym źródłem prawdy jest odpowiedź `evaluate` z backendu.
 */
import { create } from 'zustand';
import type { EvaluateResponse, SelectionValue } from '@door/contracts';

export interface SelectionsState {
  categoryKey: string | null;
  modelKey: string | null;
  selections: Record<string, SelectionValue>;
  revision: number;
  /** Ostatnia zatwierdzona odpowiedź backendu (cache widoku, nie logika). */
  lastEvaluate: EvaluateResponse | null;
  evaluating: boolean;
  shareId: string | null;
  doorOpen: boolean;
  viewSide: 'a' | 'b';
  history: { selections: Record<string, SelectionValue>; modelKey: string | null }[];
  future: { selections: Record<string, SelectionValue>; modelKey: string | null }[];

  start: (categoryKey: string) => void;
  setModel: (modelKey: string) => void;
  setSelection: (fieldKey: string, value: SelectionValue) => void;
  applyEvaluate: (response: EvaluateResponse) => void;
  setEvaluating: (value: boolean) => void;
  setShareId: (shareId: string | null) => void;
  toggleDoor: () => void;
  setViewSide: (side: 'a' | 'b') => void;
  undo: () => void;
  redo: () => void;
  hydrate: (data: { categoryKey: string; modelKey: string | null; selections: Record<string, SelectionValue>; shareId?: string | null }) => void;
}

const HISTORY_LIMIT = 50;

export const useConfiguratorStore = create<SelectionsState>((set, get) => ({
  categoryKey: null,
  modelKey: null,
  selections: {},
  revision: 0,
  lastEvaluate: null,
  evaluating: false,
  shareId: null,
  doorOpen: false,
  viewSide: 'a',
  history: [],
  future: [],

  start: (categoryKey) =>
    set({ categoryKey, modelKey: null, selections: {}, revision: 0, lastEvaluate: null, shareId: null, history: [], future: [] }),

  setModel: (modelKey) => {
    const { selections, modelKey: prevModel, history } = get();
    set({
      modelKey,
      revision: get().revision + 1,
      history: [...history.slice(-HISTORY_LIMIT), { selections: { ...selections }, modelKey: prevModel }],
      future: [],
    });
  },

  setSelection: (fieldKey, value) => {
    const { selections, modelKey, history } = get();
    set({
      selections: { ...selections, [fieldKey]: value },
      revision: get().revision + 1,
      history: [...history.slice(-HISTORY_LIMIT), { selections: { ...selections }, modelKey }],
      future: [],
    });
  },

  applyEvaluate: (response) => {
    // Automatyczne korekty backendu wracają do stanu wyborów (jednokierunkowo).
    const { selections } = get();
    const adjusted = { ...selections };
    for (const adjustment of response.automaticAdjustments) {
      adjusted[adjustment.fieldKey] = adjustment.to;
    }
    set({ lastEvaluate: response, selections: adjusted, evaluating: false });
  },

  setEvaluating: (value) => set({ evaluating: value }),
  setShareId: (shareId) => set({ shareId }),
  toggleDoor: () => set({ doorOpen: !get().doorOpen }),
  setViewSide: (side) => set({ viewSide: side }),

  undo: () => {
    const { history, future, selections, modelKey } = get();
    const previous = history[history.length - 1];
    if (!previous) return;
    set({
      selections: previous.selections,
      modelKey: previous.modelKey,
      history: history.slice(0, -1),
      future: [{ selections: { ...selections }, modelKey }, ...future].slice(0, HISTORY_LIMIT),
      revision: get().revision + 1,
    });
  },

  redo: () => {
    const { history, future, selections, modelKey } = get();
    const next = future[0];
    if (!next) return;
    set({
      selections: next.selections,
      modelKey: next.modelKey,
      future: future.slice(1),
      history: [...history, { selections: { ...selections }, modelKey }].slice(-HISTORY_LIMIT),
      revision: get().revision + 1,
    });
  },

  hydrate: (data) =>
    set({
      categoryKey: data.categoryKey,
      modelKey: data.modelKey,
      selections: data.selections,
      shareId: data.shareId ?? null,
      revision: 1,
      history: [],
      future: [],
    }),
}));

/** Debounce + anulowanie poprzednich przeliczeń evaluate. */
export function createEvaluateScheduler(
  run: (signal: AbortSignal) => Promise<EvaluateResponse | null>,
  onResult: (response: EvaluateResponse) => void,
  delayMs = 250,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        controller?.abort();
        controller = new AbortController();
        try {
          const response = await run(controller.signal);
          if (response) onResult(response);
        } catch (error) {
          if ((error as Error).name !== 'AbortError') console.error(error);
        }
      }, delayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      controller?.abort();
    },
  };
}
