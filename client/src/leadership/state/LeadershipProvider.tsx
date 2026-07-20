/**
 * LeadershipProvider — the single source of state for the Leadership Dashboard
 * module.
 *
 * It holds the parsed {@link DashboardModel}, the parse `status`/`error`, the
 * current {@link FilterSelection}, the derived filter {@link FilterOptions} and
 * {@link FilteredDataset}, the color `theme`, and the KPI `search` text, and it
 * exposes actions to drive them.
 *
 * Wiring (per design "State Layer" and "Error Handling"):
 *  - `uploadWorkbook` sets `status: 'parsing'`, runs {@link excelParser}, and on
 *    success stores the model, derives `options`, resets the selection, and
 *    computes `filtered`. On a parse error it sets `status: 'error'` and the
 *    `error` WITHOUT mutating `model` — existing views stay on prior data
 *    (Req 1.7, design Error Handling).
 *  - `updateSelection` merges a patch into the selection and recomputes
 *    `filtered` (Req 6.4, 7.5, 10.4).
 *  - `clearFilters` resets the selection to the empty selection and recomputes
 *    `filtered` from the full model (Req 10.6).
 *  - `setSearch` / `toggleTheme` update the search text and theme.
 *
 * The `FilterController` derives `options`/`filtered`; when no model is loaded
 * `options` is a stable empty set and `filtered` is `null`.
 */
import { useCallback, useMemo, useReducer, type ReactNode } from 'react';
import type {
  DashboardModel,
  FilterOptions,
  FilterSelection,
  FilteredDataset,
} from '../model/types';
import { excelParser, type ParseError } from '../services/excel-parser';
import {
  applyFilters,
  deriveOptions,
  emptySelection,
} from '../services/filter-controller';
import {
  LeadershipContext,
  type LeadershipContextValue,
  type LeadershipState,
} from './LeadershipContext';

/** Stable empty options used whenever no model is loaded. */
const EMPTY_OPTIONS: FilterOptions = {
  months: [],
  years: [],
  teams: [],
  kpis: [],
  pillars: [],
  statuses: [],
  businessUnits: null,
};

/** The initial module state before any workbook is uploaded. */
const INITIAL_STATE: LeadershipState = {
  model: null,
  status: 'idle',
  error: null,
  selection: emptySelection(),
  options: EMPTY_OPTIONS,
  filtered: null,
  theme: 'light',
  search: '',
};

/** Internal reducer actions. */
type Action =
  | { type: 'PARSE_START' }
  | { type: 'PARSE_SUCCESS'; model: DashboardModel }
  | { type: 'PARSE_ERROR'; error: ParseError }
  | { type: 'UPDATE_SELECTION'; patch: Partial<FilterSelection> }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'SET_SEARCH'; text: string }
  | { type: 'TOGGLE_THEME' };

/**
 * Recompute the derived `filtered` dataset for a model + selection. Returns
 * `null` when there is no model so views can render an empty state.
 */
function computeFiltered(
  model: DashboardModel | null,
  selection: FilterSelection
): FilteredDataset | null {
  return model === null ? null : applyFilters(model, selection);
}

function reducer(state: LeadershipState, action: Action): LeadershipState {
  switch (action.type) {
    case 'PARSE_START':
      // Enter the parsing state without disturbing the current model/selection
      // so existing views keep rendering until a result arrives.
      return { ...state, status: 'parsing', error: null };

    case 'PARSE_SUCCESS': {
      // A new workbook replaces the model; derive options, reset the selection
      // to "show everything", and recompute the filtered dataset (Req 1.7).
      const selection = emptySelection();
      return {
        ...state,
        model: action.model,
        status: 'ready',
        error: null,
        selection,
        options: deriveOptions(action.model),
        filtered: computeFiltered(action.model, selection),
      };
    }

    case 'PARSE_ERROR':
      // Do NOT mutate `model` (or its derived state) on parse error; existing
      // views remain on the previously parsed data (design Error Handling).
      return { ...state, status: 'error', error: action.error };

    case 'UPDATE_SELECTION': {
      // Merge the patch into the current selection and recompute the filtered
      // dataset (Req 6.4, 7.5, 10.4).
      const selection: FilterSelection = { ...state.selection, ...action.patch };
      return {
        ...state,
        selection,
        filtered: computeFiltered(state.model, selection),
      };
    }

    case 'CLEAR_FILTERS': {
      // Reset to the empty selection → full dataset (Req 10.6).
      const selection = emptySelection();
      return {
        ...state,
        selection,
        filtered: computeFiltered(state.model, selection),
      };
    }

    case 'SET_SEARCH':
      return { ...state, search: action.text };

    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'light' ? 'dark' : 'light' };

    default:
      return state;
  }
}

export interface LeadershipProviderProps {
  children: ReactNode;
}

/**
 * Provides Leadership Dashboard state and actions to all descendant views via
 * {@link LeadershipContext}. Consume it with the `useLeadership` hook.
 */
export function LeadershipProvider({ children }: LeadershipProviderProps) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const uploadWorkbook = useCallback((buffer: ArrayBuffer) => {
    // Signal parsing first (design: set status 'parsing', then parse).
    dispatch({ type: 'PARSE_START' });
    const result = excelParser.parse(buffer);
    if (result.ok) {
      dispatch({ type: 'PARSE_SUCCESS', model: result.model });
    } else {
      dispatch({ type: 'PARSE_ERROR', error: result.error });
    }
  }, []);

  const updateSelection = useCallback((patch: Partial<FilterSelection>) => {
    dispatch({ type: 'UPDATE_SELECTION', patch });
  }, []);

  const clearFilters = useCallback(() => {
    dispatch({ type: 'CLEAR_FILTERS' });
  }, []);

  const setSearch = useCallback((text: string) => {
    dispatch({ type: 'SET_SEARCH', text });
  }, []);

  const toggleTheme = useCallback(() => {
    dispatch({ type: 'TOGGLE_THEME' });
  }, []);

  const value = useMemo<LeadershipContextValue>(
    () => ({
      ...state,
      uploadWorkbook,
      updateSelection,
      clearFilters,
      setSearch,
      toggleTheme,
    }),
    [state, uploadWorkbook, updateSelection, clearFilters, setSearch, toggleTheme]
  );

  // Apply the selected color mode to every view by wrapping the whole subtree
  // in a themed root. This is what makes toggling the theme propagate across
  // all views (Req 13.1, 13.2): the `data-theme` attribute and theme class flip
  // together whenever `state.theme` changes.
  return (
    <LeadershipContext.Provider value={value}>
      <div
        className={`leadership-root leadership-theme-${state.theme}`}
        data-theme={state.theme}
      >
        {children}
      </div>
    </LeadershipContext.Provider>
  );
}
