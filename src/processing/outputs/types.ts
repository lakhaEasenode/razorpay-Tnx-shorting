import type { JournalLine } from '../journal';

export type OutputRow = Record<string, string>;

/**
 * Definition of one generated CSV file. Each file lives in its own module so its
 * rules can change independently of the others.
 */
export interface OutputSpec {
  id: string;
  /** Shown in the UI until a real file name is defined. */
  label: string;
  /** False until the specification for this file has been provided and implemented. */
  configured: boolean;
  fileName: string;
  /** Output headers, in order. */
  columns: string[];
  /** Whether this journal line belongs in this file. */
  includes(line: JournalLine): boolean;
  /** Build the output row; keys must match `columns`. */
  toRow(line: JournalLine): OutputRow;
}

/** An output whose specification has not been provided yet: it accepts no rows. */
export function pendingOutput(n: number): OutputSpec {
  return {
    id: `output${n}`,
    label: `Output file ${n}`,
    configured: false,
    fileName: `output_${n}.csv`,
    columns: [],
    includes: () => false,
    toRow: () => ({}),
  };
}
