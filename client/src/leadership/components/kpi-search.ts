/**
 * Pure KPI name search matching.
 *
 * The single source of truth for "does this KPI match the search text?". It is
 * pure and total: the same inputs always produce the same output, it never
 * mutates its arguments, and it is defined for every possible input.
 *
 * Matching rules (design Property 23, Requirement 12.1):
 * - An empty or whitespace-only search returns ALL KPIs (unfiltered view).
 * - Otherwise it returns exactly the KPIs whose names contain the search text
 *   as a case-insensitive substring, preserving the original order, and no
 *   others.
 */

/**
 * Returns exactly the KPI names that match `search` as a case-insensitive
 * substring. When `search` is empty or whitespace-only, every KPI is returned.
 *
 * @param kpis   The KPI names to filter. Never mutated.
 * @param search The search text entered by the user.
 * @returns A new array containing the matching KPI names in their original order.
 */
export function matchKpisByName(kpis: string[], search: string): string[] {
  const needle = search.trim().toLowerCase();
  if (needle === '') {
    // Empty / whitespace-only search: no filtering applied.
    return kpis.slice();
  }
  return kpis.filter((kpi) => kpi.toLowerCase().includes(needle));
}
