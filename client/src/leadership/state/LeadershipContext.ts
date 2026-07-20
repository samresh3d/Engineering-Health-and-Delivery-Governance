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
import type {
  AuditTrail,
  Version,
  GridFilterSelection,
} from '../model/editing-types';
import type { EditHistoryState } from '../services/edit-history';
import type { ImportMode } from '../services/import-service';

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

/**
 * Editing state added on top of the base {@link LeadershipState}. These fields
 * back the data-management features (audit trail, versioning, approvals,
 * undo/redo history, save errors, and the grid filter selection).
 */
export interface LeadershipEditingState {
  auditTrail: AuditTrail;
  versions: Version[];
  currentUser: string | null;
  approvalEnabled: boolean;
  history: EditHistoryState; // undo/redo stacks
  saveError: string | null;
  gridFilter: GridFilterSelection; // Month/Team/Pillar/KPI/Status/Updated By
  /** True when edits have been made since the last saved version checkpoint. */
  hasUnsavedChanges: boolean;
}

/** Actions that drive the editing/data-management state. */
export interface LeadershipEditingActions {
  commitEdit(
    rowId: string,
    field: 'target' | 'actual',
    raw: string,
    comments?: string
  ): void;
  bulkEdit(rowIds: string[], field: 'target' | 'actual', raw: string): void;
  pasteCells(
    anchorRowId: string,
    field: 'target' | 'actual',
    matrix: string[][]
  ): void;
  deleteRows(rowIds: string[]): void;
  undo(): void;
  redo(): void;
  setCurrentUser(name: string): void;
  setApprovalEnabled(enabled: boolean): void;
  submitForApproval(rowId: string): void;
  approve(rowId: string): void;
  reject(rowId: string): void;
  setGridFilter(patch: Partial<GridFilterSelection>): void;
  clearGridFilter(): void;
  importWorkbook(buffer: ArrayBuffer, mode: ImportMode): void;
  restoreVersion(versionId: string): void;
  /** Create a Version checkpoint (snapshot) of the current working set. */
  saveVersion(cycle?: string): void;
}

/** The full context value: state + actions + editing state + editing actions. */
export type LeadershipContextValue = LeadershipState &
  LeadershipActions &
  LeadershipEditingState &
  LeadershipEditingActions;

/**
 * The context is `null` until a `LeadershipProvider` supplies a value. The
 * `useLeadership` hook throws when the value is still `null` (i.e. the hook was
 * used outside a provider).
 */
export const LeadershipContext = createContext<LeadershipContextValue | null>(
  null
);
