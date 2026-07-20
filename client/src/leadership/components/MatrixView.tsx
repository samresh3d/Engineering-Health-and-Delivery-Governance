/**
 * MatrixView — an Excel-style pivot (cross-tab) rendering of the Leadership
 * KPI data, matching the layout of the source governance workbooks.
 *
 * Layout:
 *  - One row per KPI (in model order), grouped under full-width pillar section
 *    header rows (Delivery → Quality → Sustainability → Cost → Other).
 *  - Descriptor columns on the left: KPI, How to Measure, Target, Source.
 *  - Column GROUPS per Month; each group holds one sub-column per Team.
 *  - Each data cell shows the Actual value for (KPI, Month, Team) and is an
 *    editable input that commits on blur / Enter through `commitEdit`.
 *
 * The model remains the single source of truth: an edit calls `commitEdit`
 * (which rejects invalid values, leaving the model unchanged) and the cell
 * re-reads its displayed value from the (possibly updated) model on re-render.
 */
import {
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { useLeadership } from '../state/useLeadership';
import { dash } from '../theme';
import { rowId } from '../services/grid-projector';
import type { EngineeringPillar, Period } from '../model/types';

/** Fixed pillar display order, with a trailing bucket for null-pillar KPIs. */
const PILLAR_ORDER: (EngineeringPillar | null)[] = [
  'Delivery',
  'Quality',
  'Sustainability',
  'Cost',
  null,
];

/** Friendly section-header labels per pillar. */
const PILLAR_LABEL: Record<string, string> = {
  Delivery: 'Pillar 1: Engineering Health (Delivery Governance)',
  Quality: 'Pillar 2: Engineering Quality',
  Sustainability: 'Sustain',
  Cost: 'COST',
  __null__: 'Other',
};

/** Value-index key separator (NUL cannot occur in a label). */
const SEP = '\u0000';

const EM_DASH = '\u2014';

function pillarKey(pillar: EngineeringPillar | null): string {
  return pillar ?? '__null__';
}

export default function MatrixView() {
  const { model, commitEdit, gridFilter } = useLeadership();

  // Ordered months (ascending by period key) and teams (model order), each
  // optionally restricted by the active grid filter (month/team only).
  const months = useMemo<Period[]>(() => {
    if (model === null) return [];
    const monthFilter = gridFilter?.months ?? [];
    const ordered = [...model.dimensions.periods].sort((a, b) =>
      a.key < b.key ? -1 : a.key > b.key ? 1 : 0
    );
    return monthFilter.length > 0
      ? ordered.filter((p) => monthFilter.includes(p.month))
      : ordered;
  }, [model, gridFilter]);

  const teams = useMemo<string[]>(() => {
    if (model === null) return [];
    const teamFilter = gridFilter?.teams ?? [];
    return teamFilter.length > 0
      ? model.dimensions.teams.filter((t) => teamFilter.includes(t))
      : [...model.dimensions.teams];
  }, [model, gridFilter]);

  // Index: `${team}\u0000${kpi}\u0000${periodKey}` -> value.
  const valueIndex = useMemo(() => {
    const index = new Map<string, number | null>();
    if (model === null) return index;
    for (const metric of model.metrics) {
      index.set(
        `${metric.team}${SEP}${metric.kpi}${SEP}${metric.period.key}`,
        metric.value
      );
    }
    return index;
  }, [model]);

  if (model === null) return null;

  const totalDataCols = months.length * teams.length;

  return (
    <div style={scrollContainerStyle} data-testid="leadership-matrix-view">
      <table style={tableStyle}>
        <thead>
          <tr>
            {DESCRIPTOR_COLUMNS.map((label) => (
              <th key={label} rowSpan={2} style={descriptorHeaderStyle}>
                {label}
              </th>
            ))}
            {months.map((period) => (
              <th
                key={period.key}
                colSpan={teams.length}
                style={monthHeaderStyle}
              >
                {period.month}
              </th>
            ))}
          </tr>
          <tr>
            {months.map((period) =>
              teams.map((team) => (
                <th key={`${period.key}${SEP}${team}`} style={teamHeaderStyle}>
                  {team}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {PILLAR_ORDER.map((pillar) => {
            const defs = model.kpiDefinitions.filter(
              (d) => (d.pillar ?? null) === pillar
            );
            if (defs.length === 0) return null;

            const rows = [
              <tr key={`section-${pillarKey(pillar)}`}>
                <td
                  colSpan={DESCRIPTOR_COLUMNS.length + totalDataCols}
                  style={sectionHeaderStyle}
                >
                  {PILLAR_LABEL[pillarKey(pillar)]}
                </td>
              </tr>,
            ];

            for (const def of defs) {
              const targetDisplay =
                def.targetText ??
                (def.target != null ? String(def.target) : EM_DASH);

              rows.push(
                <tr key={`kpi-${pillarKey(pillar)}-${def.name}`}>
                  <td style={kpiCellStyle}>{def.name}</td>
                  <td style={descriptorCellStyle}>
                    {def.howToMeasure ?? EM_DASH}
                  </td>
                  <td style={descriptorCellStyle}>{targetDisplay}</td>
                  <td style={descriptorCellStyle}>{def.source ?? EM_DASH}</td>
                  {months.map((period) =>
                    teams.map((team) => {
                      const value = valueIndex.get(
                        `${team}${SEP}${def.name}${SEP}${period.key}`
                      );
                      return (
                        <MatrixCell
                          key={`${def.name}${SEP}${period.key}${SEP}${team}`}
                          value={value ?? null}
                          onCommit={(raw) =>
                            commitEdit(
                              rowId(period.month, team, def.pillar ?? null, def.name),
                              'actual',
                              raw
                            )
                          }
                        />
                      );
                    })
                  )}
                </tr>
              );
            }

            return rows;
          })}
        </tbody>
      </table>
    </div>
  );
}

const DESCRIPTOR_COLUMNS = ['KPI', 'How to Measure', 'Target', 'Source'] as const;

/**
 * A single editable data cell. Controlled while focused (so keystrokes show),
 * but the committed/displayed value always re-reads from the model prop, so a
 * rejected edit is reflected by restoring the model value on re-render.
 */
function MatrixCell({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (raw: string) => void;
}) {
  const modelText = value === null ? '' : String(value);
  const [draft, setDraft] = useState<string | null>(null);

  const shown = draft ?? modelText;

  const commit = () => {
    if (draft === null) return;
    if (draft.trim() !== modelText) {
      onCommit(draft.trim());
    }
    setDraft(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      (event.target as HTMLInputElement).blur();
    } else if (event.key === 'Escape') {
      setDraft(null);
      (event.target as HTMLInputElement).blur();
    }
  };

  return (
    <td style={dataCellStyle}>
      <input
        type="text"
        value={shown}
        placeholder={EM_DASH}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        style={cellInputStyle}
        title={shown === '' ? 'No value' : shown}
      />
    </td>
  );
}

// ---------------------------------------------------------------------------
// Styles (dark-theme tokens)
// ---------------------------------------------------------------------------

const scrollContainerStyle: CSSProperties = {
  overflowX: 'auto',
  background: dash.panelBg,
  border: `1px solid ${dash.border}`,
  borderRadius: 10,
};

const tableStyle: CSSProperties = {
  borderCollapse: 'collapse',
  color: dash.text,
  fontSize: 13,
  minWidth: '100%',
};

const baseHeaderStyle: CSSProperties = {
  background: dash.panelBgAlt,
  color: dash.textStrong,
  border: `1px solid ${dash.border}`,
  padding: '6px 10px',
  fontWeight: 600,
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

const descriptorHeaderStyle: CSSProperties = {
  ...baseHeaderStyle,
  textAlign: 'left',
  position: 'sticky',
  left: 0,
  zIndex: 1,
};

const monthHeaderStyle: CSSProperties = {
  ...baseHeaderStyle,
};

const teamHeaderStyle: CSSProperties = {
  ...baseHeaderStyle,
  fontWeight: 500,
  color: dash.textMuted,
  fontSize: 12,
};

const sectionHeaderStyle: CSSProperties = {
  background: dash.borderSoft,
  color: dash.textStrong,
  border: `1px solid ${dash.border}`,
  padding: '6px 10px',
  fontWeight: 700,
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const descriptorCellStyle: CSSProperties = {
  border: `1px solid ${dash.border}`,
  padding: '6px 10px',
  color: dash.textMuted,
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
};

const kpiCellStyle: CSSProperties = {
  ...descriptorCellStyle,
  color: dash.text,
  fontWeight: 600,
  position: 'sticky',
  left: 0,
  background: dash.panelBg,
  zIndex: 1,
};

const dataCellStyle: CSSProperties = {
  border: `1px solid ${dash.border}`,
  padding: 0,
  textAlign: 'center',
};

const cellInputStyle: CSSProperties = {
  width: '100%',
  minWidth: 64,
  boxSizing: 'border-box',
  background: 'transparent',
  border: 'none',
  color: dash.text,
  textAlign: 'center',
  padding: '6px 8px',
  fontSize: 13,
  outline: 'none',
};
