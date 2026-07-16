import type Database from 'better-sqlite3';
import type { DropdownOption } from '../types/hierarchy.types.js';
import { getDatabase } from '../database/connection.js';

/** Valid field names for dropdown configuration */
export type DropdownFieldName = 'production_status' | 'story_status' | 'delay_reason';

/** Allowed field names to prevent SQL injection */
const VALID_FIELD_NAMES: readonly DropdownFieldName[] = [
  'production_status',
  'story_status',
  'delay_reason',
] as const;

/** Maximum number of options per dropdown field */
const MAX_OPTIONS_PER_FIELD = 50;

/** Maximum character length for a single option value */
const MAX_OPTION_LENGTH = 100;

/**
 * Maps a database row (snake_case) to a DropdownOption (camelCase).
 */
function mapRowToDropdownOption(row: Record<string, unknown>): DropdownOption {
  return {
    id: row.id as number,
    fieldName: row.field_name as DropdownOption['fieldName'],
    optionValue: row.option_value as string,
    sortOrder: row.sort_order as number,
  };
}

/**
 * Validates that a field name is one of the allowed dropdown fields.
 * @throws Error if fieldName is invalid
 */
function validateFieldName(fieldName: string): asserts fieldName is DropdownFieldName {
  if (!VALID_FIELD_NAMES.includes(fieldName as DropdownFieldName)) {
    throw new Error(
      `Invalid field name: "${fieldName}". Must be one of: ${VALID_FIELD_NAMES.join(', ')}`
    );
  }
}

/**
 * Validates a single option value string.
 * @throws Error if value is invalid
 */
function validateOptionValue(value: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error('Option value must be a non-empty string');
  }
  if (value.length > MAX_OPTION_LENGTH) {
    throw new Error(
      `Option value exceeds maximum length of ${MAX_OPTION_LENGTH} characters`
    );
  }
}

/**
 * Repository for managing dropdown configuration options.
 * Handles CRUD operations on the dropdown_options table for
 * Production Status, Story Status, and Delay Reason fields.
 */
export class DropdownRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
  }

  /**
   * Get all options for a specific dropdown field, sorted by sort_order.
   * @param fieldName - The dropdown field identifier
   * @returns Sorted array of dropdown options
   */
  getOptionsByField(fieldName: string): DropdownOption[] {
    validateFieldName(fieldName);

    const stmt = this.db.prepare(
      'SELECT * FROM dropdown_options WHERE field_name = @fieldName ORDER BY sort_order ASC'
    );
    const rows = stmt.all({ fieldName }) as Record<string, unknown>[];
    return rows.map(mapRowToDropdownOption);
  }

  /**
   * Replace all options for a dropdown field with a new set of values.
   * Executes within a transaction: deletes existing options, then inserts new ones.
   * @param fieldName - The dropdown field identifier
   * @param values - Array of option value strings (1–50 items, each max 100 chars)
   * @throws Error if values array is empty, exceeds 50, or contains invalid entries
   */
  setOptions(fieldName: string, values: string[]): DropdownOption[] {
    validateFieldName(fieldName);

    if (!values || values.length === 0) {
      throw new Error('At least one option value is required');
    }
    if (values.length > MAX_OPTIONS_PER_FIELD) {
      throw new Error(
        `Cannot exceed ${MAX_OPTIONS_PER_FIELD} options per field. Received ${values.length}.`
      );
    }

    // Validate each value
    for (const value of values) {
      validateOptionValue(value);
    }

    // Check for duplicates (case-insensitive)
    const lowerSet = new Set<string>();
    for (const value of values) {
      const lower = value.trim().toLowerCase();
      if (lowerSet.has(lower)) {
        throw new Error(`Duplicate option value: "${value}"`);
      }
      lowerSet.add(lower);
    }

    const replaceAll = this.db.transaction(() => {
      // Delete existing options for this field
      this.db.prepare(
        'DELETE FROM dropdown_options WHERE field_name = @fieldName'
      ).run({ fieldName });

      // Insert new options with sequential sort_order
      const insertStmt = this.db.prepare(
        'INSERT INTO dropdown_options (field_name, option_value, sort_order) VALUES (@fieldName, @optionValue, @sortOrder)'
      );

      for (let i = 0; i < values.length; i++) {
        insertStmt.run({
          fieldName,
          optionValue: values[i].trim(),
          sortOrder: i + 1,
        });
      }
    });

    replaceAll();

    // Return the newly inserted options
    return this.getOptionsByField(fieldName);
  }

  /**
   * Add a single option to a dropdown field at the end (highest sort_order + 1).
   * @param fieldName - The dropdown field identifier
   * @param value - The option value to add
   * @returns The newly created DropdownOption
   * @throws Error if max options exceeded or value already exists
   */
  addOption(fieldName: string, value: string): DropdownOption {
    validateFieldName(fieldName);
    validateOptionValue(value);

    // Check current count
    const countResult = this.db.prepare(
      'SELECT COUNT(*) as count FROM dropdown_options WHERE field_name = @fieldName'
    ).get({ fieldName }) as { count: number };

    if (countResult.count >= MAX_OPTIONS_PER_FIELD) {
      throw new Error(
        `Cannot add option: field "${fieldName}" already has the maximum of ${MAX_OPTIONS_PER_FIELD} options`
      );
    }

    // Get the current maximum sort_order
    const maxOrderResult = this.db.prepare(
      'SELECT MAX(sort_order) as maxOrder FROM dropdown_options WHERE field_name = @fieldName'
    ).get({ fieldName }) as { maxOrder: number | null };

    const nextOrder = (maxOrderResult.maxOrder ?? 0) + 1;

    const stmt = this.db.prepare(
      'INSERT INTO dropdown_options (field_name, option_value, sort_order) VALUES (@fieldName, @optionValue, @sortOrder)'
    );

    try {
      const result = stmt.run({
        fieldName,
        optionValue: value.trim(),
        sortOrder: nextOrder,
      });

      const insertedId = result.lastInsertRowid as number;
      const row = this.db.prepare(
        'SELECT * FROM dropdown_options WHERE id = @id'
      ).get({ id: insertedId }) as Record<string, unknown>;

      return mapRowToDropdownOption(row);
    } catch (error: unknown) {
      // Handle UNIQUE constraint violation
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new Error(
          `Option value "${value}" already exists for field "${fieldName}"`
        );
      }
      throw error;
    }
  }

  /**
   * Remove a single option from a dropdown field by its option value.
   * After removal, does NOT reorder remaining items (preserves gaps in sort_order).
   * @param fieldName - The dropdown field identifier
   * @param value - The exact option value to remove
   * @returns true if removed, false if not found
   * @throws Error if removal would leave 0 options (minimum 1 required)
   */
  removeOption(fieldName: string, value: string): boolean {
    validateFieldName(fieldName);

    // Check current count — must keep at least 1 option
    const countResult = this.db.prepare(
      'SELECT COUNT(*) as count FROM dropdown_options WHERE field_name = @fieldName'
    ).get({ fieldName }) as { count: number };

    if (countResult.count <= 1) {
      throw new Error(
        `Cannot remove option: field "${fieldName}" must retain at least 1 option`
      );
    }

    const result = this.db.prepare(
      'DELETE FROM dropdown_options WHERE field_name = @fieldName AND option_value = @value'
    ).run({ fieldName, value });

    return result.changes > 0;
  }

  /**
   * Reorder all options for a dropdown field based on the provided ordered list of option IDs.
   * The sort_order is assigned sequentially (1, 2, 3, ...) following the array order.
   * @param fieldName - The dropdown field identifier
   * @param orderedIds - Array of option IDs in the desired order
   * @returns Updated sorted array of DropdownOption
   * @throws Error if orderedIds don't match the existing set of IDs for the field
   */
  reorderOptions(fieldName: string, orderedIds: number[]): DropdownOption[] {
    validateFieldName(fieldName);

    // Get existing IDs for this field
    const existingRows = this.db.prepare(
      'SELECT id FROM dropdown_options WHERE field_name = @fieldName'
    ).all({ fieldName }) as Array<{ id: number }>;

    const existingIds = new Set(existingRows.map(r => r.id));

    // Validate that orderedIds matches existing IDs exactly
    if (orderedIds.length !== existingIds.size) {
      throw new Error(
        `Ordered IDs count (${orderedIds.length}) does not match existing options count (${existingIds.size}) for field "${fieldName}"`
      );
    }

    for (const id of orderedIds) {
      if (!existingIds.has(id)) {
        throw new Error(
          `Option ID ${id} does not belong to field "${fieldName}"`
        );
      }
    }

    // Check for duplicates in orderedIds
    const idSet = new Set(orderedIds);
    if (idSet.size !== orderedIds.length) {
      throw new Error('Ordered IDs contain duplicates');
    }

    const reorder = this.db.transaction(() => {
      const updateStmt = this.db.prepare(
        'UPDATE dropdown_options SET sort_order = @sortOrder WHERE id = @id'
      );

      for (let i = 0; i < orderedIds.length; i++) {
        updateStmt.run({ id: orderedIds[i], sortOrder: i + 1 });
      }
    });

    reorder();

    return this.getOptionsByField(fieldName);
  }

  /**
   * Get all dropdown options grouped by field name.
   * Useful for template generation where all dropdown configs are needed at once.
   * @returns Record mapping field names to their sorted options
   */
  getAllOptions(): Record<DropdownFieldName, DropdownOption[]> {
    const result: Record<DropdownFieldName, DropdownOption[]> = {
      production_status: [],
      story_status: [],
      delay_reason: [],
    };

    for (const fieldName of VALID_FIELD_NAMES) {
      result[fieldName] = this.getOptionsByField(fieldName);
    }

    return result;
  }
}
