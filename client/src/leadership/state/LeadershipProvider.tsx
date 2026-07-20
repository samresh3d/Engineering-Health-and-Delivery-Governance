/**
 * LeadershipProvider — the single source of state for the Leadership Dashboard
 * module, including the Data Management editing layer.
 *
 * Base state (unchanged): the parsed {@link DashboardModel}, the parse
 * `status`/`error`, the current {@link FilterSelection}, the derived filter
 * {@link FilterOptions} and {@link FilteredDataset}, the color `theme`, and the
 * KPI `search` text.
 *
 * Editing state (Data Management): the `auditTrail`, stored `versions`, the
 * `currentUser`, the `approvalEnabled` flag, the undo/redo `history`, the last
 * `saveError`, and the `gridFilter` selection.
 *
 * Editing wiring (design "State Layer", Requirements 2.7, 2.9, 3.1, 3.2, 3.5,
 * 5.5, 8.1–8.7, 10.1):
 *  - Every committed edit pushes an undo snapshot, applies the change to a NEW
 *    model via {@link gridProjector}, records a {@link ChangeRecord} in the
 *    audit trail, recomputes `options`/`filtered` from the APPROVED model
 *    (`approvalService.approvedModel`) so the dashboards reflect approved data,
 *    and auto-saves the working set via {@link persistenceService} (surfacing a
 *    `saveError` on failure).
 *  - On mount the provider attempts `persistenceService.load()` and restores a
 *    previously saved working set when present (Req 10.2). The restore never
 *    throws and never triggers an immediate re-save.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type {
  DashboardModel,
  FilterOptions,
  FilterSelection,
  FilteredDataset,
} from '../model/types';
import type {
  AuditTrail,
  ChangeRecord,
  GridFilterSelection,
  Version,
} from '../model/editing-types';
import { excelParser, type ParseError } from '../services/excel-parser';
import {
  applyFilters,
  deriveOptions,
  emptySelection,
} from '../services/filter-controller';
import { gridProjector } from '../services/grid-projector';
import { validator } from '../services/validator';
import { changeTracker } from '../services/change-tracker';
import {
  approvalService,
  type ApprovalAction,
} from '../services/approval-service';
import {
  emptyHistory,
  pushSnapshot,
  undo as historyUndo,
  redo as historyRedo,
  type EditHistoryState,
} from '../services/edit-history';
import { filterRows } from '../services/grid-filter';
import { importService, type ImportMode } from '../services/import-service';
import {
  persistenceService,
  restoreVersion as restoreVersionInState,
  structuredCloneJson,
  type PersistedState,
} from '../services/persistence-service';
import {
  LeadershipContext,
  type LeadershipContextValue,
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

/** The cleared grid-filter selection (imposes no restriction on any row). */
const EMPTY_GRID_FILTER: GridFilterSelection = {
  months: [],
  teams: [],
  pillars: [],
  kpis: [],
  statuses: [],
  updatedBy: [],
};

/** The full reducer state: base module state + editing state + a save token. */
interface ReducerState {
  // Base state.
  model: DashboardModel | null;
  status: 'idle' | 'parsing' | 'ready' | 'error';
  error: ParseError | null;
  selection: FilterSelection;
  options: FilterOptions;
  filtered: FilteredDataset | null;
  theme: 'light' | 'dark';
  search: string;
  // Editing state.
  auditTrail: AuditTrail;
  versions: Version[];
  currentUser: string | null;
  approvalEnabled: boolean;
  history: EditHistoryState;
  saveError: string | null;
  gridFilter: GridFilterSelection;
  hasUnsavedChanges: boolean;
  /**
   * Monotonic token incremented by every action that should trigger an
   * auto-save. The save effect watches this so persistence stays a side effect
   * outside the (pure) reducer, and `0` means "nothing to persist yet".
   */
  saveRev: number;
}

/** The initial module state before any workbook is uploaded or restored. */
const INITIAL_STATE: ReducerState = {
  model: null,
  status: 'idle',
  error: null,
  selection: emptySelection(),
  options: EMPTY_OPTIONS,
  filtered: null,
  theme: 'light',
  search: '',
  auditTrail: [],
  versions: [],
  currentUser: null,
  approvalEnabled: false,
  history: emptyHistory(),
  saveError: null,
  gridFilter: EMPTY_GRID_FILTER,
  hasUnsavedChanges: false,
  saveRev: 0,
};

/** Default author label when no local identity has been captured yet. */
const DEFAULT_USER = 'Unknown';

/** Internal reducer actions. */
type Action =
  | { type: 'PARSE_START' }
  | { type: 'PARSE_SUCCESS'; model: DashboardModel }
  | { type: 'PARSE_ERROR'; error: ParseError }
  | { type: 'UPDATE_SELECTION'; patch: Partial<FilterSelection> }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'SET_SEARCH'; text: string }
  | { type: 'TOGGLE_THEME' }
  // Editing actions.
  | { type: 'RESTORE'; payload: PersistedState }
  | {
      type: 'COMMIT_EDIT';
      rowId: string;
      field: 'target' | 'actual';
      raw: string;
      comments?: string;
      updatedBy: string;
      timestamp: string;
    }
  | {
      type: 'BULK_EDIT';
      rowIds: string[];
      field: 'target' | 'actual';
      raw: string;
      updatedBy: string;
      timestamp: string;
    }
  | {
      type: 'PASTE_CELLS';
      anchorRowId: string;
      field: 'target' | 'actual';
      matrix: string[][];
      updatedBy: string;
      timestamp: string;
    }
  | { type: 'DELETE_ROWS'; rowIds: string[] }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_CURRENT_USER'; name: string }
  | { type: 'SET_APPROVAL_ENABLED'; enabled: boolean }
  | { type: 'APPROVAL_TRANSITION'; rowId: string; action: ApprovalAction }
  | { type: 'SET_GRID_FILTER'; patch: Partial<GridFilterSelection> }
  | { type: 'CLEAR_GRID_FILTER' }
  | { type: 'IMPORT_SUCCESS'; model: DashboardModel }
  | { type: 'RESTORE_VERSION'; model: DashboardModel }
  | { type: 'SAVE_VERSION'; cycle?: string }
  | { type: 'SET_SAVE_ERROR'; error: string | null };

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

/**
 * Recompute `options`/`filtered` from the APPROVED model so the dashboards
 * reflect approved data (Req 3.1, 3.3, 3.5). When the approval workflow is
 * disabled the approved model equals the working model, so dashboards reflect
 * every saved change (Req 3.4).
 */
function deriveFromApproved(
  model: DashboardModel | null,
  auditTrail: AuditTrail,
  approvalEnabled: boolean,
  selection: FilterSelection
): { options: FilterOptions; filtered: FilteredDataset | null } {
  if (model === null) {
    return { options: EMPTY_OPTIONS, filtered: null };
  }
  const approved = approvalService.approvedModel(model, auditTrail, approvalEnabled);
  return {
    options: deriveOptions(approved),
    filtered: computeFiltered(approved, selection),
  };
}

/** Coerce a validated cell value into the numeric shape the model stores. */
function asModelNumber(value: number | string | null): number | null {
  if (value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Apply a single validated edit to a model, returning a NEW model. */
function applyValidatedEdit(
  model: DashboardModel,
  rowId: string,
  kpi: string,
  field: 'target' | 'actual',
  committedValue: number | string | null
): DashboardModel {
  if (field === 'actual') {
    return gridProjector.applyActual(model, rowId, asModelNumber(committedValue));
  }
  return gridProjector.applyTarget(model, kpi, asModelNumber(committedValue));
}

/** Build a {@link ChangeRecord}, attaching a Draft status when approval is on. */
function buildRecord(
  input: {
    rowId: string;
    field: 'target' | 'actual';
    previousValue: number | string | null;
    newValue: number | string | null;
    updatedBy: string;
    timestamp: string;
    comments?: string;
  },
  approvalEnabled: boolean
): ChangeRecord {
  const record = changeTracker.record(input);
  return approvalEnabled ? { ...record, approvalStatus: 'Draft' } : record;
}

function reducer(state: ReducerState, action: Action): ReducerState {
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
      // Merge the patch into the current selection and recompute against the
      // approved model so dashboards keep reflecting approved data.
      const selection: FilterSelection = { ...state.selection, ...action.patch };
      const { filtered } = deriveFromApproved(
        state.model,
        state.auditTrail,
        state.approvalEnabled,
        selection
      );
      return { ...state, selection, filtered };
    }

    case 'CLEAR_FILTERS': {
      const selection = emptySelection();
      const { filtered } = deriveFromApproved(
        state.model,
        state.auditTrail,
        state.approvalEnabled,
        selection
      );
      return { ...state, selection, filtered };
    }

    case 'SET_SEARCH':
      return { ...state, search: action.text };

    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'light' ? 'dark' : 'light' };

    case 'RESTORE': {
      // Restore a previously saved working set (Req 10.2). Recompute derived
      // state from the approved model. Does NOT bump `saveRev` so restoring
      // never triggers an immediate re-save of just-loaded data.
      const { payload } = action;
      const selection = emptySelection();
      const { options, filtered } = deriveFromApproved(
        payload.model,
        payload.auditTrail,
        payload.approvalEnabled,
        selection
      );
      return {
        ...state,
        model: payload.model,
        status: 'ready',
        error: null,
        selection,
        options,
        filtered,
        auditTrail: payload.auditTrail,
        versions: payload.versions,
        approvalEnabled: payload.approvalEnabled,
        currentUser: payload.currentUser,
        history: emptyHistory(),
      };
    }

    case 'COMMIT_EDIT': {
      if (state.model === null) return state;
      const rows = gridProjector.toRows(state.model);
      const row = rows.find((r) => r.id === action.rowId);
      if (!row) return state;

      const result = validator.validate(action.raw, row.kpiType);
      if (!result.ok) {
        // Invalid input: model unchanged (Req 2.7). No snapshot, no record,
        // no save. Invalid-cell highlighting is handled by the grid view.
        return state;
      }

      const previousValue = action.field === 'actual' ? row.actualValue : row.target;
      const history = pushSnapshot(
        state.history,
        structuredCloneJson(state.model)
      );
      const model = applyValidatedEdit(
        state.model,
        row.id,
        row.kpi,
        action.field,
        result.value
      );
      const record = buildRecord(
        {
          rowId: action.rowId,
          field: action.field,
          previousValue,
          newValue: result.value,
          updatedBy: action.updatedBy,
          timestamp: action.timestamp,
          ...(action.comments !== undefined ? { comments: action.comments } : {}),
        },
        state.approvalEnabled
      );
      const auditTrail = changeTracker.append(state.auditTrail, record);
      const { options, filtered } = deriveFromApproved(
        model,
        auditTrail,
        state.approvalEnabled,
        state.selection
      );
      return {
        ...state,
        model,
        history,
        auditTrail,
        options,
        filtered,
        hasUnsavedChanges: true,
        saveRev: state.saveRev + 1,
      };
    }

    case 'BULK_EDIT': {
      if (state.model === null) return state;
      const rows = gridProjector.toRows(state.model);
      const rowById = new Map(rows.map((r) => [r.id, r]));

      // Single undo snapshot for the whole bulk operation (Req 8.1).
      const history = pushSnapshot(
        state.history,
        structuredCloneJson(state.model)
      );

      let model = state.model;
      let auditTrail = state.auditTrail;
      let changed = false;

      for (const id of action.rowIds) {
        const row = rowById.get(id);
        if (!row) continue;
        const result = validator.validate(action.raw, row.kpiType);
        if (!result.ok) continue; // skip invalid cells, leave them unchanged
        const previousValue = action.field === 'actual' ? row.actualValue : row.target;
        model = applyValidatedEdit(model, row.id, row.kpi, action.field, result.value);
        auditTrail = changeTracker.append(
          auditTrail,
          buildRecord(
            {
              rowId: id,
              field: action.field,
              previousValue,
              newValue: result.value,
              updatedBy: action.updatedBy,
              timestamp: action.timestamp,
            },
            state.approvalEnabled
          )
        );
        changed = true;
      }

      if (!changed) return state; // nothing applied → no snapshot/save churn

      const { options, filtered } = deriveFromApproved(
        model,
        auditTrail,
        state.approvalEnabled,
        state.selection
      );
      return {
        ...state,
        model,
        history,
        auditTrail,
        options,
        filtered,
        hasUnsavedChanges: true,
        saveRev: state.saveRev + 1,
      };
    }

    case 'PASTE_CELLS': {
      if (state.model === null) return state;
      const rows = gridProjector.toRows(state.model);
      // Map onto rows in the current filtered/projected order (Req 8.2).
      const visible = filterRows(rows, state.gridFilter);
      const anchorIndex = visible.findIndex((r) => r.id === action.anchorRowId);
      if (anchorIndex === -1) return state;

      // Flatten the pasted block row-major and align it to consecutive rows
      // from the anchor; invalid cells are left unchanged (Req 8.7).
      const values = action.matrix.flat();

      const history = pushSnapshot(
        state.history,
        structuredCloneJson(state.model)
      );

      let model = state.model;
      let auditTrail = state.auditTrail;
      let changed = false;

      for (let i = 0; i < values.length; i += 1) {
        const row = visible[anchorIndex + i];
        if (!row) break; // ran past the end of the grid
        const result = validator.validate(values[i], row.kpiType);
        if (!result.ok) continue; // preserve invalid target cells
        const previousValue = action.field === 'actual' ? row.actualValue : row.target;
        model = applyValidatedEdit(model, row.id, row.kpi, action.field, result.value);
        auditTrail = changeTracker.append(
          auditTrail,
          buildRecord(
            {
              rowId: row.id,
              field: action.field,
              previousValue,
              newValue: result.value,
              updatedBy: action.updatedBy,
              timestamp: action.timestamp,
            },
            state.approvalEnabled
          )
        );
        changed = true;
      }

      if (!changed) return state;

      const { options, filtered } = deriveFromApproved(
        model,
        auditTrail,
        state.approvalEnabled,
        state.selection
      );
      return {
        ...state,
        model,
        history,
        auditTrail,
        options,
        filtered,
        hasUnsavedChanges: true,
        saveRev: state.saveRev + 1,
      };
    }

    case 'DELETE_ROWS': {
      if (state.model === null || action.rowIds.length === 0) return state;
      const history = pushSnapshot(
        state.history,
        structuredCloneJson(state.model)
      );
      const model = gridProjector.removeRows(state.model, action.rowIds);
      if (model === state.model) return state; // nothing matched
      const { options, filtered } = deriveFromApproved(
        model,
        state.auditTrail,
        state.approvalEnabled,
        state.selection
      );
      return {
        ...state,
        model,
        history,
        options,
        filtered,
        hasUnsavedChanges: true,
        saveRev: state.saveRev + 1,
      };
    }

    case 'UNDO': {
      if (state.model === null) return state;
      const result = historyUndo(state.history, state.model);
      if (result.model === null) return state; // nothing to undo
      const { options, filtered } = deriveFromApproved(
        result.model,
        state.auditTrail,
        state.approvalEnabled,
        state.selection
      );
      return {
        ...state,
        model: result.model,
        history: result.history,
        options,
        filtered,
        hasUnsavedChanges: true,
        saveRev: state.saveRev + 1,
      };
    }

    case 'REDO': {
      if (state.model === null) return state;
      const result = historyRedo(state.history, state.model);
      if (result.model === null) return state; // nothing to redo
      const { options, filtered } = deriveFromApproved(
        result.model,
        state.auditTrail,
        state.approvalEnabled,
        state.selection
      );
      return {
        ...state,
        model: result.model,
        history: result.history,
        options,
        filtered,
        hasUnsavedChanges: true,
        saveRev: state.saveRev + 1,
      };
    }

    case 'SET_CURRENT_USER': {
      // Persist the captured identity so Updated By survives reloads.
      const persist = state.model !== null;
      return {
        ...state,
        currentUser: action.name,
        saveRev: persist ? state.saveRev + 1 : state.saveRev,
      };
    }

    case 'SET_APPROVAL_ENABLED': {
      // Toggling approval changes the approved model, so recompute dashboards
      // and derived options (Req 3.3, 3.4).
      const { options, filtered } = deriveFromApproved(
        state.model,
        state.auditTrail,
        action.enabled,
        state.selection
      );
      return {
        ...state,
        approvalEnabled: action.enabled,
        options,
        filtered,
        saveRev: state.model !== null ? state.saveRev + 1 : state.saveRev,
      };
    }

    case 'APPROVAL_TRANSITION': {
      if (state.model === null) return state;
      // Advance the latest change record for the row and recompute the
      // approved model + filtered dataset (Req 3.3, 6.1–6.6).
      let updated = false;
      const auditTrail = [...state.auditTrail];
      for (let i = auditTrail.length - 1; i >= 0; i -= 1) {
        if (auditTrail[i].rowId === action.rowId) {
          const current = auditTrail[i].approvalStatus ?? 'Draft';
          auditTrail[i] = {
            ...auditTrail[i],
            approvalStatus: approvalService.transition(current, action.action),
          };
          updated = true;
          break;
        }
      }
      if (!updated) return state;
      const { options, filtered } = deriveFromApproved(
        state.model,
        auditTrail,
        state.approvalEnabled,
        state.selection
      );
      return {
        ...state,
        auditTrail,
        options,
        filtered,
        hasUnsavedChanges: true,
        saveRev: state.saveRev + 1,
      };
    }

    case 'SET_GRID_FILTER':
      return {
        ...state,
        gridFilter: { ...state.gridFilter, ...action.patch },
      };

    case 'CLEAR_GRID_FILTER':
      return { ...state, gridFilter: EMPTY_GRID_FILTER };

    case 'IMPORT_SUCCESS': {
      // Replace/merge import already resolved by the caller; adopt the model,
      // recompute derived state, and auto-save (Req 4.1, 4.2).
      const { options, filtered } = deriveFromApproved(
        action.model,
        state.auditTrail,
        state.approvalEnabled,
        state.selection
      );
      return {
        ...state,
        model: action.model,
        status: 'ready',
        error: null,
        options,
        filtered,
        hasUnsavedChanges: true,
        saveRev: state.saveRev + 1,
      };
    }

    case 'RESTORE_VERSION': {
      const { options, filtered } = deriveFromApproved(
        action.model,
        state.auditTrail,
        state.approvalEnabled,
        state.selection
      );
      return {
        ...state,
        model: action.model,
        status: 'ready',
        options,
        filtered,
        hasUnsavedChanges: true,
        saveRev: state.saveRev + 1,
      };
    }

    case 'SAVE_VERSION': {
      // Create a Version checkpoint (snapshot) of the current working set
      // (Req 10.3). No-op when there is no model to snapshot.
      if (state.model === null) return state;
      const persistedState: PersistedState = {
        model: state.model,
        auditTrail: state.auditTrail,
        versions: state.versions,
        approvalEnabled: state.approvalEnabled,
        currentUser: state.currentUser,
      };
      const defaultCycle = new Date()
        .toISOString()
        .slice(0, 16)
        .replace('T', ' ');
      const result = persistenceService.snapshotVersion(
        persistedState,
        action.cycle ?? defaultCycle
      );
      // Bump saveRev so the auto-save effect persists the new versions array,
      // and clear the unsaved-changes flag now that a checkpoint exists.
      return {
        ...state,
        versions: result.versions,
        hasUnsavedChanges: false,
        saveRev: state.saveRev + 1,
      };
    }

    case 'SET_SAVE_ERROR':
      // Recording the save outcome must NOT bump `saveRev` (no save loop).
      return { ...state, saveError: action.error };

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

  // --- Refs mirroring the latest state for the callbacks below -------------
  // Callbacks stay referentially stable (empty deps) while still reading the
  // latest model/user/etc. without re-creating on every state change.
  const modelRef = useRef(state.model);
  const auditTrailRef = useRef(state.auditTrail);
  const versionsRef = useRef(state.versions);
  const approvalEnabledRef = useRef(state.approvalEnabled);
  const currentUserRef = useRef(state.currentUser);
  modelRef.current = state.model;
  auditTrailRef.current = state.auditTrail;
  versionsRef.current = state.versions;
  approvalEnabledRef.current = state.approvalEnabled;
  currentUserRef.current = state.currentUser;

  // --- Base actions --------------------------------------------------------

  const uploadWorkbook = useCallback((buffer: ArrayBuffer) => {
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

  // --- Editing actions -----------------------------------------------------

  const commitEdit = useCallback(
    (
      rowId: string,
      field: 'target' | 'actual',
      raw: string,
      comments?: string
    ) => {
      dispatch({
        type: 'COMMIT_EDIT',
        rowId,
        field,
        raw,
        comments,
        updatedBy: currentUserRef.current ?? DEFAULT_USER,
        timestamp: new Date().toISOString(),
      });
    },
    []
  );

  const bulkEdit = useCallback(
    (rowIds: string[], field: 'target' | 'actual', raw: string) => {
      dispatch({
        type: 'BULK_EDIT',
        rowIds,
        field,
        raw,
        updatedBy: currentUserRef.current ?? DEFAULT_USER,
        timestamp: new Date().toISOString(),
      });
    },
    []
  );

  const pasteCells = useCallback(
    (anchorRowId: string, field: 'target' | 'actual', matrix: string[][]) => {
      dispatch({
        type: 'PASTE_CELLS',
        anchorRowId,
        field,
        matrix,
        updatedBy: currentUserRef.current ?? DEFAULT_USER,
        timestamp: new Date().toISOString(),
      });
    },
    []
  );

  const deleteRows = useCallback((rowIds: string[]) => {
    dispatch({ type: 'DELETE_ROWS', rowIds });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const setCurrentUser = useCallback((name: string) => {
    dispatch({ type: 'SET_CURRENT_USER', name });
  }, []);

  const setApprovalEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_APPROVAL_ENABLED', enabled });
  }, []);

  const submitForApproval = useCallback((rowId: string) => {
    dispatch({ type: 'APPROVAL_TRANSITION', rowId, action: 'submit' });
  }, []);

  const approve = useCallback((rowId: string) => {
    dispatch({ type: 'APPROVAL_TRANSITION', rowId, action: 'approve' });
  }, []);

  const reject = useCallback((rowId: string) => {
    dispatch({ type: 'APPROVAL_TRANSITION', rowId, action: 'reject' });
  }, []);

  const setGridFilter = useCallback((patch: Partial<GridFilterSelection>) => {
    dispatch({ type: 'SET_GRID_FILTER', patch });
  }, []);

  const clearGridFilter = useCallback(() => {
    dispatch({ type: 'CLEAR_GRID_FILTER' });
  }, []);

  const importWorkbook = useCallback((buffer: ArrayBuffer, mode: ImportMode) => {
    const result = importService.importWorkbook(
      modelRef.current,
      buffer,
      mode
    );
    if (result.ok) {
      dispatch({ type: 'IMPORT_SUCCESS', model: result.model });
    } else {
      // Surface the parse error without clobbering the current model (Req 4.8).
      dispatch({ type: 'PARSE_ERROR', error: result.error });
    }
  }, []);

  const restoreVersion = useCallback((versionId: string) => {
    const persisted: PersistedState | null =
      modelRef.current === null
        ? null
        : {
            model: modelRef.current,
            auditTrail: auditTrailRef.current,
            versions: versionsRef.current,
            approvalEnabled: approvalEnabledRef.current,
            currentUser: currentUserRef.current,
          };
    if (persisted === null) return;
    const restored = restoreVersionInState(persisted, versionId);
    dispatch({ type: 'RESTORE_VERSION', model: restored.model });
  }, []);

  const saveVersion = useCallback((cycle?: string) => {
    dispatch({ type: 'SAVE_VERSION', cycle });
  }, []);

  // --- Restore-on-mount ----------------------------------------------------
  // Attempt to load a previously saved working set exactly once. Guarded so a
  // storage failure never throws during mount.
  useEffect(() => {
    let loaded: PersistedState | null = null;
    try {
      loaded = persistenceService.load();
    } catch {
      loaded = null;
    }
    if (loaded) {
      dispatch({ type: 'RESTORE', payload: loaded });
    }
  }, []);

  // --- Auto-save -----------------------------------------------------------
  // Persist the working set whenever an editing action bumps `saveRev`. Runs
  // as an effect (outside the reducer) so persistence remains a side effect.
  useEffect(() => {
    if (state.saveRev === 0 || state.model === null) return;
    const result = persistenceService.save({
      model: state.model,
      auditTrail: state.auditTrail,
      versions: state.versions,
      approvalEnabled: state.approvalEnabled,
      currentUser: state.currentUser,
    });
    dispatch({
      type: 'SET_SAVE_ERROR',
      error: result.ok ? null : result.error,
    });
    // Only re-run when a new persistable revision occurs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.saveRev]);

  const value = useMemo<LeadershipContextValue>(
    () => ({
      model: state.model,
      status: state.status,
      error: state.error,
      selection: state.selection,
      options: state.options,
      filtered: state.filtered,
      theme: state.theme,
      search: state.search,
      auditTrail: state.auditTrail,
      versions: state.versions,
      currentUser: state.currentUser,
      approvalEnabled: state.approvalEnabled,
      history: state.history,
      saveError: state.saveError,
      gridFilter: state.gridFilter,
      hasUnsavedChanges: state.hasUnsavedChanges,
      // Base actions.
      uploadWorkbook,
      updateSelection,
      clearFilters,
      setSearch,
      toggleTheme,
      // Editing actions.
      commitEdit,
      bulkEdit,
      pasteCells,
      deleteRows,
      undo,
      redo,
      setCurrentUser,
      setApprovalEnabled,
      submitForApproval,
      approve,
      reject,
      setGridFilter,
      clearGridFilter,
      importWorkbook,
      restoreVersion,
      saveVersion,
    }),
    [
      state,
      uploadWorkbook,
      updateSelection,
      clearFilters,
      setSearch,
      toggleTheme,
      commitEdit,
      bulkEdit,
      pasteCells,
      deleteRows,
      undo,
      redo,
      setCurrentUser,
      setApprovalEnabled,
      submitForApproval,
      approve,
      reject,
      setGridFilter,
      clearGridFilter,
      importWorkbook,
      restoreVersion,
      saveVersion,
    ]
  );

  // Apply the selected color mode to every view by wrapping the whole subtree
  // in a themed root (Req 13.1, 13.2).
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
