/**
 * GridFilterBar — a polished, categorized multi-dimension filter panel for the
 * Leadership Data Grid.
 *
 * Layout (top → bottom):
 *  1. HEADER (always visible): a filter icon, a bold "Filters" title and a muted
 *     subtitle, plus a "Clear all" button, an emphasized "Apply filters" button,
 *     and an expand/collapse chevron (data-testid="grid-filter-toggle").
 *  2. ACTIVE-FILTER CHIP ROW (visible only when the DRAFT has selections): one
 *     chip per active dimension with a ✕ that clears that whole dimension, plus a
 *     right-aligned "View active (N)" pill that opens the body.
 *  3. CATEGORIZED BODY (collapsed by default): the six grid dimensions grouped
 *     into Time / Scope / Metric / Status & People categories, each with a left
 *     descriptor column and compact, dense controls.
 *
 * Staged editing: every control mutates a LOCAL `draft` selection — nothing
 * filters live. "Apply filters" commits the draft via `setGridFilter(draft)`;
 * "Clear all" resets the draft and calls `clearGridFilter()`. The draft re-syncs
 * whenever the applied `gridFilter` changes (e.g. an external clear).
 *
 * Option counts (the small number badges) are derived from the projected grid
 * rows: team counts are rows-per-team, pillar counts are rows-per-pillar, and
 * health-status counts are rows classified to each status. Approval-status
 * options show no count (the projection carries no per-row approval metadata).
 *
 * Styling follows the dark, executive theme tokens from {@link dash}.
 */
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useLeadership } from '../state/useLeadership';
import {
  buildFilterOptions,
  type GridFilterOptions,
} from '../services/grid-filter';
import type { GridFilterSelection } from '../model/editing-types';
import type { EngineeringPillar, HealthStatus, KpiDefinition } from '../model/types';
import { toRows } from '../services/grid-projector';
import { classify } from '../services/health-classifier';
import { dash } from '../theme';

/** Empty option set used before a model is loaded. */
const EMPTY_OPTIONS: GridFilterOptions = {
  months: [],
  teams: [],
  pillars: [],
  kpis: [],
  statuses: [],
  updatedBy: [],
};

/** A fully-cleared draft selection. */
const EMPTY_SELECTION: GridFilterSelection = {
  months: [],
  teams: [],
  pillars: [],
  kpis: [],
  statuses: [],
  updatedBy: [],
};

/** The four approval-workflow labels; used to distinguish them from health statuses. */
const APPROVAL_STATUSES = new Set<string>([
  'Draft',
  'Pending Approval',
  'Approved',
  'Rejected',
]);

type StatusOption = HealthStatus | 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected';

/** Toggle a value in/out of an array immutably. */
function toggleArr<T extends string>(arr: readonly T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

/** Two selections are equal when every dimension holds the same set of values. */
function sameSelection(a: GridFilterSelection, b: GridFilterSelection): boolean {
  const keys: (keyof GridFilterSelection)[] = [
    'months',
    'teams',
    'pillars',
    'kpis',
    'statuses',
    'updatedBy',
  ];
  return keys.every((key) => {
    const av = a[key] as readonly string[];
    const bv = b[key] as readonly string[];
    if (av.length !== bv.length) return false;
    const set = new Set(av);
    return bv.every((v) => set.has(v));
  });
}

/** Format a chip's value list: comma-joined for ≤2, otherwise "N selected". */
function summarize(values: readonly string[]): string {
  return values.length > 2 ? `${values.length} selected` : values.join(', ');
}

/** Colored dot for a status option. */
function statusColor(status: string): string {
  switch (status) {
    case 'Green':
      return dash.green;
    case 'Amber':
      return dash.amber;
    case 'Red':
      return dash.red;
    case 'Unknown':
      return dash.unknown;
    default:
      return dash.primary; // approval statuses
  }
}

export default function GridFilterBar() {
  const {
    model,
    auditTrail,
    approvalEnabled,
    gridFilter,
    setGridFilter,
    clearGridFilter,
  } = useLeadership();

  const [expanded, setExpanded] = useState<boolean>(false);
  const [teamQuery, setTeamQuery] = useState<string>('');

  // Staged draft selection — every control mutates this, not the applied filter.
  const [draft, setDraft] = useState<GridFilterSelection>(gridFilter);
  // Re-sync when the applied filter changes externally (e.g. an outside clear).
  useEffect(() => {
    setDraft(gridFilter);
  }, [gridFilter]);

  const options: GridFilterOptions =
    model === null ? EMPTY_OPTIONS : buildFilterOptions(model, auditTrail, approvalEnabled);

  // --- Derived option counts (display-only) --------------------------------
  const rows = useMemo(() => (model ? toRows(model) : []), [model]);

  const defByKpi = useMemo(() => {
    const map = new Map<string, KpiDefinition>();
    if (model) {
      for (const def of model.kpiDefinitions) {
        if (!map.has(def.name)) map.set(def.name, def);
      }
    }
    return map;
  }, [model]);

  const teamCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.team, (map.get(row.team) ?? 0) + 1);
    return map;
  }, [rows]);

  const pillarCounts = useMemo(() => {
    const map = new Map<EngineeringPillar, number>();
    for (const row of rows) {
      if (row.pillar !== null) map.set(row.pillar, (map.get(row.pillar) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const def = defByKpi.get(row.kpi);
      const status = classify({
        value: row.actualValue,
        target: row.target,
        direction: def?.direction ?? 'HigherIsBetter',
        amberBand: def?.amberBand ?? null,
      });
      map.set(status, (map.get(status) ?? 0) + 1);
    }
    return map;
  }, [rows, defByKpi]);

  const yearByMonth = useMemo(() => {
    const map = new Map<string, number>();
    if (model) {
      for (const period of model.dimensions.periods) {
        if (!map.has(period.month)) map.set(period.month, period.year);
      }
    }
    return map;
  }, [model]);

  // --- Draft mutation helpers ----------------------------------------------
  const toggleMonth = (m: string) =>
    setDraft((d) => ({ ...d, months: toggleArr(d.months, m) }));
  const toggleTeam = (t: string) =>
    setDraft((d) => ({ ...d, teams: toggleArr(d.teams, t) }));
  const togglePillar = (p: EngineeringPillar) =>
    setDraft((d) => ({ ...d, pillars: toggleArr(d.pillars, p) }));
  const toggleKpi = (k: string) =>
    setDraft((d) => ({ ...d, kpis: toggleArr(d.kpis, k) }));
  const toggleStatus = (s: StatusOption) =>
    setDraft((d) => ({
      ...d,
      statuses: toggleArr(d.statuses as StatusOption[], s),
    }));
  const toggleUpdatedBy = (u: string) =>
    setDraft((d) => ({ ...d, updatedBy: toggleArr(d.updatedBy, u) }));

  const clearDimension = (key: keyof GridFilterSelection) =>
    setDraft((d) => ({ ...d, [key]: [] }));

  const activeCount =
    draft.months.length +
    draft.teams.length +
    draft.pillars.length +
    draft.kpis.length +
    draft.statuses.length +
    draft.updatedBy.length;

  const hasPendingChanges = !sameSelection(draft, gridFilter);

  const applyFilters = () => setGridFilter(draft);
  const clearAll = () => {
    setDraft(EMPTY_SELECTION);
    clearGridFilter();
  };

  const filteredTeams = options.teams.filter((team) =>
    team.toLowerCase().includes(teamQuery.trim().toLowerCase())
  );

  return (
    <section
      aria-label="Grid filters"
      className="leadership-grid-filter-bar"
      style={{ background: dash.panelBg, borderBottom: `1px solid ${dash.border}` }}
    >
      {/* --- HEADER (always visible) ---------------------------------------- */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span aria-hidden="true" style={iconSquareStyle}>
            ⛃
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: dash.textStrong }}>
              Filters
            </span>
            <span style={{ fontSize: 11.5, color: dash.textMuted }}>
              Refine the data to view relevant insights
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <button
            type="button"
            data-testid="clear-filters"
            aria-label="Clear all"
            onClick={clearAll}
            disabled={activeCount === 0 && !hasPendingChanges}
            style={secondaryButtonStyle(activeCount === 0 && !hasPendingChanges)}
          >
            Clear all
          </button>
          <button
            type="button"
            data-testid="apply-filters"
            onClick={applyFilters}
            disabled={!hasPendingChanges}
            style={primaryButtonStyle(hasPendingChanges)}
          >
            {hasPendingChanges && <span aria-hidden="true" style={pendingDotStyle} />}
            Apply filters
          </button>
          <button
            type="button"
            data-testid="grid-filter-toggle"
            aria-label="Toggle filters"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            style={chevronButtonStyle}
          >
            {expanded ? '▴' : '▾'}
          </button>
        </div>
      </div>

      {/* --- ACTIVE-FILTER CHIP ROW (only when the draft has selections) ---- */}
      {activeCount > 0 && (
        <div style={chipRowStyle}>
          {draft.months.length > 0 && (
            <Chip label="Month" value={summarize(draft.months)} onRemove={() => clearDimension('months')} />
          )}
          {draft.teams.length > 0 && (
            <Chip label="Team" value={summarize(draft.teams)} onRemove={() => clearDimension('teams')} />
          )}
          {draft.pillars.length > 0 && (
            <Chip label="Pillar" value={summarize(draft.pillars)} onRemove={() => clearDimension('pillars')} />
          )}
          {draft.kpis.length > 0 && (
            <Chip label="KPI" value={summarize(draft.kpis)} onRemove={() => clearDimension('kpis')} />
          )}
          {draft.statuses.length > 0 && (
            <Chip label="Status" value={summarize(draft.statuses)} onRemove={() => clearDimension('statuses')} />
          )}
          {draft.updatedBy.length > 0 && (
            <Chip
              label="Updated By"
              value={summarize(draft.updatedBy)}
              onRemove={() => clearDimension('updatedBy')}
            />
          )}
          <button
            type="button"
            data-testid="view-active"
            onClick={() => setExpanded((v) => !v)}
            style={viewActivePillStyle}
          >
            View active ({activeCount}) {expanded ? '▴' : '▾'}
          </button>
        </div>
      )}

      {/* --- CATEGORIZED BODY (collapsed by default) ------------------------ */}
      {expanded && (
        <div style={bodyStyle}>
          {/* TIME -------------------------------------------------------- */}
          <Category name="Time" icon="◷" description="Select time period">
            <SubLabel>Month</SubLabel>
            {options.months.length === 0 ? (
              <EmptyHint />
            ) : (
              <div style={tileWrapStyle}>
                {options.months.map((month) => {
                  const selected = draft.months.includes(month);
                  const year = yearByMonth.get(month);
                  return (
                    <label key={month} style={monthTileStyle(selected)}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleMonth(month)}
                        style={cornerCheckboxStyle}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600, color: dash.textStrong }}>
                        {month}
                      </span>
                      {year !== undefined && (
                        <span style={{ fontSize: 11, color: dash.textMuted }}>{year}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </Category>

          {/* SCOPE ------------------------------------------------------- */}
          <Category name="Scope" icon="◈" description="Choose scope of data">
            <div style={twoColStyle}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <SubLabel>Team</SubLabel>
                <div style={searchWrapStyle}>
                  <span aria-hidden="true" style={{ color: dash.textFaint, fontSize: 12 }}>
                    ⌕
                  </span>
                  <input
                    type="text"
                    value={teamQuery}
                    onChange={(e) => setTeamQuery(e.target.value)}
                    placeholder="Search teams"
                    aria-label="Search teams"
                    style={searchInputStyle}
                  />
                </div>
                <div style={scrollListStyle(180)}>
                  {filteredTeams.length === 0 ? (
                    <EmptyHint />
                  ) : (
                    filteredTeams.map((team) => (
                      <CheckRow
                        key={team}
                        label={team}
                        checked={draft.teams.includes(team)}
                        onToggle={() => toggleTeam(team)}
                        count={teamCounts.get(team)}
                      />
                    ))
                  )}
                </div>
              </div>

              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <SubLabel>Engineering Pillar</SubLabel>
                <div style={scrollListStyle(180)}>
                  {options.pillars.length === 0 ? (
                    <EmptyHint />
                  ) : (
                    options.pillars.map((pillar) => (
                      <CheckRow
                        key={pillar}
                        label={pillar}
                        checked={draft.pillars.includes(pillar)}
                        onToggle={() => togglePillar(pillar)}
                        count={pillarCounts.get(pillar)}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </Category>

          {/* METRIC ------------------------------------------------------ */}
          <Category name="Metric" icon="◎" description="Select KPIs to analyze">
            <SubLabel>KPI</SubLabel>
            {options.kpis.length === 0 ? (
              <EmptyHint />
            ) : (
              <div style={{ ...kpiGridStyle, maxHeight: 200, overflowY: 'auto' }}>
                {options.kpis.map((kpi) => {
                  const selected = draft.kpis.includes(kpi);
                  return (
                    <label key={kpi} style={kpiCardStyle(selected)}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleKpi(kpi)}
                      />
                      <span aria-hidden="true" style={{ fontSize: 13 }}>
                        📊
                      </span>
                      <span
                        style={{
                          fontSize: 12.5,
                          color: dash.text,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {kpi}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </Category>

          {/* STATUS & PEOPLE --------------------------------------------- */}
          <Category name="Status & People" icon="◉" description="Filter by status or owner" divider={false}>
            <div style={twoColStyle}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <SubLabel>Status</SubLabel>
                {options.statuses.length === 0 ? (
                  <EmptyHint />
                ) : (
                  <div style={tileWrapStyle}>
                    {options.statuses.map((status) => {
                      const selected = (draft.statuses as string[]).includes(status);
                      const isApproval = APPROVAL_STATUSES.has(status);
                      const count = isApproval ? undefined : statusCounts.get(status);
                      return (
                        <label key={status} style={statusTileStyle(selected)}>
                          <span
                            aria-hidden="true"
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: statusColor(status),
                              flex: '0 0 auto',
                            }}
                          />
                          <span style={{ fontSize: 12.5, color: dash.text }}>{status}</span>
                          {count !== undefined && <span style={countBadgeStyle}>{count}</span>}
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleStatus(status as StatusOption)}
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <SubLabel>Updated By</SubLabel>
                <div style={scrollListStyle(160)}>
                  {options.updatedBy.length === 0 ? (
                    <EmptyHint />
                  ) : (
                    options.updatedBy.map((person) => (
                      <CheckRow
                        key={person}
                        label={person}
                        checked={draft.updatedBy.includes(person)}
                        onToggle={() => toggleUpdatedBy(person)}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </Category>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Small presentational sub-components
// ---------------------------------------------------------------------------

function Chip({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <span style={chipStyle}>
      <span style={{ color: dash.textMuted }}>{label}:</span>
      <span style={{ color: dash.textStrong, fontWeight: 600 }}>{value}</span>
      <button
        type="button"
        aria-label={`Remove ${label} filter`}
        onClick={onRemove}
        style={chipRemoveStyle}
      >
        ✕
      </button>
    </span>
  );
}

function Category({
  name,
  icon,
  description,
  children,
  divider = true,
}: {
  name: string;
  icon: string;
  description: string;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <div style={{ ...categoryStyle, borderBottom: divider ? `1px solid ${dash.borderSoft}` : 'none' }}>
      <div style={categoryLeftStyle}>
        <span aria-hidden="true" style={iconSquareStyle}>
          {icon}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={categoryNameStyle}>{name.toUpperCase()}</span>
          <span style={{ fontSize: 11, color: dash.textFaint }}>{description}</span>
        </div>
      </div>
      <div style={categoryContentStyle}>{children}</div>
    </div>
  );
}

function SubLabel({ children }: { children: ReactNode }) {
  return <div style={subLabelStyle}>{children}</div>;
}

function EmptyHint() {
  return <p style={{ margin: 0, fontSize: 12, color: dash.textFaint }}>No options</p>;
}

function CheckRow({
  label,
  checked,
  onToggle,
  count,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  count?: number;
}) {
  return (
    <label style={checkRowStyle(checked)}>
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span
        style={{
          flex: 1,
          fontSize: 12.5,
          color: dash.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      {count !== undefined && <span style={countBadgeStyle}>{count}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Styles (dense / compact)
// ---------------------------------------------------------------------------

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 14px',
};

const iconSquareStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  borderRadius: 8,
  border: `1px solid ${dash.border}`,
  background: dash.panelBgAlt,
  color: dash.textMuted,
  fontSize: 15,
  flex: '0 0 auto',
};

function secondaryButtonStyle(disabled: boolean): CSSProperties {
  return {
    appearance: 'none',
    padding: '6px 12px',
    borderRadius: 8,
    border: `1px solid ${dash.border}`,
    background: 'transparent',
    color: disabled ? dash.textFaint : dash.text,
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 12.5,
    fontWeight: 600,
    opacity: disabled ? 0.6 : 1,
  };
}

function primaryButtonStyle(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    appearance: 'none',
    padding: '6px 14px',
    borderRadius: 8,
    border: `1px solid ${active ? dash.primary : dash.border}`,
    background: active ? dash.primary : 'transparent',
    color: active ? dash.textStrong : dash.textMuted,
    cursor: active ? 'pointer' : 'default',
    fontSize: 12.5,
    fontWeight: 700,
    opacity: active ? 1 : 0.7,
  };
}

const pendingDotStyle: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: dash.textStrong,
  flex: '0 0 auto',
};

const chevronButtonStyle: CSSProperties = {
  appearance: 'none',
  width: 30,
  height: 30,
  borderRadius: 8,
  border: `1px solid ${dash.border}`,
  background: dash.panelBgAlt,
  color: dash.textMuted,
  cursor: 'pointer',
  fontSize: 13,
  lineHeight: 1,
};

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  padding: '0 14px 10px',
};

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  borderRadius: 999,
  border: `1px solid ${dash.border}`,
  background: dash.panelBgAlt,
  fontSize: 12,
};

const chipRemoveStyle: CSSProperties = {
  appearance: 'none',
  border: 'none',
  background: 'transparent',
  color: dash.textMuted,
  cursor: 'pointer',
  fontSize: 11,
  lineHeight: 1,
  padding: 0,
};

const viewActivePillStyle: CSSProperties = {
  marginLeft: 'auto',
  appearance: 'none',
  padding: '4px 10px',
  borderRadius: 999,
  border: `1px solid ${dash.border}`,
  background: 'transparent',
  color: dash.textMuted,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
};

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '0 14px 6px',
};

const categoryStyle: CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'flex-start',
  padding: '12px 0',
};

const categoryLeftStyle: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  flex: '0 0 168px',
  minWidth: 0,
};

const categoryNameStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.6,
  color: dash.textMuted,
};

const categoryContentStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const subLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: dash.textStrong,
  marginBottom: 2,
};

const twoColStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 16,
};

const tileWrapStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

function monthTileStyle(selected: boolean): CSSProperties {
  return {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 64,
    padding: '8px 10px 8px 24px',
    borderRadius: 8,
    border: `1px solid ${selected ? dash.primary : dash.border}`,
    background: selected ? 'rgba(99,102,241,0.14)' : dash.panelBgAlt,
    cursor: 'pointer',
  };
}

const cornerCheckboxStyle: CSSProperties = {
  position: 'absolute',
  top: 7,
  left: 6,
  margin: 0,
};

function statusTileStyle(selected: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 9px',
    borderRadius: 8,
    border: `1px solid ${selected ? dash.primary : dash.border}`,
    background: selected ? 'rgba(99,102,241,0.14)' : dash.panelBgAlt,
    cursor: 'pointer',
  };
}

const searchWrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 9px',
  borderRadius: 8,
  border: `1px solid ${dash.border}`,
  background: dash.panelBgAlt,
  marginBottom: 6,
};

const searchInputStyle: CSSProperties = {
  flex: 1,
  appearance: 'none',
  border: 'none',
  background: 'transparent',
  color: dash.text,
  fontSize: 12.5,
  outline: 'none',
};

function scrollListStyle(maxHeight: number): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    maxHeight,
    overflowY: 'auto',
    border: `1px solid ${dash.border}`,
    borderRadius: 8,
    background: dash.panelBgAlt,
    padding: 6,
  };
}

function checkRowStyle(checked: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 6px',
    borderRadius: 6,
    fontSize: 12.5,
    color: dash.text,
    background: checked ? 'rgba(99,102,241,0.12)' : 'transparent',
    cursor: 'pointer',
  };
}

const kpiGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: 8,
};

function kpiCardStyle(selected: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 9px',
    borderRadius: 8,
    border: `1px solid ${selected ? dash.primary : dash.border}`,
    background: selected ? 'rgba(99,102,241,0.14)' : dash.panelBgAlt,
    cursor: 'pointer',
    minWidth: 0,
  };
}

const countBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 20,
  height: 18,
  padding: '0 6px',
  borderRadius: 9,
  background: dash.panelBg,
  border: `1px solid ${dash.border}`,
  color: dash.textMuted,
  fontSize: 11,
  fontWeight: 600,
  flex: '0 0 auto',
};
