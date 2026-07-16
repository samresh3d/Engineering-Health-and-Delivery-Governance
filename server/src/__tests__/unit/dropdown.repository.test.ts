import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DropdownRepository } from '../../repositories/dropdown.repository.js';

function createInMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE dropdown_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_name TEXT NOT NULL,
      option_value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(field_name, option_value)
    );
  `);

  return db;
}

function seedOptions(db: Database.Database): void {
  const stmt = db.prepare(
    'INSERT INTO dropdown_options (field_name, option_value, sort_order) VALUES (?, ?, ?)'
  );

  // Production Status options
  stmt.run('production_status', 'Deployed to Production', 1);
  stmt.run('production_status', 'In Progress', 2);
  stmt.run('production_status', 'Ready for Production', 3);

  // Story Status options
  stmt.run('story_status', 'Completed', 1);
  stmt.run('story_status', 'In Progress', 2);
  stmt.run('story_status', 'Not Started', 3);

  // Delay Reason options
  stmt.run('delay_reason', 'Dependency on other team', 1);
  stmt.run('delay_reason', 'Resource unavailability', 2);
}

describe('DropdownRepository', () => {
  let db: Database.Database;
  let repo: DropdownRepository;

  beforeEach(() => {
    db = createInMemoryDb();
    repo = new DropdownRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getOptionsByField', () => {
    it('should return options sorted by sort_order', () => {
      seedOptions(db);

      const options = repo.getOptionsByField('production_status');
      expect(options).toHaveLength(3);
      expect(options[0].optionValue).toBe('Deployed to Production');
      expect(options[0].sortOrder).toBe(1);
      expect(options[1].optionValue).toBe('In Progress');
      expect(options[1].sortOrder).toBe(2);
      expect(options[2].optionValue).toBe('Ready for Production');
      expect(options[2].sortOrder).toBe(3);
    });

    it('should return empty array for field with no options', () => {
      const options = repo.getOptionsByField('production_status');
      expect(options).toHaveLength(0);
    });

    it('should throw for invalid field name', () => {
      expect(() => repo.getOptionsByField('invalid_field')).toThrow(
        'Invalid field name: "invalid_field"'
      );
    });

    it('should map row fields correctly', () => {
      seedOptions(db);

      const options = repo.getOptionsByField('story_status');
      const first = options[0];
      expect(first.id).toBeDefined();
      expect(first.fieldName).toBe('story_status');
      expect(first.optionValue).toBe('Completed');
      expect(first.sortOrder).toBe(1);
    });
  });

  describe('setOptions', () => {
    it('should replace all options for a field', () => {
      seedOptions(db);

      const newValues = ['Option A', 'Option B', 'Option C'];
      const result = repo.setOptions('production_status', newValues);

      expect(result).toHaveLength(3);
      expect(result[0].optionValue).toBe('Option A');
      expect(result[0].sortOrder).toBe(1);
      expect(result[1].optionValue).toBe('Option B');
      expect(result[1].sortOrder).toBe(2);
      expect(result[2].optionValue).toBe('Option C');
      expect(result[2].sortOrder).toBe(3);
    });

    it('should not affect options of other fields', () => {
      seedOptions(db);

      repo.setOptions('production_status', ['New Value']);

      const storyOptions = repo.getOptionsByField('story_status');
      expect(storyOptions).toHaveLength(3);
    });

    it('should throw for empty values array', () => {
      expect(() => repo.setOptions('production_status', [])).toThrow(
        'At least one option value is required'
      );
    });

    it('should throw when exceeding 50 options', () => {
      const tooMany = Array.from({ length: 51 }, (_, i) => `Option ${i + 1}`);
      expect(() => repo.setOptions('production_status', tooMany)).toThrow(
        'Cannot exceed 50 options per field'
      );
    });

    it('should throw for option value exceeding 100 characters', () => {
      const longValue = 'x'.repeat(101);
      expect(() => repo.setOptions('production_status', [longValue])).toThrow(
        'exceeds maximum length of 100 characters'
      );
    });

    it('should throw for empty string option value', () => {
      expect(() => repo.setOptions('production_status', ['Valid', ''])).toThrow(
        'Option value must be a non-empty string'
      );
    });

    it('should throw for duplicate values (case-insensitive)', () => {
      expect(() =>
        repo.setOptions('production_status', ['In Progress', 'in progress'])
      ).toThrow('Duplicate option value');
    });

    it('should trim whitespace from option values', () => {
      const result = repo.setOptions('production_status', ['  Trimmed Value  ']);
      expect(result[0].optionValue).toBe('Trimmed Value');
    });

    it('should allow exactly 50 options', () => {
      const fiftyOptions = Array.from({ length: 50 }, (_, i) => `Option ${i + 1}`);
      const result = repo.setOptions('production_status', fiftyOptions);
      expect(result).toHaveLength(50);
    });

    it('should throw for invalid field name', () => {
      expect(() => repo.setOptions('bad_field', ['Value'])).toThrow(
        'Invalid field name'
      );
    });
  });

  describe('addOption', () => {
    it('should add a new option at the end', () => {
      seedOptions(db);

      const added = repo.addOption('production_status', 'New Status');
      expect(added.optionValue).toBe('New Status');
      expect(added.sortOrder).toBe(4); // After existing 3

      const all = repo.getOptionsByField('production_status');
      expect(all).toHaveLength(4);
      expect(all[3].optionValue).toBe('New Status');
    });

    it('should add first option with sort_order 1', () => {
      const added = repo.addOption('production_status', 'First Option');
      expect(added.optionValue).toBe('First Option');
      expect(added.sortOrder).toBe(1);
    });

    it('should throw when adding duplicate value', () => {
      seedOptions(db);

      expect(() => repo.addOption('production_status', 'In Progress')).toThrow(
        'already exists for field "production_status"'
      );
    });

    it('should throw when field already has 50 options', () => {
      // Insert 50 options directly
      const stmt = db.prepare(
        'INSERT INTO dropdown_options (field_name, option_value, sort_order) VALUES (?, ?, ?)'
      );
      for (let i = 1; i <= 50; i++) {
        stmt.run('production_status', `Option ${i}`, i);
      }

      expect(() => repo.addOption('production_status', 'Option 51')).toThrow(
        'already has the maximum of 50 options'
      );
    });

    it('should throw for empty option value', () => {
      expect(() => repo.addOption('production_status', '')).toThrow(
        'Option value must be a non-empty string'
      );
    });

    it('should throw for option exceeding 100 characters', () => {
      expect(() => repo.addOption('production_status', 'a'.repeat(101))).toThrow(
        'exceeds maximum length of 100 characters'
      );
    });

    it('should trim whitespace from added value', () => {
      const added = repo.addOption('production_status', '  Padded  ');
      expect(added.optionValue).toBe('Padded');
    });

    it('should throw for invalid field name', () => {
      expect(() => repo.addOption('invalid', 'Value')).toThrow(
        'Invalid field name'
      );
    });
  });

  describe('removeOption', () => {
    it('should remove an existing option by value', () => {
      seedOptions(db);

      const removed = repo.removeOption('production_status', 'In Progress');
      expect(removed).toBe(true);

      const remaining = repo.getOptionsByField('production_status');
      expect(remaining).toHaveLength(2);
      expect(remaining.map(o => o.optionValue)).not.toContain('In Progress');
    });

    it('should return false for non-existing value', () => {
      seedOptions(db);

      const removed = repo.removeOption('production_status', 'Does Not Exist');
      expect(removed).toBe(false);
    });

    it('should throw when removing would leave zero options', () => {
      // Add a single option
      db.prepare(
        'INSERT INTO dropdown_options (field_name, option_value, sort_order) VALUES (?, ?, ?)'
      ).run('production_status', 'Only Option', 1);

      expect(() => repo.removeOption('production_status', 'Only Option')).toThrow(
        'must retain at least 1 option'
      );
    });

    it('should not affect options of other fields', () => {
      seedOptions(db);

      repo.removeOption('production_status', 'In Progress');

      const storyOptions = repo.getOptionsByField('story_status');
      expect(storyOptions).toHaveLength(3);
    });

    it('should throw for invalid field name', () => {
      expect(() => repo.removeOption('invalid', 'Value')).toThrow(
        'Invalid field name'
      );
    });
  });

  describe('reorderOptions', () => {
    it('should reorder options by provided ID sequence', () => {
      seedOptions(db);

      const options = repo.getOptionsByField('production_status');
      // Reverse the order
      const reversedIds = options.map(o => o.id).reverse();

      const reordered = repo.reorderOptions('production_status', reversedIds);
      expect(reordered[0].optionValue).toBe('Ready for Production');
      expect(reordered[0].sortOrder).toBe(1);
      expect(reordered[1].optionValue).toBe('In Progress');
      expect(reordered[1].sortOrder).toBe(2);
      expect(reordered[2].optionValue).toBe('Deployed to Production');
      expect(reordered[2].sortOrder).toBe(3);
    });

    it('should throw when orderedIds count does not match existing', () => {
      seedOptions(db);

      const options = repo.getOptionsByField('production_status');
      const partialIds = [options[0].id, options[1].id];

      expect(() => repo.reorderOptions('production_status', partialIds)).toThrow(
        'does not match existing options count'
      );
    });

    it('should throw when an ID does not belong to the field', () => {
      seedOptions(db);

      const prodOptions = repo.getOptionsByField('production_status');
      const storyOptions = repo.getOptionsByField('story_status');

      // Mix IDs from different fields
      const mixedIds = [prodOptions[0].id, prodOptions[1].id, storyOptions[0].id];

      expect(() => repo.reorderOptions('production_status', mixedIds)).toThrow(
        'does not belong to field'
      );
    });

    it('should throw when orderedIds contain duplicates', () => {
      seedOptions(db);

      const options = repo.getOptionsByField('production_status');
      const duplicatedIds = [options[0].id, options[0].id, options[1].id];

      expect(() => repo.reorderOptions('production_status', duplicatedIds)).toThrow(
        'contain duplicates'
      );
    });

    it('should throw for invalid field name', () => {
      expect(() => repo.reorderOptions('invalid', [1, 2])).toThrow(
        'Invalid field name'
      );
    });
  });

  describe('getAllOptions', () => {
    it('should return all options grouped by field name', () => {
      seedOptions(db);

      const all = repo.getAllOptions();
      expect(all.production_status).toHaveLength(3);
      expect(all.story_status).toHaveLength(3);
      expect(all.delay_reason).toHaveLength(2);
    });

    it('should return empty arrays when no options exist', () => {
      const all = repo.getAllOptions();
      expect(all.production_status).toHaveLength(0);
      expect(all.story_status).toHaveLength(0);
      expect(all.delay_reason).toHaveLength(0);
    });

    it('should return options sorted by sort_order within each field', () => {
      seedOptions(db);

      const all = repo.getAllOptions();
      expect(all.production_status[0].sortOrder).toBeLessThan(
        all.production_status[1].sortOrder
      );
    });
  });
});
