/**
 * AuditTrailPanel — displays the Change_Records for the currently selected
 * Data_Grid row (Req 5.6).
 *
 * Given the id of the selected grid row, the panel pulls that row's records
 * from the module audit trail via {@link changeTracker.forRow}, which returns
 * them in chronological order. Each record is rendered as a row showing:
 * Previous Value → New Value, the field that changed, who made the change
 * (Updated By), the change timestamp (Date & Time), any Comments, and the
 * Approval Status when present.
 *
 * When no row is selected, or the selected row has no recorded changes yet, a
 * friendly empty state is shown instead.
 *
 * Styling uses the shared dark-theme design tokens (`dash`) so the panel stays
 * visually consistent with the rest of the redesigned dashboard.
 */
import { useMemo } from 'react';
import { changeTracker } from '../services/change-tracker';
import { useLeadership } from '../state/useLeadership';
import { dash } from '../theme';
import type { ChangeRecord } from '../model/editing-types';

/** Props for {@link AuditTrailPanel}. */
export interface AuditTrailPanelProps {
  /** Id of the currently selected grid row, or `null` when nothing is selected. */
  selectedRowId: string | null;
}

/** Render a value cell, using an em dash for a missing (null) value. */
function formatValue(value: number | string | null): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return String(value);
}

/** Format an ISO-8601 timestamp for display, falling back to the raw string. */
function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleString();
}

const headerCellStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: 11,
  fontWeight: 600,
  color: dash.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  borderBottom: `1px solid ${dash.border}`,
  whiteSpace: 'nowrap',
};

const bodyCellStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  color: dash.text,
  borderBottom: `1px solid ${dash.borderSoft}`,
  verticalAlign: 'top',
};

/** A single audit-trail record rendered as a table row. */
function AuditRow({ record }: { record: ChangeRecord }) {
  return (
    <tr data-testid="audit-row">
      <td style={bodyCellStyle}>
        <span style={{ textTransform: 'capitalize', color: dash.textMuted }}>
          {record.field}
        </span>
      </td>
      <td style={bodyCellStyle}>
        <span style={{ color: dash.textMuted }}>{formatValue(record.previousValue)}</span>
        <span style={{ color: dash.textFaint, margin: '0 6px' }}>→</span>
        <span style={{ color: dash.textStrong, fontWeight: 600 }}>
          {formatValue(record.newValue)}
        </span>
      </td>
      <td style={bodyCellStyle}>{record.updatedBy}</td>
      <td style={{ ...bodyCellStyle, whiteSpace: 'nowrap' }}>
        {formatTimestamp(record.timestamp)}
      </td>
      <td style={bodyCellStyle}>
        {record.comments ? (
          record.comments
        ) : (
          <span style={{ color: dash.textFaint }}>—</span>
        )}
      </td>
      <td style={bodyCellStyle}>
        {record.approvalStatus ? (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              color: dash.textStrong,
              background: dash.panelBgAlt,
              border: `1px solid ${dash.border}`,
            }}
          >
            {record.approvalStatus}
          </span>
        ) : (
          <span style={{ color: dash.textFaint }}>—</span>
        )}
      </td>
    </tr>
  );
}

/** Shared shell so the empty and populated states look consistent. */
function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Audit trail"
      data-testid="audit-trail-panel"
      style={{
        background: dash.panelBg,
        border: `1px solid ${dash.border}`,
        borderRadius: 10,
        padding: 16,
        color: dash.text,
      }}
    >
      <h3
        style={{
          margin: '0 0 12px',
          fontSize: 13,
          fontWeight: 600,
          color: dash.textStrong,
        }}
      >
        Change History
      </h3>
      {children}
    </section>
  );
}

/** Centered muted empty-state message. */
function EmptyState({ message, testId }: { message: string; testId: string }) {
  return (
    <div
      data-testid={testId}
      style={{
        padding: 24,
        textAlign: 'center',
        color: dash.textMuted,
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
}

/**
 * The Audit Trail panel. Shows the chronological change records for the
 * selected grid row, or a friendly empty state when no row is selected or the
 * row has no recorded changes.
 */
export default function AuditTrailPanel({ selectedRowId }: AuditTrailPanelProps) {
  const { auditTrail } = useLeadership();

  const records = useMemo(
    () => (selectedRowId === null ? [] : changeTracker.forRow(auditTrail, selectedRowId)),
    [auditTrail, selectedRowId],
  );

  if (selectedRowId === null) {
    return (
      <PanelShell>
        <EmptyState
          testId="audit-empty-no-selection"
          message="Select a row to view its change history."
        />
      </PanelShell>
    );
  }

  if (records.length === 0) {
    return (
      <PanelShell>
        <EmptyState
          testId="audit-empty-no-records"
          message="No changes have been recorded for this row yet."
        />
      </PanelShell>
    );
  }

  return (
    <PanelShell>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
          }}
        >
          <thead>
            <tr>
              <th style={headerCellStyle}>Field</th>
              <th style={headerCellStyle}>Previous → New</th>
              <th style={headerCellStyle}>Updated By</th>
              <th style={headerCellStyle}>Date &amp; Time</th>
              <th style={headerCellStyle}>Comments</th>
              <th style={headerCellStyle}>Approval Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <AuditRow key={record.id} record={record} />
            ))}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}
