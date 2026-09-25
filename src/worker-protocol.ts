import type { RowError } from './processing/pipeline';

export type WorkerRequest = { file: File };

export interface GeneratedFile {
  id: string;
  label: string;
  configured: boolean;
  fileName: string;
  rowCount: number;
  csv: string;
}

export type WorkerMessage =
  | { type: 'progress'; percent: number }
  | { type: 'invalid'; missing: string[]; duplicates: string[] }
  | { type: 'failed'; message: string }
  | {
      type: 'done';
      totalRows: number;
      processedRows: number;
      journalLines: number;
      errors: RowError[];
      files: GeneratedFile[];
      unassigned: GeneratedFile;
      errorReport: GeneratedFile;
    };
