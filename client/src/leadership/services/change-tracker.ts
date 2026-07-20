/**
 * ChangeTracker — pure construction and querying of the audit trail for the
 * Leadership Data Management feature.
 *
 * A `ChangeRecord` captures a single committed modification to a `Grid_Row`
 * cell (Target or Actual): its Previous Value, New Value, the Current_User who
 * made it (`updatedBy`), an ISO-8601 `timestamp`, and optional `comments`. The
 * `Audit_Trail` is an ordered (chronological) collection of these records.
 *
 * All functions here are pure with respect to the audit trail: `append` never
 * mutates the passed-in trail (it returns a new array), and `forRow` returns a
 * new array of matching records preserving insertion (chronological) order.
 *
 * Requirements:
 *  - 5.1 record Previous Value, New Value, Updated By, and Date & Time
 *  - 5.2 Updated By is the Current_User
 *  - 5.3 store Comments when provided (absent otherwise)
 *  - 5.4 add the Change_Record to the Audit_Trail
 *  - 5.6 make the Audit_Trail viewable for a selected Grid_Row
 */

import type { ChangeRecord, AuditTrail } from '../model/editing-types';

/** Input for constructing a {@link ChangeRecord} via {@link IChangeTracker.record}. */
export interface ChangeRecordInput {
  rowId: string;
  field: 'target' | 'actual';
  previousValue: number | string | null;
  newValue: number | string | null;
  updatedBy: string;
  /** ISO-8601 timestamp of the change. */
  timestamp: string;
  comments?: string;
}

/** Pure audit-trail construction and per-row retrieval. */
export interface IChangeTracker {
  /** Build a well-formed {@link ChangeRecord} with a generated unique id. */
  record(input: ChangeRecordInput): ChangeRecord;
  /** Return a NEW trail with `record` appended (never mutates `trail`). */
  append(trail: AuditTrail, record: ChangeRecord): AuditTrail;
  /** Return the records whose `rowId` matches, in chronological order. */
  forRow(trail: AuditTrail, rowId: string): ChangeRecord[];
}

/** Monotonic counter used by the id fallback when `crypto.randomUUID` is unavailable. */
let idCounter = 0;

/**
 * Generate a unique id for a change record.
 *
 * Prefers `crypto.randomUUID()` when available; otherwise falls back to a
 * timestamp + monotonic counter + random suffix so ids remain unique within a
 * session even without the Web Crypto API.
 */
function generateId(): string {
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `cr-${Date.now().toString(36)}-${idCounter.toString(36)}-${rand}`;
}

/**
 * ChangeTracker implementation.
 *
 * The `record` method only includes the `comments` field when a comment is
 * actually provided (Req 5.3 / Property 11), so a record with no comments has
 * no `comments` property at all rather than an `undefined` value.
 */
export const changeTracker: IChangeTracker = {
  record(input: ChangeRecordInput): ChangeRecord {
    const rec: ChangeRecord = {
      id: generateId(),
      rowId: input.rowId,
      field: input.field,
      previousValue: input.previousValue,
      newValue: input.newValue,
      updatedBy: input.updatedBy,
      timestamp: input.timestamp,
    };
    // Only attach comments when supplied (absent otherwise, per Req 5.3).
    if (input.comments !== undefined) {
      rec.comments = input.comments;
    }
    return rec;
  },

  append(trail: AuditTrail, record: ChangeRecord): AuditTrail {
    // Immutable append: return a new array, leaving `trail` untouched (Req 5.4).
    return [...trail, record];
  },

  forRow(trail: AuditTrail, rowId: string): ChangeRecord[] {
    // Records are appended in chronological order, so filtering preserves it (Req 5.6).
    return trail.filter((record) => record.rowId === rowId);
  },
};

export default changeTracker;
