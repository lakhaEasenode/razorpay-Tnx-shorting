import type { CommonRow } from './common';
import { differencesEqual, isDecimal, isZero } from './decimal';

export type LineKind = 'payment' | 'fee' | 'entry';

/**
 * One journal line. Exactly one of debit / credit carries the value; the other is '0'.
 * A source row produces one or more lines, all sharing its rowNumber and source.
 */
export interface JournalLine extends Omit<CommonRow, 'debit' | 'credit' | 'date'> {
  kind: LineKind;
  date: string;
  debit: string;
  credit: string;
}

export const FEE_DESC_PREFIX = 'Razorpay fee';

export type JournalResult = { ok: true; lines: JournalLine[] } | { ok: false; error: string };

/**
 * Split a source row into journal lines.
 *
 * - payment: Razorpay reports the net (amount - fee) in one row. It becomes two lines:
 *     payment line: credit = amount (gross), debit = 0
 *     fee line:     debit = fee (incl. GST), credit = 0, desc prefixed "Razorpay fee"
 *   Both lines are always written, even when amount or fee is 0.
 * - every other type: a single line with the source debit / credit.
 */
export function toJournalLines(row: CommonRow): JournalResult {
  const s = row.source;
  const type = s.type?.trim() ?? '';
  const date = row.date;
  if (date === null) {
    return { ok: false, error: `created_at is not a valid dd/MM/yyyy date: "${s.created_at ?? ''}"` };
  }

  if (type === 'payment') {
    const amount = s.amount ?? '';
    const fee = s.fee ?? '';
    if (!isDecimal(amount) || !isDecimal(fee)) {
      return { ok: false, error: `payment has non-numeric amount "${amount}" or fee "${fee}"` };
    }
    // The split must reproduce Razorpay's own net figure exactly.
    if (!differencesEqual(amount, fee, row.credit, row.debit)) {
      return {
        ok: false,
        error: `payment does not reconcile: amount ${amount} - fee ${fee} != credit ${row.credit} - debit ${row.debit}`,
      };
    }
    const base = { rowNumber: row.rowNumber, source: s, ref: row.ref, date };
    return {
      ok: true,
      lines: [
        { ...base, kind: 'payment', desc: row.desc, debit: '0', credit: amount.trim() },
        {
          ...base,
          kind: 'fee',
          desc: row.desc ? `${FEE_DESC_PREFIX} | ${row.desc}` : FEE_DESC_PREFIX,
          debit: fee.trim(),
          credit: '0',
        },
      ],
    };
  }

  for (const [name, value] of [['debit', row.debit], ['credit', row.credit]] as const) {
    if (value.trim() !== '' && !isDecimal(value)) {
      return { ok: false, error: `${name} is not a number: "${value}"` };
    }
  }
  if (!isZero(row.debit) && !isZero(row.credit)) {
    return { ok: false, error: `both debit (${row.debit}) and credit (${row.credit}) are non-zero` };
  }
  return { ok: true, lines: [{ ...row, date, kind: 'entry' }] };
}
