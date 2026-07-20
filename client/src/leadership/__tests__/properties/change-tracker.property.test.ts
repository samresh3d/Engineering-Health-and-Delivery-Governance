/**
 * Property-based tests for the ChangeTracker service
 * (`client/src/leadership/services/change-tracker.ts`).
 *
 * Uses fast-check + Vitest and the shared, parser-consistent arbitraries in
 * `./arbitraries.ts` (`arbModel`, `arbAuditTrail`) to build initial audit
 * trails. Each property runs at least 100 times.
 *
 * Covers design correctness properties:
 *  - Property 11 — Change records are well-formed and appended (Req 5.1, 5.2, 5.3, 5.4)
 *  - Property 12 — Audit trail is viewable per row              (Req 5.6)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { changeTracker } from '../../services/change-tracker';
import type { ChangeRecordInput } from '../../services/change-tracker';
import { arbModel, arbAuditTrail } from './arbitraries';

const RUNS = { numRuns: 100 } as const;

/** A finite (non-NaN, non-infinite) numeric change value or a string/null. */
const arbChangeValue: fc.Arbitrary<number | string | null> = fc.oneof(
  fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true }),
  fc.constantFrom('n/a', 'pending', 'reviewed'),
  fc.constant(null)
);

const arbIsoTimestamp = fc
  .integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2025, 0, 1) })
  .map((ms) => new Date(ms).toISOString());

/**
 * Generate a well-formed {@link ChangeRecordInput}. `comments` is present on
 * some inputs and absent (property omitted) on others so the tests can assert
 * the "comments present iff provided" behaviour of `record`.
 */
const arbRecordInput: fc.Arbitrary<ChangeRecordInput> = fc
  .record({
    rowId: fc.string({ minLength: 1 }),
    field: fc.constantFrom<'target' | 'actual'>('target', 'actual'),
    previousValue: arbChangeValue,
    newValue: arbChangeValue,
    updatedBy: fc.constantFrom('alice', 'bob', 'carol', 'dan', 'erin'),
    timestamp: arbIsoTimestamp,
    comments: fc.option(fc.string(), { nil: undefined }),
  })
  .map((r) => {
    const input: ChangeRecordInput = {
      rowId: r.rowId,
      field: r.field,
      previousValue: r.previousValue,
      newValue: r.newValue,
      updatedBy: r.updatedBy,
      timestamp: r.timestamp,
    };
    if (r.comments !== undefined) input.comments = r.comments;
    return input;
  });

describe('ChangeTracker properties', () => {
  // Feature: leadership-data-management, Property 11: Change records are well-formed and appended — record(input) produces a well-formed ChangeRecord and append immutably adds exactly it to the trail with faithful previousValue/newValue/updatedBy/timestamp and comments present iff supplied.
  it('Property 11: record is well-formed and append adds exactly one immutably', () => {
    fc.assert(
      fc.property(
        arbModel().chain((model) => arbAuditTrail(model)),
        arbRecordInput,
        (trail, input) => {
          const originalLength = trail.length;
          const originalSnapshot = [...trail];

          const rec = changeTracker.record(input);
          const nextTrail = changeTracker.append(trail, rec);

          // Exactly one record appended.
          expect(nextTrail.length).toBe(originalLength + 1);

          // The last record is exactly the produced record.
          const last = nextTrail[nextTrail.length - 1];
          expect(last).toBe(rec);

          // Field fidelity against the input (Req 5.1, 5.2).
          expect(rec.previousValue).toBe(input.previousValue);
          expect(rec.newValue).toBe(input.newValue);
          expect(rec.updatedBy).toBe(input.updatedBy);
          expect(rec.timestamp).toBe(input.timestamp);
          expect(rec.rowId).toBe(input.rowId);
          expect(rec.field).toBe(input.field);

          // timestamp is present (Req 5.1).
          expect(typeof rec.timestamp).toBe('string');
          expect(rec.timestamp.length).toBeGreaterThan(0);

          // comments present iff provided (Req 5.3).
          if (input.comments !== undefined) {
            expect(rec.comments).toBe(input.comments);
          } else {
            expect('comments' in rec).toBe(false);
          }

          // append did not mutate the original trail (Req 5.4).
          expect(trail.length).toBe(originalLength);
          expect(trail).toEqual(originalSnapshot);
          // append returns a NEW array.
          expect(nextTrail).not.toBe(trail);

          // The prefix of the new trail equals the original trail.
          expect(nextTrail.slice(0, originalLength)).toEqual(originalSnapshot);
        }
      ),
      RUNS
    );
  });

  // Feature: leadership-data-management, Property 12: Audit trail is viewable per row — forRow returns exactly the ChangeRecords whose rowId matches, in chronological order, and no others.
  it('Property 12: forRow returns exactly the matching rows in chronological order', () => {
    fc.assert(
      fc.property(
        arbModel().chain((model) => arbAuditTrail(model)),
        (trail) => {
          // Query every rowId that appears in the trail, plus one that does not.
          const rowIds = new Set(trail.map((r) => r.rowId));
          const queries = [...rowIds, '__no-such-row__'];

          for (const id of queries) {
            const result = changeTracker.forRow(trail, id);

            // Every returned record has the queried rowId.
            for (const rec of result) {
              expect(rec.rowId).toBe(id);
            }

            // Result equals exactly the order-preserving subsequence of the
            // trail whose rowId matches — no others, order preserved.
            const expected = trail.filter((r) => r.rowId === id);
            expect(result).toEqual(expected);
          }
        }
      ),
      RUNS
    );
  });
});
