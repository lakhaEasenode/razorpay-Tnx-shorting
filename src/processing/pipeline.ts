import { toCommonRow } from './common';
import { toJournalLines, type JournalLine } from './journal';
import type { OutputRow, OutputSpec } from './outputs/types';
import type { SourceRow } from './schema';

export interface RowError {
  rowNumber: number;
  entityId: string;
  message: string;
}

/** An output row tagged with its journal line's date, so it can be filtered by range. */
export interface DatedRow {
  /** yyyy-MM-dd; compares correctly as a string. */
  dateKey: string;
  row: OutputRow;
}

export interface OutputResult {
  id: string;
  label: string;
  configured: boolean;
  fileName: string;
  columns: string[];
  rows: DatedRow[];
}

/** Inclusive range of yyyy-MM-dd keys. */
export interface DateRange {
  from: string;
  to: string;
}

/** What a journal line is counted as: payment, fee, or the source type (settlement, refund, ...). */
export interface LineTag {
  dateKey: string;
  category: string;
}

export interface ProcessingResult {
  totalRows: number;
  processedRows: number;
  /** One entry per journal line, in order. */
  lines: LineTag[];
  /** Earliest and latest line date; null when no row produced a journal line. */
  dateRange: DateRange | null;
  errors: RowError[];
  outputs: OutputResult[];
  /** Journal lines that no output file claimed, so nothing is dropped silently. */
  unassigned: DatedRow[];
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

/** dd-MM-yyyy → yyyy-MM-dd */
export const toDateKey = (date: string) => `${date.slice(6)}-${date.slice(3, 5)}-${date.slice(0, 2)}`;

/** yyyy-MM-dd → dd-MM-yyyy */
export const fromDateKey = (key: string) => `${key.slice(8)}-${key.slice(5, 7)}-${key.slice(0, 4)}`;

function categoryOf(line: JournalLine): string {
  if (line.kind === 'payment' || line.kind === 'fee') return line.kind;
  return line.source.type?.trim() ?? '';
}

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
  const unassigned: DatedRow[] = [];
  const errors: RowError[] = [];
  const lines: LineTag[] = [];
  let dateRange: DateRange | null = null;
  let totalRows = 0;

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
        const dateKey = toDateKey(line.date);
        lines.push({ dateKey, category: categoryOf(line) });
        if (!dateRange) dateRange = { from: dateKey, to: dateKey };
        else if (dateKey < dateRange.from) dateRange.from = dateKey;
        else if (dateKey > dateRange.to) dateRange.to = dateKey;

        let claimed = false;
        outputs.forEach((spec, i) => {
          if (!spec.configured || !spec.includes(line)) return;
          results[i]!.rows.push({ dateKey, row: spec.toRow(line) });
          claimed = true;
        });
        if (!claimed) {
          unassigned.push({
            dateKey,
            row: {
              row_number: String(rowNumber),
              entity_id: entityId,
              type: source.type ?? '',
              line: line.kind,
              date: line.date,
              debit: line.debit,
              credit: line.credit,
              ref: line.ref,
              desc: line.desc,
            },
          });
        }
      }
    },

    finish(): ProcessingResult {
      return {
        totalRows,
        processedRows: totalRows - errors.length,
        lines,
        dateRange,
        errors,
        outputs: results,
        unassigned,
      };
    },
  };
}
