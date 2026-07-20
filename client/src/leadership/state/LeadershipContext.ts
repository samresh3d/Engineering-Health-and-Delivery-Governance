/**
 * Shared React context for the Leadership Dashboard state layer.
 *
 * The context value combines the module {@link LeadershipState} with the
 * {@link LeadershipActions}. It is defined in its own file (separate from the
 * provider component) so the `useLeadership` hook can import the context without
 * pulling in the provider's implementation, and to keep fast-refresh happy.
 */
import { createContext } from 'react';
import type {
  DashboardModel,
  FilterOptions,
  FilterSelection,
  FilteredDataset,
} from '../model/types';
import type { ParseError } from '../services/excel-parser';

/** The status of the module with respect to workbook parsing. */
export type LeadershipStatus = 'idle' | 'parsing' | 'ready' | 'error';

/** The color theme applied across every view. */
export type LeadershipTheme = 'light' | 'dark';

/** All module state exposed through the context. */
export interface LeadershipState {
  model: DashboardModel | null;
  status: LeadershipStatus;
  error: ParseError | null;
  selection: FilterSelection;
  /** Derived from the model; empty options when no model is loaded. */
  options: FilterOptions;
  /** Derived from the model + selection; `null` when no model is loaded. */
  filtered: FilteredDataset | null;
  theme: LeadershipTheme;
  search: string;
}

/** Actions callers use to drive the module state. */
export interface LeadershipActions {
  uploadWorkbook(buffer: ArrayBuffer): void;
  updateSelection(patch: Partial<FilterSelection>): void;
  clearFilters(): void;
  setSearch(text: string): void;
  toggleTheme(): void;
}

/** The full context value: state + actions. */
export type LeadershipContextValue = LeadershipState & LeadershipActions;

/**
 * The context is `null` until a `LeadershipProvider` supplies a value. The
 * `useLeadership` hook throws when the value is still `null` (i.e. the hook was
 * used outside a provider).
 */
export const LeadershipContext = createContext<LeadershipContextValue | null>(
  null
);
