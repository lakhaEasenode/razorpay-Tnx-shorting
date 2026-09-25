import { describe, expect, it } from 'vitest';
import { toCommonRow } from '../src/processing/common';
import { toJournalLines } from '../src/processing/journal';
import type { SourceRow } from '../src/processing/schema';

const lines = (source: SourceRow) =>
  toJournalLines(toCommonRow({ created_at: '27/03/2026 03:36:55', ...source }, 1));

describe('toJournalLines', () => {
  it('splits a payment into a gross credit line and a fee debit line', () => {
    const r = lines({
      entity_id: 'pay_SVPzYmWbYV1k4V', type: 'payment',
      debit: '0', credit: '2412.96', amount: '2529.38', fee: '116.42', tax: '17.76',
      description: 'Invoice #1',
    });
    expect(r.ok && r.lines.map(({ kind, date, debit, credit, ref, desc }) => ({ kind, date, debit, credit, ref, desc }))).toEqual([
      { kind: 'payment', date: '27-03-2026', debit: '0', credit: '2529.38', ref: 'pay_SVPzYmWbYV1k4V', desc: 'Invoice #1' },
      { kind: 'fee', date: '27-03-2026', debit: '116.42', credit: '0', ref: 'pay_SVPzYmWbYV1k4V', desc: 'Razorpay fee | Invoice #1' },
    ]);
  });

  it('keeps both lines for a zero-amount eMandate payment', () => {
    const r = lines({ entity_id: 'pay_ScrJWcR3G1SOGn', type: 'payment', debit: '25.96', credit: '0', amount: '0', fee: '25.96' });
    expect(r.ok && r.lines.map((l) => [l.kind, l.debit, l.credit])).toEqual([
      ['payment', '0', '0'],
      ['fee', '25.96', '0'],
    ]);
  });

  it('uses the bare prefix as fee desc when desc is empty', () => {
    const r = lines({ entity_id: 'p', type: 'payment', debit: '0', credit: '9', amount: '10', fee: '1' });
    expect(r.ok && r.lines[1]!.desc).toBe('Razorpay fee');
  });

  it('rejects a payment whose split does not reproduce the net', () => {
    const r = lines({ entity_id: 'p', type: 'payment', debit: '0', credit: '100', amount: '110', fee: '5' });
    expect(r.ok).toBe(false);
  });

  it('passes settlements and refunds through as a single line', () => {
    const r = lines({ entity_id: 'setl_1', type: 'settlement', debit: '20476.19', credit: '0', amount: '20476.19', fee: '0' });
    expect(r.ok && r.lines.map((l) => [l.kind, l.debit, l.credit])).toEqual([['entry', '20476.19', '0']]);
  });

  it('rejects a non-payment row with both debit and credit', () => {
    const r = lines({ entity_id: 'x', type: 'adjustment', debit: '5', credit: '5' });
    expect(r).toEqual({ ok: false, error: 'both debit (5) and credit (5) are non-zero' });
  });

  it('rejects a row with an invalid created_at', () => {
    const r = lines({ entity_id: 'x', type: 'refund', debit: '1', credit: '0', created_at: '31/02/2026 10:00:00' });
    expect(r).toEqual({ ok: false, error: 'created_at is not a valid dd/MM/yyyy date: "31/02/2026 10:00:00"' });
  });

  it('rejects non-numeric amounts', () => {
    expect(lines({ entity_id: 'x', type: 'refund', debit: '1.2.3', credit: '0' }).ok).toBe(false);
    expect(lines({ entity_id: 'p', type: 'payment', debit: '0', credit: '1', amount: '1e3', fee: '0' }).ok).toBe(false);
  });
});
