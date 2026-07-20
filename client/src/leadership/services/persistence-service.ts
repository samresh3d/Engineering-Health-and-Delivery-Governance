/**
 * PersistenceService — client-side durable store for the Leadership Data
 * Management feature.
 *
 * The module has no backend, network API, or database (Req 11.2), so all
 * durability is client-side. This service serializes the full working set
 * (`PersistedState` = model + audit trail + versions + approval flag + current
 * user) to browser storage under a single namespaced, versioned key and reads
 * it back on load. It also provides version snapshotting, a pure structural
 * diff between two versions, and a version-restore helper.
 *
 * Design notes:
 *  - Storage I/O is abstracted behind a small {@link StorageAdapter}. The
 *    default adapter wraps `window.localStorage`; an IndexedDB (or any other)
 *    adapter is a drop-in replacement. The adapter is fully guarded so it never
 *    throws when storage is unavailable (SSR, disabled cookies, quota) — errors
 *    are surfaced through the service's `save` result instead.
 *  - The service degrades gracefully to in-memory operation: a failed `save`
 *    returns `{ ok: false, error }` and leaves the caller's in-memory state
 *    untouched (Req 10.6). `load` returns `null` when nothing is stored or the
 *    stored value cannot be parsed.
 *  - All non-I/O logic is pure. `snapshotVersion` and `restoreVersion` return
 *    NEW `PersistedState` objects and never mutate their inputs.
 *
 * Requirements:
 *  - 10.1 auto-save the current model + audit trail to browser storage
 *  - 10.2 restore a previously saved model on load
 *  - 10.3 retain a Version snapshot per reporting cycle in the version store
 *  - 10.4 compare two versions and report their differences
 *  - 10.5 restore a selected version's snapshot as the current model
 *  - 10.6 report a save error and continue on the in-memory model on failure
 */

import type { DashboardModel } from '../model/types';
import type { AuditTrail, Version } from '../model/editing-types';

/**
 * Swappable storage backend. A synchronous implementation (like the default
 * `localStorage` adapter) allows the whole `save`/`load` flow to run
 * synchronously as required by {@link IPersistenceService}. Async adapters
 * (e.g. IndexedDB) are supported by the return-type unions but are not used by
 * the default synchronous service instance.
 */
export interface StorageAdapter {
  read(key: string): string | null | Promise<string | null>;
  write(key: string, value: string): void | Promise<void>;
}

/** The complete working set persisted as a single record. */
export interface PersistedState {
  model: DashboardModel;
  auditTrail: AuditTrail;
  versions: Version[];
  approvalEnabled: boolean;
  currentUser: string | null;
}

/** Public contract of the persistence service (design §9). */
export interface IPersistenceService {
  save(state: PersistedState): { ok: true } | { ok: false; error: string };
  load(): PersistedState | null;
  snapshotVersion(state: PersistedState, cycle: string): PersistedState;
}

/** Identity of a single metric cell within a model. */
export interface MetricIdentity {
  team: string;
  kpi: string;
  periodKey: string;
}

/** A metric value that differs between two versions. */
export interface MetricValueChange extends MetricIdentity {
  from: number | null;
  to: number | null;
}

/** A KPI target that differs between two versions (targets are per-KPI). */
export interface TargetChange {
  kpi: string;
  from: number | null;
  to: number | null;
}

/**
 * Structural difference between two version snapshots.
 *
 * The categorized fields describe the edit-relevant differences (metric values
 * and KPI targets keyed by identity). `otherChanges` is a catch-all flag that
 * is set only when the two models differ in a way not captured by the
 * categorized fields (e.g. dimensions, source columns, or other KPI-definition
 * metadata). Together they guarantee that a diff is empty **iff** the two
 * models are deeply equal (Property 25).
 */
export interface VersionDiff {
  /** Metric cells present in `b` but not in `a`. */
  addedMetrics: MetricIdentity[];
  /** Metric cells present in `a` but not in `b`. */
  removedMetrics: MetricIdentity[];
  /** Metric cells present in both whose value changed. */
  changedMetrics: MetricValueChange[];
  /** KPI targets that were added, removed, or changed. */
  targetChanges: TargetChange[];
  /** True when models differ beyond the categorized fields above. */
  otherChanges: boolean;
}

/** Namespaced, version-suffixed storage key (design "Persistence schema"). */
export const STORAGE_KEY = 'leadership.dm.v1';

/**
 * A `StorageAdapter` over `window.localStorage`, guarded so construction and
 * every operation are safe even when `localStorage` is unavailable (SSR, quota,
 * privacy mode). `read` returns `null` and `write` throws on failure so the
 * service can surface the error via its `save` result.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private storage: Storage | null;

  constructor(storage?: Storage) {
    if (storage) {
      this.storage = storage;
      return;
    }
    // Resolve window.localStorage defensively: accessing it can throw in some
    // sandboxed/SSR environments, so wrap the lookup in a try/catch.
    try {
      this.storage =
        typeof globalThis !== 'undefined' &&
        (globalThis as { localStorage?: Storage }).localStorage
          ? (globalThis as { localStorage?: Storage }).localStorage ?? null
          : null;
    } catch {
      this.storage = null;
    }
  }

  read(key: string): string | null {
    if (!this.storage) return null;
    try {
      return this.storage.getItem(key);
    } catch {
      // A read failure is treated as "nothing stored" rather than an error.
      return null;
    }
  }

  write(key: string, value: string): void {
    if (!this.storage) {
      throw new Error('localStorage is unavailable');
    }
    // Let quota-exceeded and other write failures propagate; the service
    // converts them into an { ok: false } result (Req 10.6).
    this.storage.setItem(key, value);
  }
}

/**
 * Deep structural clone of plain data. The `DashboardModel` and its members are
 * JSON-serializable plain objects/arrays/primitives, so a JSON round-trip is a
 * correct and dependency-free structured clone.
 */
export function structuredCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Recursive deep-equality for plain JSON data (objects, arrays, primitives). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;

  if (aIsArray && bIsArray) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

/** Stable identity string for a metric cell. */
function metricKey(team: string, kpi: string, periodKey: string): string {
  return `${team}\u0000${kpi}\u0000${periodKey}`;
}

/** Monotonic counter for the id fallback when `crypto.randomUUID` is missing. */
let versionIdCounter = 0;

/** Generate a unique id for a {@link Version}. */
function generateVersionId(): string {
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  versionIdCounter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `ver-${Date.now().toString(36)}-${versionIdCounter.toString(36)}-${rand}`;
}

/**
 * Compute the differences between two version snapshots (Req 10.4).
 *
 * Reports added/removed/changed metric cells (keyed by team + kpi + period) and
 * added/removed/changed KPI targets (keyed by KPI name). The `otherChanges`
 * flag captures any remaining model differences so the returned diff is empty
 * exactly when the two snapshot models are deeply equal (Property 25).
 */
export function compareVersions(a: Version, b: Version): VersionDiff {
  const modelA = a.model;
  const modelB = b.model;

  const addedMetrics: MetricIdentity[] = [];
  const removedMetrics: MetricIdentity[] = [];
  const changedMetrics: MetricValueChange[] = [];

  const aMetricByKey = new Map<string, { identity: MetricIdentity; value: number | null }>();
  for (const m of modelA.metrics) {
    aMetricByKey.set(metricKey(m.team, m.kpi, m.period.key), {
      identity: { team: m.team, kpi: m.kpi, periodKey: m.period.key },
      value: m.value,
    });
  }

  const seenKeys = new Set<string>();
  for (const m of modelB.metrics) {
    const key = metricKey(m.team, m.kpi, m.period.key);
    seenKeys.add(key);
    const identity: MetricIdentity = { team: m.team, kpi: m.kpi, periodKey: m.period.key };
    const existing = aMetricByKey.get(key);
    if (!existing) {
      addedMetrics.push(identity);
    } else if (existing.value !== m.value) {
      changedMetrics.push({ ...identity, from: existing.value, to: m.value });
    }
  }
  for (const [key, entry] of aMetricByKey) {
    if (!seenKeys.has(key)) {
      removedMetrics.push(entry.identity);
    }
  }

  const targetChanges: TargetChange[] = [];
  const aTargetByKpi = new Map<string, number | null>();
  for (const def of modelA.kpiDefinitions) {
    aTargetByKpi.set(def.name, def.target);
  }
  const seenKpis = new Set<string>();
  for (const def of modelB.kpiDefinitions) {
    seenKpis.add(def.name);
    if (!aTargetByKpi.has(def.name)) {
      // KPI added in b; report its target as a change from null.
      if (def.target !== null) {
        targetChanges.push({ kpi: def.name, from: null, to: def.target });
      }
    } else {
      const from = aTargetByKpi.get(def.name) ?? null;
      if (from !== def.target) {
        targetChanges.push({ kpi: def.name, from, to: def.target });
      }
    }
  }
  for (const [name, target] of aTargetByKpi) {
    if (!seenKpis.has(name) && target !== null) {
      // KPI removed in b; report its target as a change to null.
      targetChanges.push({ kpi: name, from: target, to: null });
    }
  }

  const categorizedEmpty =
    addedMetrics.length === 0 &&
    removedMetrics.length === 0 &&
    changedMetrics.length === 0 &&
    targetChanges.length === 0;

  // Flag any residual model differences (dimensions, sourceColumns, other
  // KpiDefinition metadata) not captured above, but only when the categorized
  // diffs found nothing — so `otherChanges` is set precisely when the models
  // differ yet the categorized fields are empty. This keeps the diff empty iff
  // the models are deeply equal without double-counting caught differences.
  const otherChanges = categorizedEmpty && !deepEqual(modelA, modelB);

  return { addedMetrics, removedMetrics, changedMetrics, targetChanges, otherChanges };
}

/** Whether a {@link VersionDiff} reports no differences at all. */
export function isEmptyDiff(diff: VersionDiff): boolean {
  return (
    diff.addedMetrics.length === 0 &&
    diff.removedMetrics.length === 0 &&
    diff.changedMetrics.length === 0 &&
    diff.targetChanges.length === 0 &&
    !diff.otherChanges
  );
}

/**
 * Return a NEW {@link PersistedState} whose current model is replaced by the
 * snapshot of the version identified by `versionId` (Req 10.5). A structured
 * clone of the version's model is used so later edits cannot mutate the stored
 * snapshot. If no matching version exists, the original `state` is returned
 * unchanged.
 */
export function restoreVersion(state: PersistedState, versionId: string): PersistedState {
  const version = state.versions.find((v) => v.id === versionId);
  if (!version) return state;
  return {
    ...state,
    model: structuredCloneJson(version.model),
  };
}

/**
 * Create a {@link PersistenceService} bound to a specific {@link StorageAdapter}.
 * Useful for tests (in-memory adapter) and for swapping in an IndexedDB adapter.
 */
export function createPersistenceService(
  adapter: StorageAdapter = new LocalStorageAdapter(),
  key: string = STORAGE_KEY,
): IPersistenceService {
  return {
    save(state: PersistedState): { ok: true } | { ok: false; error: string } {
      try {
        const serialized = JSON.stringify(state);
        const result = adapter.write(key, serialized);
        // Defensive handling of async adapters: the default adapter is
        // synchronous, but if a Promise is returned we cannot honor the
        // synchronous contract, so surface a clear error instead of silently
        // succeeding before the write resolves.
        if (result && typeof (result as Promise<void>).then === 'function') {
          (result as Promise<void>).catch(() => {
            /* swallow: async write errors cannot be surfaced synchronously */
          });
          return {
            ok: false,
            error: 'Asynchronous storage adapter is not supported by synchronous save',
          };
        }
        return { ok: true };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { ok: false, error };
      }
    },

    load(): PersistedState | null {
      let raw: string | null | Promise<string | null>;
      try {
        raw = adapter.read(key);
      } catch {
        return null;
      }
      // Async adapters are unsupported by the synchronous contract.
      if (raw && typeof (raw as Promise<string | null>).then === 'function') {
        return null;
      }
      if (raw === null || raw === undefined) return null;
      try {
        return JSON.parse(raw as string) as PersistedState;
      } catch {
        // Corrupt/unparseable payload behaves like "nothing stored" (Req 10.2).
        return null;
      }
    },

    snapshotVersion(state: PersistedState, cycle: string): PersistedState {
      // Immutable: build a NEW version with a cloned model snapshot and append
      // it to a NEW versions array, leaving `state` untouched (Req 10.3).
      const version: Version = {
        id: generateVersionId(),
        cycle,
        createdAt: new Date().toISOString(),
        model: structuredCloneJson(state.model),
      };
      return {
        ...state,
        versions: [...state.versions, version],
      };
    },
  };
}

/** Default service instance backed by a synchronous localStorage adapter. */
export const persistenceService: IPersistenceService = createPersistenceService();

export default persistenceService;
