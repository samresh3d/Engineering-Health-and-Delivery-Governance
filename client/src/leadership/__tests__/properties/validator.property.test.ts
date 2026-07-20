/**
 * Property test for the Validator (Task 3.2).
 *
 * Feature: leadership-data-management, Property 3: Validator correctness
 * including fraction normalization.
 *
 * For any raw input string and KPI_Type, the Validator returns `ok` with a
 * normalized value if and only if the input is well-formed for that type, and
 * for `Percentage` inputs the normalized value equals the module's existing
 * fraction normalization applied to the parsed input — so `85`, `85%`, and
 * `0.85` all normalize consistently.
 *
 * Validates: Requirements 2.5, 2.8
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { validate } from '../../services/validator';
import { cleanNumber, normalizePercentValue } from '../../services/matrix-parser';
import type { KpiType } from '../../model/editing-types';
import { arbRawInput } from './arbitraries';

const ALL_TYPES: readonly KpiType[] = ['Percentage', 'Currency', 'Number', 'Text'];

/** A (type, raw-input) pair whose raw string is biased toward the given type. */
const arbTypedInput: fc.Arbitrary<{ kpiType: KpiType; raw: string }> = fc
  .constantFrom(...ALL_TYPES)
  .chain((kpiType) => arbRawInput(kpiType).map((raw) => ({ kpiType, raw })));

describe('Property 3: Validator correctness including fraction normalization', () => {
  it('returns ok with a normalized value iff the input is well-formed for the type', () => {
    fc.assert(
      fc.property(arbTypedInput, ({ kpiType, raw }) => {
        const result = validate(raw, kpiType);

        if (kpiType === 'Text') {
          // Text accepts any string as-is, including empty/whitespace.
          expect(result).toEqual({ ok: true, value: raw });
          return;
        }

        // Numeric types: determine well-formedness independently of the
        // validator using the module's own coercion helpers.
        const trimmed = (raw ?? '').trim();

        if (trimmed === '') {
          // Empty / whitespace → accepted as an absent value (null).
          expect(result).toEqual({ ok: true, value: null });
          return;
        }

        const parsed = cleanNumber(trimmed);

        if (parsed === null) {
          // Non-numeric input → rejected.
          expect(result.ok).toBe(false);
          return;
        }

        // Numeric input → accepted with a number.
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(typeof result.value).toBe('number');
          if (kpiType === 'Percentage') {
            // Percentage normalization matches the existing fraction rule.
            expect(result.value).toBe(normalizePercentValue(parsed, true));
          } else {
            expect(result.value).toBe(parsed);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('normalizes 85, 85%, and 0.85 to the same Percentage value', () => {
    const a = validate('85', 'Percentage');
    const b = validate('85%', 'Percentage');
    const c = validate('0.85', 'Percentage');

    expect(a).toEqual({ ok: true, value: 85 });
    expect(b).toEqual({ ok: true, value: 85 });
    expect(c).toEqual({ ok: true, value: 85 });
  });

  it('normalizes bare, percent-suffixed, and fractional Percentage forms consistently', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (n) => {
        const bare = validate(String(n), 'Percentage');
        const suffixed = validate(`${n}%`, 'Percentage');
        const fraction = validate(String(n / 100), 'Percentage');

        expect(bare.ok).toBe(true);
        expect(suffixed.ok).toBe(true);
        expect(fraction.ok).toBe(true);

        if (bare.ok && suffixed.ok && fraction.ok) {
          // Bare and percent-suffixed forms are on the same 0–100 scale.
          expect(bare.value).toBe(suffixed.value);
          // The fractional form scales up to the same magnitude (allowing for
          // IEEE-754 rounding, e.g. 0.07 * 100 === 7.000000000000001).
          expect(fraction.value as number).toBeCloseTo(n, 6);
        }
      }),
      { numRuns: 200 },
    );
  });
});
