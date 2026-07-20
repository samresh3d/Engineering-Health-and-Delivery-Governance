/**
 * DataGrid — the editable, spreadsheet-like AG-Grid surface for the Leadership
 * Data Management feature.
 *
 * Responsibilities (Requirements 1.2, 1.6, 2.1, 2.2, 2.6, 6.7, 8.1, 8.2, 8.7,
 * 9.1–9.5):
 *  - Projects the current `DashboardModel` into flat `GridRow`s via
 *    {@link gridProjector.toRows} and applies the active grid filter with
 *    {@link filterRows} (Req 1.2).
 *  - Renders the fixed column set — Month, Team, Pillar, KPI, Target, Actual
 *    Value, Source, Last Updated, Updated By — and appends an Approval Status
 *    column ONLY when the approval workflow is enabled (Req 6.7).
 *  - Only Target and Actual Value are editable (Req 2.2). Absent Target/Actual
 *    render as an em dash (Req 1.6).
 *  - On commit, the entered value is validated against the row's `KpiType`
 *    (Req 2.6): invalid entries are highlighted and NOT committed (the prior
 *    value is retained); valid entries call `commitEdit(rowId, field, raw)`.
 *  - Computes per-row `Visual_Indicator`s with {@link indicatorsFor} and maps
 *    them to `ind-*` CSS classes on the row (Req 9.1–9.5).
 *  - Supports multi-row selection and clipboard paste (Req 8.1, 8.2, 8.7).
 *
 * ## Multi-cell selection & clipboard paste (community-edition note)
 * AG-Grid's native range selection and clipboard integration
 * (`enableRangeSelection` / `processDataFromClipboard`) are Enterprise-only
 * features. This component ships on `ag-grid-community`, so it uses a pragmatic
 * fallback:
 *  - Selection uses row selection (`rowSelection="multiple"`) plus normal cell
 *    focus, giving users multi-row selection and a focused editable cell.
 *  - Paste is handled by a React `onPaste` listener on the grid container. It
 *    reads the clipboard text, splits it into a 2D matrix (rows by `\n`, columns
 *    by `\t`), resolves the focused cell as the paste anchor, and calls
 *    `pasteCells(anchorRowId, field, matrix)` where `field` is the focused
 *    editable column ('target' or 'actual'). The provider aligns the matrix from
 *    the anchor downward and rejects invalid entries per cell.
 *  - `Delete`/`Backspace` on selected rows calls `deleteRows(selectedRowIds)`.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  CellClassParams,
  ColDef,
  GridReadyEvent,
  NewValueParams,
  RowClassParams,
  ValueFormatterParams,
} from 'ag-grid-community';
import type { GridApi } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

import { useLeadership } from '../state/useLeadership';
import { gridProjector } from '../services/grid-projector';
import { filterRows } from '../services/grid-filter';
import { indicatorsFor, type IndicatorContext } from '../services/indicator-service';
import { validator } from '../services/validator';
import type { GridRow, KpiType } from '../model/editing-types';
import type { KpiDefinition } from '../model/types';
import { dash } from '../theme';

/** Recent-change window used for the `recently-updated` indicator (24 hours). */
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Map an editable AG-Grid column field to the provider's edit field name. */
const FIELD_BY_COLUMN: Record<string, 'target' | 'actual'> = {
  target: 'target',
  actualValue: 'actual',
};

/** Build the transient key that identifies an invalid Target/Actual cell. */
function invalidKey(rowId: string, field: 'target' | 'actual'): string {
  return `${rowId}\u0001${field}`;
}

/** Format a nullable numeric cell: absent values render as an em dash (Req 1.6). */
function formatNullableNumber(params: ValueFormatterParams<GridRow>): string {
  const value = params.value;
  if (value === null || value === undefined || value === '') {
    return '\u2014';
  }
  return String(value);
}

/** Format a nullable text cell: absent values render as an em dash. */
function formatNullableText(params: ValueFormatterParams<GridRow>): string {
  const value = params.value;
  if (value === null || value === undefined || value === '') {
    return '\u2014';
  }
  return String(value);
}

/** Format an ISO-8601 `lastUpdated` timestamp for display; absent → em dash. */
function formatTimestamp(params: ValueFormatterParams<GridRow>): string {
  const value = params.value;
  if (value === null || value === undefined || value === '') {
    return '\u2014';
  }
  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) {
    return String(value);
  }
  return new Date(parsed).toLocaleString();
}

export interface DataGridProps {
  /** Optional container height; defaults to a comfortable grid height. */
  height?: number | string;
}

/**
 * The editable data-management grid. Reads state and edit actions from the
 * Leadership context and renders the AG-Grid surface described above.
 */
export function DataGrid({ height = 560 }: DataGridProps) {
  const { model, approvalEnabled, gridFilter, commitEdit, pasteCells, deleteRows } =
    useLeadership();

  const gridApiRef = useRef<GridApi<GridRow> | null>(null);

  // Transient set of invalid Target/Actual cell keys. A ref (rather than state)
  // lets `cellClassRules` read the latest value synchronously; a version counter
  // forces AG-Grid to re-evaluate the class rules when the set changes.
  const invalidCellsRef = useRef<Set<string>>(new Set());
  const [, setInvalidVersion] = useState(0);

  // KPI definition lookup by name, used to resolve each row's definition for
  // indicator computation.
  const defByName = useMemo(() => {
    const map = new Map<string, KpiDefinition>();
    if (model) {
      for (const def of model.kpiDefinitions) {
        if (!map.has(def.name)) map.set(def.name, def);
      }
    }
    return map;
  }, [model]);

  // Projected + filtered rows for the grid (Req 1.2).
  const rows = useMemo<GridRow[]>(() => {
    if (!model) return [];
    const projected = gridProjector.toRows(model);
    return filterRows(projected, gridFilter);
  }, [model, gridFilter]);

  // Shared indicator context: per-KPI non-null actual values for outlier
  // detection, the recent-change window, and a reference "now" (Req 9.3, 9.4).
  const indicatorCtx = useMemo<IndicatorContext>(() => {
    const kpiValues = new Map<string, number[]>();
    for (const row of rows) {
      if (row.actualValue !== null && Number.isFinite(row.actualValue)) {
        const list = kpiValues.get(row.kpi);
        if (list) list.push(row.actualValue);
        else kpiValues.set(row.kpi, [row.actualValue]);
      }
    }
    return { recentWindowMs: RECENT_WINDOW_MS, kpiValues, now: Date.now() };
  }, [rows]);

  // Row id → indicator CSS classes, consumed by `getRowClass` (Req 9.1–9.5).
  const indicatorClassByRowId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const def = defByName.get(row.kpi);
      if (!def) continue;
      const indicators = indicatorsFor(row, def, indicatorCtx);
      if (indicators.length > 0) {
        map.set(
          row.id,
          indicators.map((indicator) => `ind-${indicator}`)
        );
      }
    }
    return map;
  }, [rows, defByName, indicatorCtx]);

  const getRowId = useCallback(
    (params: { data: GridRow }) => params.data.id,
    []
  );

  const getRowClass = useCallback(
    (params: RowClassParams<GridRow>) => {
      if (!params.data) return undefined;
      return indicatorClassByRowId.get(params.data.id);
    },
    [indicatorClassByRowId]
  );

  // Class rules shared by the two editable columns. `dg-cell-invalid` reflects
  // an entry rejected by the validator (Req 2.6); `dg-cell-editable` marks the
  // cell as editable so the inline edit affordance is visible (Req 2.1).
  const editableCellClassRules = useMemo(
    () => ({
      'dg-cell-editable': () => true,
      'dg-cell-invalid': (params: CellClassParams<GridRow>) => {
        const data = params.data;
        const field = params.colDef.field
          ? FIELD_BY_COLUMN[params.colDef.field]
          : undefined;
        if (!data || !field) return false;
        return invalidCellsRef.current.has(invalidKey(data.id, field));
      },
    }),
    []
  );

  const columnDefs = useMemo<ColDef<GridRow>[]>(() => {
    const cols: ColDef<GridRow>[] = [
      { field: 'month', headerName: 'Month', minWidth: 110 },
      { field: 'team', headerName: 'Team', minWidth: 140 },
      {
        field: 'pillar',
        headerName: 'Pillar',
        minWidth: 130,
        valueFormatter: formatNullableText,
      },
      { field: 'kpi', headerName: 'KPI', minWidth: 200, flex: 1 },
      {
        field: 'target',
        headerName: 'Target',
        minWidth: 120,
        editable: true,
        valueFormatter: formatNullableNumber,
        cellClassRules: editableCellClassRules,
      },
      {
        field: 'actualValue',
        headerName: 'Actual Value',
        minWidth: 130,
        editable: true,
        valueFormatter: formatNullableNumber,
        cellClassRules: editableCellClassRules,
      },
      {
        field: 'source',
        headerName: 'Source',
        minWidth: 130,
        valueFormatter: formatNullableText,
      },
      {
        field: 'lastUpdated',
        headerName: 'Last Updated',
        minWidth: 170,
        valueFormatter: formatTimestamp,
      },
      {
        field: 'updatedBy',
        headerName: 'Updated By',
        minWidth: 140,
        valueFormatter: formatNullableText,
      },
    ];

    // Approval Status column only when the approval workflow is enabled (Req 6.7).
    if (approvalEnabled) {
      cols.push({
        field: 'approvalStatus',
        headerName: 'Approval Status',
        minWidth: 150,
        valueFormatter: formatNullableText,
      });
    }

    return cols;
  }, [approvalEnabled, editableCellClassRules]);

  const defaultColDef = useMemo<ColDef<GridRow>>(
    () => ({
      sortable: true,
      resizable: true,
      filter: false,
    }),
    []
  );

  const markInvalid = useCallback((rowId: string, field: 'target' | 'actual') => {
    invalidCellsRef.current.add(invalidKey(rowId, field));
    setInvalidVersion((v) => v + 1);
  }, []);

  const clearInvalid = useCallback((rowId: string, field: 'target' | 'actual') => {
    if (invalidCellsRef.current.delete(invalidKey(rowId, field))) {
      setInvalidVersion((v) => v + 1);
    }
  }, []);

  /**
   * Commit handler for the editable Target/Actual cells. Validates the entered
   * value against the row's `KpiType`. Invalid entries are flagged and reverted
   * (the prior value is retained, Req 2.6); valid entries are committed through
   * the provider, which owns validation + audit-trail construction.
   */
  const onCellValueChanged = useCallback(
    (params: NewValueParams<GridRow>) => {
      const field = params.colDef.field
        ? FIELD_BY_COLUMN[params.colDef.field]
        : undefined;
      if (!field || !params.data) return;

      const rowId = params.data.id;
      const kpiType: KpiType = params.data.kpiType;
      const newValue = params.newValue;
      const oldValue = params.oldValue;

      // No-op / revert echo: nothing to do (prevents commit loops on revert).
      if (newValue === oldValue) return;

      const raw = newValue === null || newValue === undefined ? '' : String(newValue);
      const result = validator.validate(raw, kpiType);

      if (!result.ok) {
        // Reject: highlight the cell and restore the prior value (Req 2.6).
        markInvalid(rowId, field);
        params.node?.setDataValue(params.colDef.field as string, oldValue ?? null);
        return;
      }

      // Valid: clear any prior invalid flag and commit through the provider.
      clearInvalid(rowId, field);
      commitEdit(rowId, field, raw);
    },
    [commitEdit, markInvalid, clearInvalid]
  );

  const onGridReady = useCallback((event: GridReadyEvent<GridRow>) => {
    gridApiRef.current = event.api;
  }, []);

  /**
   * Clipboard paste fallback (community edition). Reads the pasted text, builds
   * a `string[][]` matrix, resolves the focused editable cell as the anchor, and
   * calls `pasteCells(anchorRowId, field, matrix)` (Req 8.2, 8.7).
   */
  const onPaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const api = gridApiRef.current;
      if (!api) return;

      const focused = api.getFocusedCell();
      if (!focused) return;

      const field = FIELD_BY_COLUMN[focused.column.getColId()];
      if (!field) return; // paste only targets the editable Target/Actual columns

      const anchorNode = api.getDisplayedRowAtIndex(focused.rowIndex);
      const anchorRowId = anchorNode?.data?.id;
      if (!anchorRowId) return;

      const text = event.clipboardData.getData('text');
      if (text === '') return;

      event.preventDefault();

      // Normalize line endings, drop a single trailing newline, split into a
      // 2D matrix (rows by newline, columns by tab).
      const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
      const matrix = trimmed.split('\n').map((line) => line.split('\t'));

      pasteCells(anchorRowId, field, matrix);
    },
    [pasteCells]
  );

  /**
   * Keyboard handler: `Delete`/`Backspace` removes the currently selected rows
   * (Req 8.x delete). Editing keystrokes are left to AG-Grid.
   */
  const onCellKeyDown = useCallback(
    (event: { event?: Event | null }) => {
      const api = gridApiRef.current;
      if (!api) return;
      const keyboardEvent = event.event as KeyboardEvent | undefined;
      if (!keyboardEvent) return;
      if (keyboardEvent.key !== 'Delete' && keyboardEvent.key !== 'Backspace') return;

      const selected = api.getSelectedRows();
      if (selected.length === 0) return;

      keyboardEvent.preventDefault();
      deleteRows(selected.map((row) => row.id));
    },
    [deleteRows]
  );

  // Dark-theme tokens applied to AG-Grid via its CSS custom properties so the
  // grid matches the dashboard palette without shipping the enterprise dark theme.
  const themeVars = useMemo<React.CSSProperties>(
    () =>
      ({
        width: '100%',
        height,
        '--ag-background-color': dash.panelBg,
        '--ag-foreground-color': dash.text,
        '--ag-header-background-color': dash.panelBgAlt,
        '--ag-header-foreground-color': dash.textMuted,
        '--ag-border-color': dash.border,
        '--ag-row-border-color': dash.borderSoft,
        '--ag-odd-row-background-color': dash.panelBgAlt,
        '--ag-row-hover-color': dash.borderSoft,
        '--ag-selected-row-background-color': dash.borderSoft,
        '--ag-font-size': '13px',
      }) as React.CSSProperties,
    [height]
  );

  return (
    <div
      className="ag-theme-alpine leadership-data-grid"
      style={themeVars}
      onPaste={onPaste}
      data-testid="leadership-data-grid"
    >
      <style>{DATA_GRID_INDICATOR_CSS}</style>
      <AgGridReact<GridRow>
        columnDefs={columnDefs}
        rowData={rows}
        defaultColDef={defaultColDef}
        getRowId={getRowId}
        getRowClass={getRowClass}
        rowSelection="multiple"
        suppressRowClickSelection={false}
        stopEditingWhenCellsLoseFocus
        onGridReady={onGridReady}
        onCellValueChanged={onCellValueChanged}
        onCellKeyDown={onCellKeyDown}
        domLayout="normal"
      />
    </div>
  );
}

/**
 * Indicator + editable-cell styling. Kept inline so the component is
 * self-contained and the indicator classes resolve regardless of global CSS.
 */
const DATA_GRID_INDICATOR_CSS = `
.leadership-data-grid .ag-row.ind-recently-updated {
  box-shadow: inset 3px 0 0 ${dash.primary};
}
.leadership-data-grid .ag-row.ind-below-target {
  background-color: rgba(239, 68, 68, 0.10);
}
.leadership-data-grid .ag-row.ind-missing-data {
  background-color: rgba(148, 163, 184, 0.10);
}
.leadership-data-grid .ag-row.ind-outlier {
  background-color: rgba(245, 158, 11, 0.10);
}
.leadership-data-grid .ag-row.ind-requires-attention {
  border-left: 3px solid ${dash.amber};
}
.leadership-data-grid .dg-cell-editable {
  cursor: cell;
}
.leadership-data-grid .dg-cell-invalid {
  background-color: rgba(239, 68, 68, 0.28) !important;
  outline: 1px solid ${dash.red};
  outline-offset: -1px;
}
`;

export default DataGrid;
