/**
 * Domain types for the Function → Team → Story organizational hierarchy.
 * Supports the Excel template, upload validation, and admin CRUD operations.
 */

import type { SprintDataRow } from './index';

/** A Function entity from the Function_Registry */
export interface FunctionRecord {
  id: number;
  name: string;
  createdAt: string;
}

/** A Team entity from the Team_Registry, associated with a parent Function */
export interface TeamRecord {
  id: number;
  name: string;
  functionId: number;
  createdAt: string;
}

/** A configurable dropdown option for template fields */
export interface DropdownOption {
  id: number;
  fieldName: 'production_status' | 'story_status' | 'delay_reason';
  optionValue: string;
  sortOrder: number;
}

/** Extended SprintDataRow with additional fields from the revised 29-column template */
export interface SprintDataRowExtended extends SprintDataRow {
  functionName: string;
  storyName: string | null;
  actualEffort: number | null;
  definitionOfReady: 'Y' | 'N' | null;
  definitionOfDone: 'Y' | 'N' | null;
  refinementClosureDate: string | number | null;
  uatStartDate: string | number | null;
  uatCompleteDate: string | number | null;
  delayReason: string | null;
  delayReasonDescription: string | null;
}
