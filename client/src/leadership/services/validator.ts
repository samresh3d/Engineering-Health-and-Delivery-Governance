/**
 * Validator (pure computation core).
 *
 * Validates a raw cell input against a Grid_Row's KPI_Type and returns either
 * the normalized value or a rejection reason (Requirement 2.5). Percentage
 * inputs are normalized with the module's existing fraction normalization so
 * that `85`, `85%`, and `0.85` are all interpreted consistently as the same
 * 0–100 percentage (Requirement 2.8).
 *
 * The type-derivation helper (`deriveKpiType`, Assumption A5) resolves a KPI's
 * type from its `KpiDefinition` and, failing an explicit signal, infers it from
 * the KPI's existing non-null values — mirroring the unit inference already used
 * by the Overview metrics so the grid and the dashboards agree.
 *
 * This module is intentionally free of React/DOM coupling and reuses the
 * existing normalization helpers from `matrix-parser.ts` rather than
 * reimplementing them (Requirement 4.7 / 11.x: preserve the existing fraction
 * normalization).
 */

import type { KpiType } from '../model/editing-types';
import type { KpiDefinition } from '../model/types';
import { cleanNumber, normalizePercentValue } from './matrix-parser';

export type { KpiType };

/** The outcome of validating a single raw cell input. */
export type ValidationResult =
  | { ok: true; value: number | string | null }
  | { ok: false; reason: string };

/** Validates a raw cell input against a KPI_Type. */
export interface IValidator {
  validate(raw: string, kpiType: KpiType): ValidationResult;
}

/**
 * Name fragments that denote a currency-valued KPI. Mirrors the currency branch
 * of the Overview `kpiUnit` inference so the two stay consistent.
 */
function looksLikeCurrency(name: string): boolean {
  return (
    name.includes('cost') ||
    name.includes('spend') ||
    name.includes('budget') ||
    name.includes('revenue') ||
    name.includes('expense') ||
    name.includes('price')
  );
}

/**
 * Name fragments that denote a percentage-valued KPI. Mirrors the percent branch
 * of the Overview `kpiUnit` inference.
 */
function looksLikePercentName(name: string): boolean {
  return (
    name.includes('%') ||
    name.includes('percent') ||
    name.includes('commitment') ||
    name.includes('coverage') ||
    name.includes('compliance') ||
    name.includes('utilization') ||
    name.includes('utilisation') ||
    name.includes('success') ||
    name.includes('availability') ||
    name.includes('efficiency') ||
    name.includes('rate')
  );
}

/**
 * Derive a KPI's KPI_Type (Assumption A5).
 *
 * Priority:
 *  1. An explicit type carried on the `KpiDefinition` metadata, when present.
 *     The current normalized model has no explicit `type` field, so this is a
 *     forward-compatible read of an optional property rather than a hard
 *     dependency.
 *  2. Inference from the KPI's non-null values and name:
 *     - currency semantics (name mentions cost/spend/…) → `Currency`;
 *     - percentage semantics (name mentions %/coverage/…), or every present
 *       value lies within the [0, 1] unit interval, or the target is a 0–100
 *       percentage → `Percentage`;
 *     - otherwise numeric → `Number`.
 *
 * `Text` is only produced when the definition explicitly declares it; the
 * numeric `samples` cannot by themselves indicate a non-numeric KPI.
 */
export function deriveKpiType(def: KpiDefinition, samples: (number | null)[]): KpiType {
  // (1) Explicit type on the definition metadata, if a workbook/mapping ever
  // supplies one. Read defensively since the base type does not declare it.
  const explicit = (def as { type?: unknown } | null | undefined)?.type;
  if (
    explicit === 'Percentage' ||
    explicit === 'Currency' ||
    explicit === 'Number' ||
    explicit === 'Text'
  ) {
    return explicit;
  }

  const name = (def?.name ?? '').toLowerCase();

  // (2a) Currency semantics take precedence (a "% of cost" KPI is rare; cost is
  // the dominant signal, matching the existing kpiUnit ordering).
  if (looksLikeCurrency(name)) {
    return 'Currency';
  }

  const present = samples.filter(
    (v): v is number => v !== null && Number.isFinite(v)
  );

  // (2b) Percentage semantics: by name, by target range, or when every present
  // value sits within the [0, 1] unit interval (fraction-encoded percentages).
  const target = def?.target ?? null;
  const targetIsPercentRange = target !== null && target > 1 && target <= 100;
  const allInUnitInterval =
    present.length > 0 && present.every((v) => v >= 0 && v <= 1);

  if (looksLikePercentName(name) || allInUnitInterval || (targetIsPercentRange && name.includes('%'))) {
    return 'Percentage';
  }

  // (2c) Default numeric.
  return 'Number';
}

/** Shared numeric parse: reuses the module's dirty-cell coercion. */
function parseNumeric(raw: string): number | null {
  return cleanNumber(raw);
}

/**
 * The default {@link IValidator} implementation.
 *
 * - `Text`: accepts any string as-is.
 * - Numeric types (`Percentage`, `Currency`, `Number`): empty/whitespace input
 *   is accepted as an absent value (`null`, Req 2.8); non-numeric input is
 *   rejected; otherwise the parsed number is returned, with `Percentage`
 *   additionally passed through the existing fraction normalization so that
 *   `85`, `85%`, and `0.85` all normalize to the same 0–100 value.
 */
export const validator: IValidator = {
  validate(raw: string, kpiType: KpiType): ValidationResult {
    // Text accepts any string, including empty.
    if (kpiType === 'Text') {
      return { ok: true, value: raw };
    }

    const trimmed = (raw ?? '').trim();

    // Empty/whitespace numeric input → absent value.
    if (trimmed === '') {
      return { ok: true, value: null };
    }

    const parsed = parseNumeric(trimmed);
    if (parsed === null) {
      return { ok: false, reason: `"${raw}" is not a valid ${kpiType} value` };
    }

    if (kpiType === 'Percentage') {
      // Apply the existing fraction normalization: 0.85 → 85, while 85 and 85%
      // (which cleanNumber already coerces to 85) are left on the 0–100 scale.
      const normalized = normalizePercentValue(parsed, true);
      return { ok: true, value: normalized };
    }

    // Currency and Number: the parsed numeric value.
    return { ok: true, value: parsed };
  },
};

/** Convenience wrapper mirroring the {@link IValidator} interface. */
export function validate(raw: string, kpiType: KpiType): ValidationResult {
  return validator.validate(raw, kpiType);
}
