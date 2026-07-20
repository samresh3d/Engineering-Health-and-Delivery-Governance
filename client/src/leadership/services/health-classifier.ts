/**
 * HealthClassifier — pure health-status classification for the Leadership Dashboard.
 *
 * Maps a KPI value against its target (with an optional amber threshold band and
 * a better-direction) to a `HealthStatus` of Green, Amber, Red, or Unknown.
 *
 * The function is pure and total: it never throws, has no side effects, and
 * returns a defined `HealthStatus` for every possible input, including absent
 * (`null`) values or targets.
 *
 * Classification rules (Requirement 5):
 *  - Absent value or target                      → Unknown            (Req 5.7)
 *  - Value within the provided amber band         → Amber              (Req 5.6)
 *  - HigherIsBetter: value >= target              → Green              (Req 5.2)
 *  - HigherIsBetter: value <  target              → Red                (Req 5.4)
 *  - LowerIsBetter:  value <= target              → Green              (Req 5.3)
 *  - LowerIsBetter:  value >  target              → Red                (Req 5.5)
 */

import type { Direction, HealthStatus, AmberBand } from '../model/types';

/** Input to {@link classify}. */
export interface ClassifyInput {
  /** The measured KPI value; `null` when absent. */
  value: number | null;
  /** The KPI's target; `null` when absent. */
  target: number | null;
  /** The direction in which the KPI value is considered "better". */
  direction: Direction;
  /** Optional amber threshold band from the sheet; a value within it is Amber. */
  amberBand?: AmberBand | null;
}

/**
 * Classify a KPI value against its target.
 *
 * @param input value, target, direction, and optional amber band
 * @returns the resulting {@link HealthStatus}
 */
export function classify(input: ClassifyInput): HealthStatus {
  const { value, target, direction, amberBand } = input;

  // Req 5.7: an absent (or non-finite) value or target is Unknown, regardless
  // of direction or amber band.
  if (value === null || target === null || !isFinite(value) || !isFinite(target)) {
    return 'Unknown';
  }

  // Req 5.6: when an amber band is provided and the value falls within it
  // (inclusive), the status is Amber. This takes precedence over the
  // Green/Red target comparison.
  if (amberBand != null && isWithinAmberBand(value, amberBand)) {
    return 'Amber';
  }

  // Req 5.2 / 5.4: higher values are better.
  if (direction === 'HigherIsBetter') {
    return value >= target ? 'Green' : 'Red';
  }

  // Req 5.3 / 5.5: lower values are better (direction === 'LowerIsBetter').
  return value <= target ? 'Green' : 'Red';
}

/**
 * Determine whether a value falls within an amber band (inclusive on both
 * bounds). The band bounds are normalized so that order does not matter.
 * A non-finite bound disables the band.
 */
function isWithinAmberBand(value: number, band: AmberBand): boolean {
  if (!isFinite(band.lower) || !isFinite(band.upper)) {
    return false;
  }
  const min = Math.min(band.lower, band.upper);
  const max = Math.max(band.lower, band.upper);
  return value >= min && value <= max;
}
