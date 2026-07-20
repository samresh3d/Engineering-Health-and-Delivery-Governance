/**
 * DataManagementView — the page shell for the Leadership Data Management
 * feature (Requirements 1.1, 1.7).
 *
 * This component hosts the editable data-management surface: the identity
 * prompt, import/export controls, the grid filter bar, the {@link DataGrid},
 * and the side panels ({@link AuditTrailPanel} and {@link VersionPanel}).
 *
 * Behaviour:
 *  - **Empty state (Req 1.7):** when no `DashboardModel` is available
 *    (`model === null`), the page renders a friendly empty-state panel that
 *    directs the user to import data, and embeds {@link ImportExportControls}
 *    so a workbook can be imported right there without leaving the page.
 *  - **Populated state (Req 1.1):** when a model is present, the page lays out
 *    the identity prompt and import/export controls at the top, the grid filter
 *    bar and editable grid in the main column, and the audit-trail + version
 *    panels alongside as side panels.
 *
 * Row selection: `selectedRowId` is managed here and passed to
 * {@link AuditTrailPanel} so the panel can show the change history for the
 * selected row. `DataGrid` does not currently expose a row-selection callback,
 * so the selection starts as `null` (the panel shows its empty state) and the
 * wiring is kept minimal and forward-compatible.
 *
 * Styling uses the shared dark-theme design tokens (`dash`).
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { useLeadership } from '../state/useLeadership';
import { dash } from '../theme';
import DataGrid from './DataGrid';
import MatrixView from './MatrixView';
import GridFilterBar from './GridFilterBar';
import AuditTrailPanel from './AuditTrailPanel';
import VersionPanel from './VersionPanel';
import ImportExportControls from './ImportExportControls';
import IdentityPrompt from './IdentityPrompt';

export default function DataManagementView() {
  const { model, hasUnsavedChanges, saveVersion } = useLeadership();

  // Selected grid row id, passed to the AuditTrailPanel. Starts null so the
  // panel shows its "select a row" empty state until a selection is wired.
  const [selectedRowId] = useState<string | null>(null);

  // View mode: the Excel-style matrix (pivot) is shown first so the layout
  // mirrors the user's source workbook; the flat grid remains available.
  const [viewMode, setViewMode] = useState<'grid' | 'matrix'>('matrix');

  // Full-screen: renders the data surface inside a fixed overlay covering the
  // viewport. Implemented as a CSS overlay (not the browser Fullscreen API) so
  // it works reliably in jsdom/tests and across browsers.
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Close full-screen on Escape while it is active.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  // Empty state (Req 1.7): no model yet — direct the user to import data and
  // give them the controls to do so on the spot.
  if (model === null) {
    return (
      <section
        aria-label="Data management"
        data-testid="data-management-view"
        style={pageStyle}
      >
        <div data-testid="data-management-empty" style={emptyStateStyle}>
          <h2 style={emptyTitleStyle}>No data yet</h2>
          <p style={emptyMessageStyle}>
            Import a workbook to begin managing your KPI data.
          </p>
          <div style={{ marginTop: 4 }}>
            <ImportExportControls />
          </div>
        </div>
      </section>
    );
  }

  // Populated state (Req 1.1): full data-management layout.
  return (
    <section
      aria-label="Data management"
      data-testid="data-management-view"
      style={pageStyle}
    >
      <header style={headerStyle}>
        <IdentityPrompt />
        <ImportExportControls />

        <button
          type="button"
          data-testid="save-changes"
          onClick={() => saveVersion()}
          disabled={!hasUnsavedChanges}
          title="Save a version checkpoint you can compare or restore"
          style={saveButtonStyle(hasUnsavedChanges)}
        >
          {hasUnsavedChanges ? '● Save changes' : 'Saved'}
        </button>

        <div
          role="group"
          aria-label="View mode"
          data-testid="view-mode-toggle"
          style={toggleGroupStyle}
        >
          <button
            type="button"
            data-testid="view-mode-matrix"
            aria-pressed={viewMode === 'matrix'}
            onClick={() => setViewMode('matrix')}
            style={toggleButtonStyle(viewMode === 'matrix')}
          >
            Matrix
          </button>
          <button
            type="button"
            data-testid="view-mode-grid"
            aria-pressed={viewMode === 'grid'}
            onClick={() => setViewMode('grid')}
            style={toggleButtonStyle(viewMode === 'grid')}
          >
            Grid
          </button>
        </div>

        <button
          type="button"
          data-testid="fullscreen-toggle"
          onClick={() => setIsFullscreen(true)}
          style={fullscreenButtonStyle}
        >
          ⛶ Full screen
        </button>
      </header>

      {isFullscreen ? (
        <div data-testid="fullscreen-overlay" style={overlayStyle}>
          <button
            type="button"
            data-testid="fullscreen-exit"
            onClick={() => setIsFullscreen(false)}
            style={exitFullscreenButtonStyle}
          >
            ✕ Exit full screen
          </button>
          <div style={overlayContentStyle}>{renderDataSurface()}</div>
        </div>
      ) : (
        renderDataSurface()
      )}
    </section>
  );

  /**
   * The data surface: the grid filter bar plus the active view panel. In matrix
   * mode the panel spans the full width and the side column is hidden; in grid
   * mode the audit-trail + version panels render alongside.
   */
  function renderDataSurface() {
    const isMatrix = viewMode === 'matrix';
    return (
      <div style={layoutStyle}>
        <div style={isMatrix ? matrixMainColumnStyle : mainColumnStyle}>
          <div style={gridPanelStyle}>
            <GridFilterBar />
            {isMatrix ? <MatrixView /> : <DataGrid />}
          </div>
        </div>

        {!isMatrix && (
          <aside style={sideColumnStyle}>
            <AuditTrailPanel selectedRowId={selectedRowId} />
            <VersionPanel />
          </aside>
        )}
      </div>
    );
  }
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 16,
  background: dash.appBg,
  color: dash.text,
  minHeight: '100%',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 16,
};

const toggleGroupStyle: CSSProperties = {
  display: 'inline-flex',
  marginLeft: 'auto',
  border: `1px solid ${dash.border}`,
  borderRadius: 8,
  overflow: 'hidden',
};

function toggleButtonStyle(active: boolean): CSSProperties {
  return {
    appearance: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 600,
    background: active ? dash.primary : 'transparent',
    color: active ? dash.textStrong : dash.textMuted,
  };
}

const layoutStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 16,
  alignItems: 'flex-start',
};

const mainColumnStyle: CSSProperties = {
  flex: '1 1 640px',
  minWidth: 0,
};

// Matrix mode: the main column takes the full available width and no side
// column is rendered beside it.
const matrixMainColumnStyle: CSSProperties = {
  flex: '1 1 100%',
  minWidth: 0,
};

function saveButtonStyle(unsaved: boolean): CSSProperties {
  return {
    appearance: 'none',
    cursor: unsaved ? 'pointer' : 'default',
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    border: `1px solid ${unsaved ? dash.primary : dash.border}`,
    background: unsaved ? dash.primary : 'transparent',
    color: unsaved ? dash.textStrong : dash.textMuted,
    opacity: unsaved ? 1 : 0.7,
  };
}

const fullscreenButtonStyle: CSSProperties = {
  appearance: 'none',
  cursor: 'pointer',
  padding: '6px 14px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  border: `1px solid ${dash.border}`,
  background: 'transparent',
  color: dash.text,
};

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: dash.appBg,
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const overlayContentStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
};

const exitFullscreenButtonStyle: CSSProperties = {
  alignSelf: 'flex-end',
  appearance: 'none',
  cursor: 'pointer',
  padding: '6px 14px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  border: `1px solid ${dash.border}`,
  background: dash.panelBg,
  color: dash.text,
};

const gridPanelStyle: CSSProperties = {
  border: `1px solid ${dash.border}`,
  borderRadius: 10,
  overflow: 'hidden',
  background: dash.panelBg,
};

const sideColumnStyle: CSSProperties = {
  flex: '1 1 320px',
  minWidth: 300,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const emptyStateStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  textAlign: 'center',
  padding: 48,
  border: `1px dashed ${dash.border}`,
  borderRadius: 12,
  background: dash.panelBg,
};

const emptyTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 700,
  color: dash.textStrong,
};

const emptyMessageStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: dash.textMuted,
};
