/**
 * API request/response types for the Engineering Health & Delivery Governance Platform.
 */

/** Result returned from a successful file upload */
export interface UploadResult {
  success: boolean;
  rowsIngested: number;
  uploadId: string;
  timestamp: string;
}

/** A validation error reported during file upload processing */
export interface ValidationError {
  row?: number;
  field: string;
  message: string;
}
