import type { Direction, EngineeringPillar } from './types';

/**
 * Static KPI → Engineering Pillar and default better-direction mapping.
 *
 * This mapping is data-only. It assigns known KPIs to an {@link EngineeringPillar}
 * and a default {@link Direction} (whether a higher or lower value is better).
 *
 * When the uploaded KPIs sheet provides explicit Pillar / Direction / Amber columns,
 * those sheet values override this mapping (handled by the parser). This mapping is
 * only the fallback used when the sheet does not specify them.
 *
 * Unknown KPIs default to `{ pillar: null, direction: 'HigherIsBetter' }` and still
 * appear in all views and filters (Requirements 4.2, 4.6).
 */
export interface KpiPillarMeta {
  /** Engineering pillar the KPI belongs to, or `null` when the KPI is unknown. */
  pillar: EngineeringPillar | null;
  /** Default direction of "better" for the KPI when the sheet does not specify one. */
  direction: Direction;
}

/**
 * Default metadata applied to any KPI not present in {@link KPI_PILLAR_MAP}.
 */
export const DEFAULT_KPI_META: KpiPillarMeta = {
  pillar: null,
  direction: 'HigherIsBetter',
};

/**
 * Known KPI-to-pillar/direction mapping, keyed by a normalized KPI name
 * (lower-cased and trimmed). Lookup normalizes the incoming name the same way,
 * so matching is case-insensitive and whitespace-insensitive.
 */
export const KPI_PILLAR_MAP: Readonly<Record<string, KpiPillarMeta>> = {
  // Pillar 1 — Engineering Health (Delivery Governance) -> Delivery.
  'sprint commitment': { pillar: 'Delivery', direction: 'HigherIsBetter' },
  'release success rate': { pillar: 'Delivery', direction: 'HigherIsBetter' },
  'release success': { pillar: 'Delivery', direction: 'HigherIsBetter' },
  'deployment frequency': { pillar: 'Delivery', direction: 'HigherIsBetter' },
  'team capacity utilization': { pillar: 'Delivery', direction: 'HigherIsBetter' },
  'ai efficiency': { pillar: 'Delivery', direction: 'HigherIsBetter' },
  'throughput': { pillar: 'Delivery', direction: 'HigherIsBetter' },

  // Pillar 2 — Engineering Quality -> Quality.
  'defect density': { pillar: 'Quality', direction: 'LowerIsBetter' },
  'test automation coverage': { pillar: 'Quality', direction: 'HigherIsBetter' },
  'unit test coverage': { pillar: 'Quality', direction: 'HigherIsBetter' },
  'code review compliance': { pillar: 'Quality', direction: 'HigherIsBetter' },
  'technical debt backlog': { pillar: 'Quality', direction: 'LowerIsBetter' },
  'technical debt': { pillar: 'Quality', direction: 'LowerIsBetter' },
  'vapt/security compliance, dpdp': { pillar: 'Quality', direction: 'HigherIsBetter' },
  'vapt/security compliance': { pillar: 'Quality', direction: 'HigherIsBetter' },
  'eol compliance': { pillar: 'Quality', direction: 'HigherIsBetter' },

  // Sustain sub-group -> Sustainability.
  'system availability': { pillar: 'Sustainability', direction: 'HigherIsBetter' },
  'server/cloud utilization': { pillar: 'Sustainability', direction: 'HigherIsBetter' },
  'resource utilization': { pillar: 'Sustainability', direction: 'HigherIsBetter' },
  'production defects (hypercare)': { pillar: 'Sustainability', direction: 'LowerIsBetter' },
  'production defects/hypercare post release': { pillar: 'Sustainability', direction: 'LowerIsBetter' },
  'production defects': { pillar: 'Sustainability', direction: 'LowerIsBetter' },
  'production stability': { pillar: 'Sustainability', direction: 'HigherIsBetter' },
  'mttr': { pillar: 'Sustainability', direction: 'LowerIsBetter' },

  // COST -> Cost; spend efficiency, lower is better.
  'run/cloud cost': { pillar: 'Cost', direction: 'LowerIsBetter' },
  'cloud cost': { pillar: 'Cost', direction: 'LowerIsBetter' },

  // Team Health Score is a composite overall score that does not belong to a single
  // pillar; it is left unattributed (null) but a higher score is better.
  'team health score': { pillar: null, direction: 'HigherIsBetter' },
};

/**
 * Normalize a KPI name for map lookup: trim surrounding whitespace, collapse
 * internal whitespace runs to a single space, and lower-case.
 */
function normalizeKpiName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Resolve the pillar and default better-direction for a KPI by name.
 *
 * Matching is case-insensitive and whitespace-insensitive. Unknown KPIs return
 * the {@link DEFAULT_KPI_META} (`pillar: null`, `direction: 'HigherIsBetter'`),
 * so every KPI — known or not — resolves to a usable result and still surfaces
 * in views and filters (Requirements 4.2, 4.6).
 *
 * @param kpiName - The KPI name as discovered in the sheet.
 * @returns The resolved pillar and direction for the KPI.
 */
export function lookupKpiPillar(kpiName: string): KpiPillarMeta {
  const meta = KPI_PILLAR_MAP[normalizeKpiName(kpiName)];
  return meta ?? DEFAULT_KPI_META;
}
