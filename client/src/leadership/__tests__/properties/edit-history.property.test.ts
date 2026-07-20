/**
 * Property-based tests for the EditHistory service
 * (`client/src/leadership/services/edit-history.ts`).
 *
 * Uses the shared, parser-consistent `arbModel` arbitrary in `./arbitraries.ts`
 * together with fast-check + Vitest. Each property runs at least 100 times.
 *
 * Covers design correctness property:
 *  - Property 21 — Undo/redo consistency (Req 8.5, 8.6)
 *
 * The undo/redo semantics are exercised via an explicit reference simulation:
 * a sequence of model snapshots is driven through `pushSnapshot` (recording the
 * pre-edit model on undo), then a matching number of `undo` and `redo`
 * operations, asserting that undo restores prior snapshots in reverse order,
 * redo re-applies them in forward order, and the round trip returns exactly to
 * the current model.
 *
 * Feature: leadership-data-management, Property 21: Undo/redo consistency
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import type { DashboardModel } from '../../model/types';
import {
  emptyHistory,
  pushSnapshot,
  undo,
  redo,
  type EditHistoryState,
} from '../../services/edit-history';
import { arbModel } from './arbitraries';

const RUNS = { numRuns: 200 } as const;

/** Deep, structural clone used to detect input mutation. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

// A sequence of at least one snapshot: index 0 is the initial "current" model,
// and each subsequent entry is the model after one committed edit.
const arbModelSequence: fc.Arbitrary<DashboardModel[]> = fc.array(arbModel(), {
  minLength: 1,
  maxLength: 6,
});

// Two independently generated models, for the single-step scenarios.
const arbTwoModels: fc.Arbitrary<[DashboardModel, DashboardModel]> = fc.tuple(
  arbModel(),
  arbModel(),
);

describe('EditHistory — Property 21: Undo/redo consistency (Req 8.5, 8.6)', () => {
  it('pushSnapshot then undo restores the prior model and stages redo; a subsequent redo restores current', () => {
    // Feature: leadership-data-management, Property 21: Undo/redo consistency
    fc.assert(
      fc.property(arbTwoModels, ([prior, current]) => {
        const afterPush = pushSnapshot(emptyHistory(), prior);

        // undo(current): returns model === prior and pushes current onto redo.
        const undone = undo(afterPush, current);
        expect(undone.model).toEqual(prior);
        expect(undone.history.undo).toEqual([]);
        expect(undone.history.redo).toEqual([current]);

        // A subsequent redo (with prior now being the "current" model) returns
        // current and restores the undo stack.
        const redone = redo(undone.history, prior);
        expect(redone.model).toEqual(current);
        expect(redone.history.undo).toEqual([prior]);
        expect(redone.history.redo).toEqual([]);
      }),
      RUNS,
    );
  });

  it('undo on an empty undo stack returns { model: null } and leaves the history unchanged', () => {
    // Feature: leadership-data-management, Property 21: Undo/redo consistency
    fc.assert(
      fc.property(arbModel(), (current) => {
        const history = emptyHistory();
        const before = clone(history);

        const result = undo(history, current);

        expect(result.model).toBeNull();
        // Unchanged: same reference and structurally identical.
        expect(result.history).toBe(history);
        expect(history).toEqual(before);
      }),
      RUNS,
    );
  });

  it('redo on an empty redo stack returns { model: null } and leaves the history unchanged', () => {
    // Feature: leadership-data-management, Property 21: Undo/redo consistency
    fc.assert(
      fc.property(arbModel(), arbModel(), (seed, current) => {
        // A history may have undo entries but an empty redo stack.
        const history = pushSnapshot(emptyHistory(), seed);
        const before = clone(history);

        const result = redo(history, current);

        expect(result.model).toBeNull();
        expect(result.history).toBe(history);
        expect(history).toEqual(before);
      }),
      RUNS,
    );
  });

  it('N undos recover each prior snapshot in reverse order; N redos re-apply them in forward order (round trip)', () => {
    // Feature: leadership-data-management, Property 21: Undo/redo consistency
    fc.assert(
      fc.property(arbModelSequence, (models) => {
        // Reference simulation of real editing flow: models[0] is the initial
        // current model; each models[i] (i>=1) is the model after edit i, and
        // the pre-edit model is pushed onto the undo stack before it becomes
        // current.
        const k = models.length - 1; // number of edits
        let history: EditHistoryState = emptyHistory();
        let current = models[0];

        for (let i = 1; i <= k; i++) {
          history = pushSnapshot(history, current);
          current = models[i];
        }

        // After k edits: undo stack holds models[0..k-1], current === models[k].
        expect(history.undo).toEqual(models.slice(0, k));
        expect(history.redo).toEqual([]);
        expect(current).toEqual(models[k]);

        // Perform k undos: each restores the prior snapshot in reverse order.
        for (let i = k - 1; i >= 0; i--) {
          const result = undo(history, current);
          expect(result.model).toEqual(models[i]);
          history = result.history;
          current = result.model as DashboardModel;
        }

        // Back to the original model with a full redo stack.
        expect(current).toEqual(models[0]);
        expect(history.undo).toEqual([]);
        expect(history.redo.length).toBe(k);

        // Perform k redos: each re-applies the snapshots in forward order.
        for (let i = 1; i <= k; i++) {
          const result = redo(history, current);
          expect(result.model).toEqual(models[i]);
          history = result.history;
          current = result.model as DashboardModel;
        }

        // Round trip returns exactly to the current model.
        expect(current).toEqual(models[k]);
        expect(history.undo).toEqual(models.slice(0, k));
        expect(history.redo).toEqual([]);
      }),
      RUNS,
    );
  });

  it('undo and redo do not mutate their input history or model arguments', () => {
    // Feature: leadership-data-management, Property 21: Undo/redo consistency
    fc.assert(
      fc.property(arbModelSequence, arbModel(), (models, edited) => {
        const k = models.length - 1;
        let history: EditHistoryState = emptyHistory();
        let current = models[0];
        for (let i = 1; i <= k; i++) {
          history = pushSnapshot(history, current);
          current = models[i];
        }

        // Snapshot the exact inputs before an operation, then verify they are
        // untouched afterward.
        const historyBefore = clone(history);
        const currentBefore = clone(current);

        const undone = undo(history, current);
        expect(history).toEqual(historyBefore);
        expect(current).toEqual(currentBefore);

        // pushSnapshot must not mutate its inputs either.
        const pushInputHistory = clone(undone.history);
        const editedBefore = clone(edited);
        pushSnapshot(undone.history, edited);
        expect(undone.history).toEqual(pushInputHistory);
        expect(edited).toEqual(editedBefore);
      }),
      RUNS,
    );
  });
});
