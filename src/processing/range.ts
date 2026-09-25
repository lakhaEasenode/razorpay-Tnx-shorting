import type { DatedRow, DateRange, LineTag } from './pipeline';

export const inRange = (dateKey: string, range: DateRange) =>
  dateKey >= range.from && dateKey <= range.to;

export function rowsInRange(rows: DatedRow[], range: DateRange) {
  return rows.filter((r) => inRange(r.dateKey, range)).map((r) => r.row);
}

export function countInRange(rows: DatedRow[], range: DateRange): number {
  let n = 0;
  for (const r of rows) if (inRange(r.dateKey, range)) n++;
  return n;
}

/** Journal line count per category (payment, fee, settlement, refund, ...) within the range. */
export function countByCategory(lines: LineTag[], range: DateRange): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const l of lines) {
    if (inRange(l.dateKey, range)) counts[l.category] = (counts[l.category] ?? 0) + 1;
  }
  return counts;
}
