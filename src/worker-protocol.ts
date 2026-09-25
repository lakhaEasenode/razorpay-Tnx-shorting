import type { DateRange, RowError } from './processing/pipeline';

export type WorkerRequest =
  | { type: 'process'; file: File }
  /** Counts for a date range (inclusive yyyy-MM-dd keys). */
  | { type: 'summarize'; range: DateRange }
  /** CSV for one file, limited to a date range. */
  | { type: 'export'; fileId: string; range: DateRange };

export interface FileInfo {
  id: string;
  label: string;
  configured: boolean;
  fileName: string;
}

export type WorkerMessage =
  | { type: 'progress'; percent: number }
  | { type: 'invalid'; missing: string[]; duplicates: string[] }
  | { type: 'failed'; message: string }
  | {
      type: 'done';
      totalRows: number;
      processedRows: number;
      dateRange: DateRange | null;
      /** First 200 errors; the full list is in the error report download. */
      errors: RowError[];
      errorCount: number;
      files: FileInfo[];
    }
  | {
      type: 'summary';
      range: DateRange;
      journalLines: number;
      byCategory: Record<string, number>;
      /** Rows per file id within the range. */
      fileRows: Record<string, number>;
    }
  | { type: 'export'; fileId: string; csv: string };

/** Review files that exist alongside the four outputs. */
export const UNASSIGNED_ID = 'unassigned';
export const ERRORS_ID = 'errors';
