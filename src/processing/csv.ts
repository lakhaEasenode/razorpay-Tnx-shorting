import Papa from 'papaparse';
import type { OutputRow } from './outputs/types';

/** Serialize rows with a fixed column order. Values are written exactly as given. */
export function toCsv(columns: string[], rows: OutputRow[]): string {
  return Papa.unparse({ fields: columns, data: rows.map((r) => columns.map((c) => r[c] ?? '')) });
}
