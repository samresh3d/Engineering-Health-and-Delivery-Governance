/**
 * SearchBar — controlled KPI name search input.
 *
 * A thin, controlled text input bound to the Leadership Dashboard state's
 * `search` value and `setSearch` action. Typing updates module state; the KPI
 * views consume that state (via {@link matchKpisByName}) to display only the
 * KPIs whose names match the entered text (Requirement 12.1).
 *
 * The matching logic itself lives in {@link matchKpisByName} so it can be reused
 * by the views and unit/property tested in isolation (design Property 23).
 */
import { useLeadership } from '../state/useLeadership';
import { matchKpisByName } from './kpi-search';

export { matchKpisByName };

export interface SearchBarProps {
  /** Accessible label / placeholder for the input. */
  placeholder?: string;
}

export default function SearchBar({
  placeholder = 'Search KPIs by name',
}: SearchBarProps) {
  const { search, setSearch } = useLeadership();

  return (
    <div className="leadership-search-bar">
      <label className="visually-hidden" htmlFor="leadership-kpi-search">
        {placeholder}
      </label>
      <input
        id="leadership-kpi-search"
        type="search"
        role="searchbox"
        value={search}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => setSearch(event.target.value)}
      />
    </div>
  );
}
