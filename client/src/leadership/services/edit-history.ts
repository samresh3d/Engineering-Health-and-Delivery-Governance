/**
 * EditHistory — undo/redo snapshot stacks for the Leadership Data Management
 * feature.
 *
 * This service is a set of pure, total functions over plain data (no React,
 * DOM, network, or storage coupling), matching the style of the module's other
 * computation-core services (`health-classifier`, `approval-service`, ...).
 *
 * The history holds two stacks of immutable `DashboardModel` snapshots:
 *
 *  - `undo`: prior models, most-recent on top (end of the array). A new edit
 *    pushes the pre-edit ("prior") model here.
 *  - `redo`: models that were undone and can be reapplied.
 *
 * Semantics (Requirements 8.5, 8.6):
 *
 *  - {@link pushSnapshot} records a new edit: the `prior` model is pushed onto
 *    the undo stack and the redo stack is cleared, because a fresh edit
 *    invalidates any previously-undone operations.
 *  - {@link undo} pops the most recent undo snapshot to restore, and pushes the
 *    `current` model onto the redo stack (Requirement 8.5). When the undo stack
 *    is empty, the history is returned unchanged with `model: null`.
 *  - {@link redo} pops the most recent redo snapshot to restore, and pushes the
 *    `current` model onto the undo stack (Requirement 8.6). When the redo stack
 *    is empty, the history is returned unchanged with `model: null`.
 *
 * All operations return brand-new state and arrays; the input `EditHistoryState`
 * and its arrays are never mutated.
 */

import type { DashboardModel } from '../model/types';

/** Undo/redo snapshot stacks over immutable `DashboardModel` snapshots. */
export interface EditHistoryState {
  /** Prior models, most-recent last. Popped from the end on undo. */
  undo: DashboardModel[];
  /** Undone models, most-recent last. Popped from the end on redo. */
  redo: DashboardModel[];
}

/** The result of an undo/redo operation: the next history and the model to
 * restore (or `null` when there was nothing to undo/redo). */
export interface EditHistoryResult {
  history: EditHistoryState;
  model: DashboardModel | null;
}

/** Creates an empty history with no undo or redo snapshots. */
export function emptyHistory(): EditHistoryState {
  return { undo: [], redo: [] };
}

/**
 * Records a new edit by pushing the pre-edit `prior` model onto the undo stack
 * and clearing the redo stack (a new edit invalidates redo). Returns a new
 * `EditHistoryState` without mutating the input.
 */
export function pushSnapshot(
  history: EditHistoryState,
  prior: DashboardModel,
): EditHistoryState {
  return {
    undo: [...history.undo, prior],
    redo: [],
  };
}

/**
 * Reverts the most recent editing operation (Requirement 8.5). Pops the top of
 * the undo stack as the model to restore and pushes `current` onto the redo
 * stack. When the undo stack is empty the history is returned unchanged and the
 * restored model is `null`.
 */
export function undo(
  history: EditHistoryState,
  current: DashboardModel,
): EditHistoryResult {
  if (history.undo.length === 0) {
    return { history, model: null };
  }

  const model = history.undo[history.undo.length - 1];
  return {
    history: {
      undo: history.undo.slice(0, -1),
      redo: [...history.redo, current],
    },
    model,
  };
}

/**
 * Reapplies the most recently undone operation (Requirement 8.6). Pops the top
 * of the redo stack as the model to restore and pushes `current` onto the undo
 * stack. When the redo stack is empty the history is returned unchanged and the
 * restored model is `null`.
 */
export function redo(
  history: EditHistoryState,
  current: DashboardModel,
): EditHistoryResult {
  if (history.redo.length === 0) {
    return { history, model: null };
  }

  const model = history.redo[history.redo.length - 1];
  return {
    history: {
      undo: [...history.undo, current],
      redo: history.redo.slice(0, -1),
    },
    model,
  };
}
