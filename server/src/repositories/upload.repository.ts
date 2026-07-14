import type Database from 'better-sqlite3';
import type { IUploadRepository } from '../services/upload.service';
import { getDatabase } from '../database/connection';

/**
 * Repository for managing upload records in the uploads table.
 * Handles creation and status updates for file upload tracking.
 */
export class UploadRepository implements IUploadRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
  }

  async createUploadRecord(record: {
    id: string;
    fileName: string;
    uploadedBy: string;
    rowsIngested: number;
    status: 'processing' | 'success' | 'failed';
    errorMessage: string | null;
  }): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT INTO uploads (id, file_name, uploaded_by, rows_ingested, status, error_message, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    stmt.run(
      record.id,
      record.fileName,
      record.uploadedBy,
      record.rowsIngested,
      record.status,
      record.errorMessage
    );
  }

  async updateUploadStatus(
    id: string,
    status: 'processing' | 'success' | 'failed',
    rowsIngested?: number,
    errorMessage?: string | null
  ): Promise<void> {
    if (rowsIngested !== undefined && errorMessage !== undefined) {
      const stmt = this.db.prepare(
        `UPDATE uploads SET status = ?, rows_ingested = ?, error_message = ? WHERE id = ?`
      );
      stmt.run(status, rowsIngested, errorMessage, id);
    } else if (rowsIngested !== undefined) {
      const stmt = this.db.prepare(
        `UPDATE uploads SET status = ?, rows_ingested = ? WHERE id = ?`
      );
      stmt.run(status, rowsIngested, id);
    } else if (errorMessage !== undefined) {
      const stmt = this.db.prepare(
        `UPDATE uploads SET status = ?, error_message = ? WHERE id = ?`
      );
      stmt.run(status, errorMessage, id);
    } else {
      const stmt = this.db.prepare(`UPDATE uploads SET status = ? WHERE id = ?`);
      stmt.run(status, id);
    }
  }
}
