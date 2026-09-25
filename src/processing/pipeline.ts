import { toCommonRow } from './common';
import { toJournalLines } from './journal';
import type { OutputRow, OutputSpec } from './outputs/types';
import type { SourceRow } from './schema';

export interface RowError {
  rowNumber: number;
  entityId: string;
  message: string;
}

export interface OutputResult {
  id: string;
  label: string;
  configured: boolean;
  fileName: string;
  columns: string[];
  rows: OutputRow[];
}

export interface ProcessingResult {
  totalRows: number;
  processedRows: number;
  journalLines: number;
  errors: RowError[];
  outputs: OutputResult[];
  /** Journal lines that no output file claimed, so nothing is dropped silently. */
  unassigned: OutputRow[];
}

export const UNASSIGNED_COLUMNS = [
  'row_number',
  'entity_id',
  'type',
  'line',
  'date',
  'debit',
  'credit',
  'ref',
  'desc',
];

/**
 * Streaming processor: feed rows one at a time with `addRow`, then call `finish`.
 * Row order is preserved in every output; a row's lines stay together in order.
 */
export function createProcessor(outputs: readonly OutputSpec[]) {
  const results: OutputResult[] = outputs.map((o) => ({
    id: o.id,
    label: o.label,
    configured: o.configured,
    fileName: o.fileName,
    columns: o.columns,
    rows: [],
  }));
  const unassigned: OutputRow[] = [];
  const errors: RowError[] = [];
  let totalRows = 0;
  let journalLines = 0;

  return {
    addRow(source: SourceRow, rowNumber: number, parseError?: string) {
      totalRows++;
      const entityId = source.entity_id ?? '';
      if (parseError) {
        errors.push({ rowNumber, entityId, message: parseError });
        return;
      }
      const journal = toJournalLines(toCommonRow(source, rowNumber));
      if (!journal.ok) {
        errors.push({ rowNumber, entityId, message: journal.error });
        return;
      }
      for (const line of journal.lines) {
        journalLines++;
        let claimed = false;
        outputs.forEach((spec, i) => {
          if (!spec.configured || !spec.includes(line)) return;
          results[i]!.rows.push(spec.toRow(line));
          claimed = true;
        });
        if (!claimed) {
          unassigned.push({
            row_number: String(rowNumber),
            entity_id: entityId,
            type: source.type ?? '',
            line: line.kind,
            date: line.date,
            debit: line.debit,
            credit: line.credit,
            ref: line.ref,
            desc: line.desc,
          });
        }
      }
    },

    finish(): ProcessingResult {
      return {
        totalRows,
        processedRows: totalRows - errors.length,
        journalLines,
        errors,
        outputs: results,
        unassigned,
      };
    },
  };
}
