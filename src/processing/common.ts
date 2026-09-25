import type { SourceRow } from './schema';

/**
 * Fields shared by every output file, derived from one source row.
 * The original row is kept alongside so output modules can use any source column
 * and every output row stays traceable to its input row.
 */
export interface CommonRow {
  /** 1-based data row number in the uploaded file (header excluded). */
  rowNumber: number;
  source: SourceRow;
  ref: string;
  desc: string;
  debit: string;
  credit: string;
  /** created_at as dd-MM-yyyy; null when created_at is not a valid date. */
  date: string | null;
}

/** Source columns combined into `desc`, in this order. */
export const DESC_COLUMNS = [
  'description',
  'notes',
  'order_id',
  'order_receipt',
  'additional_utr',
] as const;

export const DESC_SEPARATOR = ' | ';

/** Placeholder strings that must never appear in `desc`; treated the same as a blank field. */
const NULL_LIKE = new Set(['undefined', 'null', 'nan']);

function isBlank(value: string | undefined): boolean {
  if (value === undefined) return true;
  const trimmed = value.trim();
  return trimmed === '' || NULL_LIKE.has(trimmed.toLowerCase());
}

export function buildDesc(row: SourceRow): string {
  return DESC_COLUMNS.map((col) => row[col])
    .filter((v): v is string => !isBlank(v))
    .map((v) => v.trim())
    .join(DESC_SEPARATOR);
}

/** Razorpay's created_at: dd/MM/yyyy, optionally followed by HH:mm or HH:mm:ss. */
const CREATED_AT = /^(\d{2})\/(\d{2})\/(\d{4})(?: \d{2}:\d{2}(?::\d{2})?)?$/;

/**
 * Reformat created_at to dd-MM-yyyy. This is a text reformat of the calendar date
 * Razorpay reports, so no timezone conversion can shift the day. Time is dropped.
 */
export function formatDate(createdAt: string | undefined): string | null {
  const m = CREATED_AT.exec(createdAt?.trim() ?? '');
  if (!m) return null;
  const [, dd, mm, yyyy] = m as unknown as [string, string, string, string];
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  const valid =
    d.getUTCFullYear() === Number(yyyy) &&
    d.getUTCMonth() === Number(mm) - 1 &&
    d.getUTCDate() === Number(dd);
  return valid ? `${dd}-${mm}-${yyyy}` : null;
}

export function toCommonRow(source: SourceRow, rowNumber: number): CommonRow {
  return {
    rowNumber,
    source,
    ref: source.entity_id ?? '',
    desc: buildDesc(source),
    debit: source.debit ?? '',
    credit: source.credit ?? '',
    date: formatDate(source.created_at),
  };
}
