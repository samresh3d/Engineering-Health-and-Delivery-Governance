/**
 * GridFilterBar — collapsible, categorized multi-dimension filter bar for the
 * Leadership Data Grid.
 *
 * The bar is COLLAPSED BY DEFAULT and shows a compact header (a "Filters"
 * label, a badge with the total number of active selections, a "Clear filters"
 * button, and an expand/collapse chevron). Expanding it reveals the six grid
 * dimensions grouped into labeled categories (Time, Scope, Metric,
 * Status & People).
 *
 * Renders one multi-select control per grid dimension (Month, Team, Engineering
 * Pillar, KPI, Status, Updated By). Options are derived from the loaded model
 * and audit trail via {@link buildFilterOptions} (Req 7.3), so the controls
 * always reflect the data actually present. When the approval workflow is
 * disabled, `buildFilterOptions` already omits the four `Approval_Status`
 * values from the Status options, so this component simply renders whatever it
 * returns (Req 7.5).
 *
 * Toggling any option calls `setGridFilter` with a patch for the affected
 * dimension (Req 7.1, 7.4); the "Clear filters" control calls `clearGridFilter`
 * to restore the full grid (Req 7.4). The current selection is read from
 * `gridFilter` in context so the controls stay in sync with applied filters.
 *
 * Styling follows the dark, executive theme tokens from {@link dash}.
 */
import { useState, type CSSProperties } from 'react';
import { useLeadership } from '../state/useLeadership';
import {
  buildFilterOptions,
  type GridFilterOptions,
} from '../services/grid-filter';
import type { GridFilterSelection } from '../model/editing-types';
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

/** A single multi-select checkbox group over values of type `T`. */
interface FilterGroupProps<T extends string> {
  label: string;
  options: readonly T[];
  selected: readonly T[];
  onToggle: (next: T[]) => void;
}

function FilterGroup<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: FilterGroupProps<T>) {
  const selectedSet = new Set<T>(selected);

  const toggle = (option: T) => {
    const next = selectedSet.has(option)
      ? selected.filter((value) => value !== option)
      : [...selected, option];
    onToggle(next);
  };

  return (
    <fieldset
      className="leadership-grid-filter-group"
      style={{
        border: `1px solid ${dash.border}`,
        borderRadius: 8,
        margin: 0,
        padding: '8px 12px',
        minWidth: 150,
        background: dash.panelBgAlt,
      }}
    >
      <legend
        style={{
          fontWeight: 600,
          fontSize: 13,
          padding: '0 4px',
          color: dash.textStrong,
        }}
      >
        {label}
      </legend>
      {options.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: dash.textFaint }}>No options</p>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            maxHeight: 160,
            overflowY: 'auto',
          }}
        >
          {options.map((option) => (
            <label
              key={String(option)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                color: dash.text,
              }}
            >
              <input
                type="checkbox"
                checked={selectedSet.has(option)}
                onChange={() => toggle(option)}
              />
              {String(option)}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/** A labeled category grouping one or more FilterGroups in a wrap row. */
function FilterCategory({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={categoryStyle}>
      <div style={categoryTitleStyle}>{title}</div>
      <div style={categoryRowStyle}>{children}</div>
    </div>
  );
}

export default function GridFilterBar() {
  const { model, auditTrail, approvalEnabled, gridFilter, setGridFilter, clearGridFilter } =
    useLeadership();

  const [expanded, setExpanded] = useState<boolean>(false);

  const options: GridFilterOptions =
    model === null ? EMPTY_OPTIONS : buildFilterOptions(model, auditTrail, approvalEnabled);

  const patch = (partial: Partial<GridFilterSelection>) => setGridFilter(partial);

  // Total number of active selections across all six dimensions.
  const activeCount =
    gridFilter.months.length +
    gridFilter.teams.length +
    gridFilter.pillars.length +
    gridFilter.kpis.length +
    gridFilter.statuses.length +
    gridFilter.updatedBy.length;

  const toggleExpanded = () => setExpanded((value) => !value);

  const handleHeaderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleExpanded();
    }
  };

  return (
    <section
      aria-label="Grid filters"
      className="leadership-grid-filter-bar"
      style={{
        background: dash.panelBg,
        borderBottom: `1px solid ${dash.border}`,
      }}
    >
      {/* Header bar — always visible, toggles the categorized panel. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label="Filters"
        data-testid="grid-filter-toggle"
        onClick={toggleExpanded}
        onKeyDown={handleHeaderKeyDown}
        style={headerStyle}
      >
        <span aria-hidden="true" style={{ fontSize: 16, color: dash.textMuted }}>
          ▤
        </span>
        <span style={{ fontWeight: 600, fontSize: 14, color: dash.textStrong }}>
          Filters
        </span>
        {activeCount > 0 && (
          <span data-testid="grid-filter-count" style={badgeStyle}>
            {activeCount}
          </span>
        )}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            clearGridFilter();
          }}
          disabled={activeCount === 0}
          style={clearButtonStyle(activeCount === 0)}
        >
          Clear filters
        </button>
        <span aria-hidden="true" style={{ fontSize: 14, color: dash.textMuted }}>
          {expanded ? '▾' : '▸'}
        </span>
      </div>

      {/* Categorized groups — only rendered when expanded. */}
      {expanded && (
        <div style={bodyStyle}>
          <FilterCategory title="Time">
            <FilterGroup
              label="Month"
              options={options.months}
              selected={gridFilter.months}
              onToggle={(months) => patch({ months })}
            />
          </FilterCategory>

          <FilterCategory title="Scope">
            <FilterGroup
              label="Team"
              options={options.teams}
              selected={gridFilter.teams}
              onToggle={(teams) => patch({ teams })}
            />
            <FilterGroup
              label="Engineering Pillar"
              options={options.pillars}
              selected={gridFilter.pillars}
              onToggle={(pillars) => patch({ pillars })}
            />
          </FilterCategory>

          <FilterCategory title="Metric">
            <FilterGroup
              label="KPI"
              options={options.kpis}
              selected={gridFilter.kpis}
              onToggle={(kpis) => patch({ kpis })}
            />
          </FilterCategory>

          <FilterCategory title="Status & People">
            <FilterGroup
              label="Status"
              options={options.statuses}
              selected={gridFilter.statuses}
              onToggle={(statuses) => patch({ statuses })}
            />
            <FilterGroup
              label="Updated By"
              options={options.updatedBy}
              selected={gridFilter.updatedBy}
              onToggle={(updatedBy) => patch({ updatedBy })}
            />
          </FilterCategory>
        </div>
      )}
    </section>
  );
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 16px',
  cursor: 'pointer',
  userSelect: 'none',
};

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 20,
  height: 20,
  padding: '0 6px',
  borderRadius: 10,
  background: dash.primary,
  color: dash.textStrong,
  fontSize: 12,
  fontWeight: 700,
};

function clearButtonStyle(disabled: boolean): CSSProperties {
  return {
    marginLeft: 'auto',
    padding: '6px 14px',
    borderRadius: 8,
    border: `1px solid ${dash.border}`,
    background: 'transparent',
    color: disabled ? dash.textFaint : dash.text,
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 13,
    fontWeight: 600,
    opacity: disabled ? 0.6 : 1,
  };
}

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: '0 16px 16px',
};

const categoryStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const categoryTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  color: dash.textMuted,
};

const categoryRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  alignItems: 'flex-start',
};
