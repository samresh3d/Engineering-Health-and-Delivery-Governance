/**
 * FilterPanel — sticky global-filter panel for the Leadership Dashboard.
 *
 * Renders the six always-present global filters (Month, Year, Team, KPI,
 * Engineering Pillar, Status) plus a conditional Business Unit filter, each
 * populated from the derived {@link FilterOptions} (Req 10.1, 10.5). The
 * Business Unit control is rendered only when `options.businessUnits` is
 * non-null; because options are recomputed from the model, the control appears
 * automatically if the Business Unit dimension becomes available after load
 * (Req 10.2, 10.3) — no code change required.
 *
 * Every control is a multi-select checkbox group. Toggling any option calls
 * `updateSelection` with a patch for the affected dimension (Req 10.4); the
 * "Clear filters" control calls `clearFilters` to restore the full dataset
 * (Req 10.6). The panel is sticky so it stays visible while the report scrolls
 * (Req 13.3).
 */
import { useLeadership } from '../state/useLeadership';
import type {
  EngineeringPillar,
  FilterSelection,
  HealthStatus,
} from '../model/types';

/** A single multi-select filter group over values of type `T`. */
interface FilterGroupProps<T extends string | number> {
  label: string;
  options: readonly T[];
  selected: readonly T[];
  onToggle: (next: T[]) => void;
}

function FilterGroup<T extends string | number>({
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
      className="leadership-filter-group"
      style={{
        border: '1px solid var(--ld-border, #d0d5dd)',
        borderRadius: 8,
        margin: 0,
        padding: '8px 12px',
        minWidth: 160,
      }}
    >
      <legend style={{ fontWeight: 600, fontSize: 13, padding: '0 4px' }}>
        {label}
      </legend>
      {options.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>No options</p>
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
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
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

export default function FilterPanel() {
  const { options, selection, updateSelection, clearFilters } = useLeadership();

  const patch = (partial: Partial<FilterSelection>) => updateSelection(partial);

  return (
    <section
      aria-label="Global filters"
      className="leadership-filter-panel"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'flex-start',
        padding: 16,
        background: 'var(--ld-panel-bg, #ffffff)',
        borderBottom: '1px solid var(--ld-border, #d0d5dd)',
      }}
    >
      <FilterGroup
        label="Month"
        options={options.months}
        selected={selection.months}
        onToggle={(months) => patch({ months })}
      />
      <FilterGroup
        label="Year"
        options={options.years}
        selected={selection.years}
        onToggle={(years) => patch({ years })}
      />
      <FilterGroup
        label="Team"
        options={options.teams}
        selected={selection.teams}
        onToggle={(teams) => patch({ teams })}
      />
      <FilterGroup
        label="KPI"
        options={options.kpis}
        selected={selection.kpis}
        onToggle={(kpis) => patch({ kpis })}
      />
      <FilterGroup<EngineeringPillar>
        label="Engineering Pillar"
        options={options.pillars}
        selected={selection.pillars}
        onToggle={(pillars) => patch({ pillars })}
      />
      <FilterGroup<HealthStatus>
        label="Status"
        options={options.statuses}
        selected={selection.statuses}
        onToggle={(statuses) => patch({ statuses })}
      />

      {options.businessUnits != null && (
        <FilterGroup
          label="Business Unit"
          options={options.businessUnits}
          selected={selection.businessUnits ?? []}
          onToggle={(businessUnits) => patch({ businessUnits })}
        />
      )}

      <button
        type="button"
        onClick={clearFilters}
        style={{
          alignSelf: 'center',
          marginLeft: 'auto',
          padding: '8px 16px',
          borderRadius: 8,
          border: '1px solid var(--ld-border, #d0d5dd)',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Clear filters
      </button>
    </section>
  );
}
