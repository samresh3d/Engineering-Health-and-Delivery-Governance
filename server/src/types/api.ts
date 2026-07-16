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

/** Response returned when an upload contains unregistered team names (HTTP 409) */
export interface NewTeamConfirmationResponse {
  requiresConfirmation: true;
  newTeams: string[];
  pendingUploadId: string;
  message: string;
}

/** Request body for confirming or declining a pending upload */
export interface ConfirmUploadRequest {
  pendingUploadId: string;
  confirmed: boolean;
}

/** Response returned after confirming a pending upload */
export interface ConfirmUploadResponse {
  success: true;
  rowsIngested: number;
  uploadId: string;
  timestamp: string;
  teamsCreated: string[];
}

/** Response returned after declining a pending upload */
export interface DeclineUploadResponse {
  success: true;
  cancelled: true;
}
