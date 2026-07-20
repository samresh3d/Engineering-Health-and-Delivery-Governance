/**
 * Property-based tests for the PersistenceService
 * (`client/src/leadership/services/persistence-service.ts`).
 *
 * Uses fast-check + Vitest and the shared, parser-consistent arbitraries in
 * `./arbitraries.ts` (`arbModel`, `arbAuditTrail`). Each property runs at least
 * 100 times. Storage I/O is exercised through an in-memory `StorageAdapter`
 * (and, for the failure property, an adapter whose `write` throws) so the tests
 * never touch real `localStorage`.
 *
 * Covers design correctness properties:
 *  - Property 23 — Persistence save/load round trip                 (Req 10.1, 10.2)
 *  - Property 24 — Version snapshot and restore round trip          (Req 10.3, 10.5)
 *  - Property 25 — Version comparison reports exactly the real diffs (Req 10.4)
 *  - Property 26 — Save failure preserves in-memory state           (Req 10.6)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  createPersistenceService,
  compareVersions,
  isEmptyDiff,
  restoreVersion,
  structuredCloneJson,
  type StorageAdapter,
  type PersistedState,
} from '../../services/persistence-service';
import type { DashboardModel } from '../../model/types';
import type { Version } from '../../model/editing-types';
import { arbModel, arbAuditTrail } from './arbitraries';

const RUNS = { numRuns: 100 } as const;

// ---------------------------------------------------------------------------
// Test doubles for the StorageAdapter contract
// ---------------------------------------------------------------------------

/** Synchronous in-memory adapter backed by a Map (a stand-in for storage). */
class MemoryAdapter implements StorageAdapter {
  private store = new Map<string, string>();
  read(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  write(key: string, value: string): void {
    this.store.set(key, value);
  }
}

/** Adapter whose `write` always throws (e.g. simulating quota exceeded). */
class FailingAdapter implements StorageAdapter {
  read(): string | null {
    return null;
  }
  write(): void {
    throw new Error('QuotaExceededError: storage write failed');
  }
}

// ---------------------------------------------------------------------------
// Shared arbitraries
// ---------------------------------------------------------------------------

/**
 * A JSON-round-trippable {@link PersistedState}: an `arbModel` model, a matching
 * `arbAuditTrail`, an empty version store, and JSON-safe approval/user fields.
 */
const arbPersistedState: fc.Arbitrary<PersistedState> = arbModel().chain((model) =>
  fc.record({
    model: fc.constant(model),
    auditTrail: arbAuditTrail(model),
    versions: fc.constant([] as Version[]),
    approvalEnabled: fc.boolean(),
    currentUser: fc.option(fc.string(), { nil: null }),
  })
);

/** Build a Version wrapper around a model (compareVersions only reads `.model`). */
function makeVersion(model: DashboardModel, id: string, cycle: string): Version {
  return { id, cycle, createdAt: new Date(0).toISOString(), model };
}

describe('PersistenceService properties', () => {
  // Feature: leadership-data-management, Property 23: Persistence save/load round trip — for any PersistedState, save(state) succeeds and load() returns a PersistedState deeply equal to the JSON-normalized saved state.
  it('Property 23: save then load round-trips the state (Req 10.1, 10.2)', () => {
    fc.assert(
      fc.property(arbPersistedState, (state) => {
        const service = createPersistenceService(new MemoryAdapter());

        const result = service.save(state);
        expect(result).toEqual({ ok: true });

        const loaded = service.load();
        // JSON round-trip semantics: undefined fields disappear, so compare
        // against the JSON-normalized form of the saved state.
        const normalized = JSON.parse(JSON.stringify(state)) as PersistedState;
        expect(loaded).toEqual(normalized);
      }),
      RUNS
    );
  });

  // Feature: leadership-data-management, Property 24: Version snapshot and restore round trip — snapshotVersion appends one immutable version whose model equals state.model and whose cycle matches; restoreVersion of that version reproduces the snapshot model.
  it('Property 24: snapshot then restore round-trips the model immutably (Req 10.3, 10.5)', () => {
    fc.assert(
      fc.property(arbPersistedState, fc.string({ minLength: 1 }), (state, cycle) => {
        const service = createPersistenceService(new MemoryAdapter());

        const originalVersionCount = state.versions.length;
        // JSON snapshot as the immutability oracle (round-trip semantics: the
        // stored snapshot is a JSON clone, so `-0` normalizes consistently on
        // both sides of the comparison).
        const stateJsonBefore = JSON.stringify(state);

        const snapshotState = service.snapshotVersion(state, cycle);

        // Exactly one more version.
        expect(snapshotState.versions.length).toBe(originalVersionCount + 1);

        const newVersion = snapshotState.versions[snapshotState.versions.length - 1];
        // The new version's model deep-equals the source model under JSON
        // round-trip semantics (the snapshot is a structured JSON clone).
        expect(newVersion.model).toEqual(JSON.parse(JSON.stringify(state.model)));
        // ...and carries the requested cycle.
        expect(newVersion.cycle).toBe(cycle);

        // Immutability: the original state is untouched.
        expect(state.versions.length).toBe(originalVersionCount);
        expect(JSON.stringify(state)).toBe(stateJsonBefore);
        expect(snapshotState).not.toBe(state);
        expect(snapshotState.versions).not.toBe(state.versions);

        // Restore the freshly snapshotted version: model deep-equals the snapshot.
        const restored = restoreVersion(snapshotState, newVersion.id);
        expect(restored.model).toEqual(newVersion.model);
      }),
      RUNS
    );
  });

  // Feature: leadership-data-management, Property 25: Version comparison reports exactly the real differences — identical models yield an empty diff; a single controlled change yields exactly that one categorized difference; and isEmptyDiff(compareVersions(a,b)) holds iff the two models are deeply equal.
  it('Property 25a: equal models produce an empty diff (Req 10.4)', () => {
    fc.assert(
      fc.property(arbModel(), (model) => {
        const a = makeVersion(model, 'a', '2025-01');
        // Clone via JSON so key order matches exactly.
        const b = makeVersion(structuredCloneJson(model), 'b', '2025-02');
        expect(isEmptyDiff(compareVersions(a, b))).toBe(true);
      }),
      RUNS
    );
  });

  it('Property 25b: a single changed metric value is reported exactly (Req 10.4)', () => {
    fc.assert(
      fc.property(
        arbModel(),
        fc.nat(),
        (model, idx) => {
          // Use a JSON-normalized clone as the baseline so both sides of the
          // comparison and the expected values share the same numeric form
          // (avoids `-0` vs `0` mismatches; the service treats them as equal).
          const modelA = structuredCloneJson(model);
          const modelB = structuredCloneJson(modelA);
          const i = idx % modelB.metrics.length;
          const target = modelA.metrics[i];
          const from = target.value;
          // Guarantee a genuinely different value.
          const to = from === null ? 42 : null;
          modelB.metrics[i].value = to;

          const diff = compareVersions(makeVersion(modelA, 'a', 'c1'), makeVersion(modelB, 'b', 'c2'));

          expect(diff.addedMetrics).toHaveLength(0);
          expect(diff.removedMetrics).toHaveLength(0);
          expect(diff.targetChanges).toHaveLength(0);
          expect(diff.otherChanges).toBe(false);
          expect(diff.changedMetrics).toHaveLength(1);
          expect(diff.changedMetrics[0]).toEqual({
            team: target.team,
            kpi: target.kpi,
            periodKey: target.period.key,
            from,
            to,
          });
          expect(isEmptyDiff(diff)).toBe(false);
        }
      ),
      RUNS
    );
  });

  it('Property 25c: a single changed KPI target is reported exactly (Req 10.4)', () => {
    fc.assert(
      fc.property(
        arbModel(),
        fc.nat(),
        (model, idx) => {
          const modelA = structuredCloneJson(model);
          const modelB = structuredCloneJson(modelA);
          const i = idx % modelB.kpiDefinitions.length;
          const def = modelA.kpiDefinitions[i];
          const from = def.target;
          const to = from === null ? 1234 : null;
          modelB.kpiDefinitions[i].target = to;

          const diff = compareVersions(makeVersion(modelA, 'a', 'c1'), makeVersion(modelB, 'b', 'c2'));

          expect(diff.addedMetrics).toHaveLength(0);
          expect(diff.removedMetrics).toHaveLength(0);
          expect(diff.changedMetrics).toHaveLength(0);
          expect(diff.otherChanges).toBe(false);
          expect(diff.targetChanges).toHaveLength(1);
          expect(diff.targetChanges[0]).toEqual({ kpi: def.name, from, to });
          expect(isEmptyDiff(diff)).toBe(false);
        }
      ),
      RUNS
    );
  });

  it('Property 25d: adding/removing a metric is reported exactly (Req 10.4)', () => {
    fc.assert(
      fc.property(
        arbModel(),
        fc.nat(),
        (model, idx) => {
          const modelWithout = structuredCloneJson(model);
          const i = idx % modelWithout.metrics.length;
          const [removed] = modelWithout.metrics.splice(i, 1);
          const identity = { team: removed.team, kpi: removed.kpi, periodKey: removed.period.key };

          // A -> B (B is missing the metric): reported as removed.
          const removedDiff = compareVersions(
            makeVersion(model, 'a', 'c1'),
            makeVersion(modelWithout, 'b', 'c2')
          );
          expect(removedDiff.addedMetrics).toHaveLength(0);
          expect(removedDiff.changedMetrics).toHaveLength(0);
          expect(removedDiff.targetChanges).toHaveLength(0);
          expect(removedDiff.otherChanges).toBe(false);
          expect(removedDiff.removedMetrics).toHaveLength(1);
          expect(removedDiff.removedMetrics[0]).toEqual(identity);

          // B -> A (A has the extra metric): reported as added.
          const addedDiff = compareVersions(
            makeVersion(modelWithout, 'b', 'c2'),
            makeVersion(model, 'a', 'c1')
          );
          expect(addedDiff.removedMetrics).toHaveLength(0);
          expect(addedDiff.changedMetrics).toHaveLength(0);
          expect(addedDiff.targetChanges).toHaveLength(0);
          expect(addedDiff.otherChanges).toBe(false);
          expect(addedDiff.addedMetrics).toHaveLength(1);
          expect(addedDiff.addedMetrics[0]).toEqual(identity);
        }
      ),
      RUNS
    );
  });

  it('Property 25e: isEmptyDiff(compareVersions(a,b)) iff models are deeply equal (Req 10.4)', () => {
    fc.assert(
      fc.property(arbModel(), fc.boolean(), (model, mutate) => {
        const modelB = structuredCloneJson(model);
        if (mutate) {
          // Apply a guaranteed JSON-visible change.
          const m = modelB.metrics[0];
          m.value = m.value === null ? 99999 : null;
        }
        const diff = compareVersions(makeVersion(model, 'a', 'c1'), makeVersion(modelB, 'b', 'c2'));
        // JSON string equality is a valid deep-equal oracle here because modelB
        // is a structural clone of model, so key ordering matches.
        const modelsEqual = JSON.stringify(model) === JSON.stringify(modelB);
        expect(isEmptyDiff(diff)).toBe(modelsEqual);
      }),
      RUNS
    );
  });

  // Feature: leadership-data-management, Property 26: Save failure preserves in-memory state — when the adapter's write throws, save returns { ok: false, error } without throwing and leaves the caller's in-memory state object unchanged.
  it('Property 26: save failure returns an error and preserves in-memory state (Req 10.6)', () => {
    fc.assert(
      fc.property(arbPersistedState, (state) => {
        const service = createPersistenceService(new FailingAdapter());
        // JSON snapshot as the immutability oracle (round-trip semantics).
        const jsonBefore = JSON.stringify(state);

        let result: { ok: true } | { ok: false; error: string };
        expect(() => {
          result = service.save(state);
        }).not.toThrow();

        // Save reports failure with a non-empty error string.
        expect(result!.ok).toBe(false);
        if (result!.ok === false) {
          expect(typeof result!.error).toBe('string');
          expect(result!.error.length).toBeGreaterThan(0);
        }

        // The caller's in-memory state is untouched.
        expect(JSON.stringify(state)).toBe(jsonBefore);
      }),
      RUNS
    );
  });
});
