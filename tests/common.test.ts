import { describe, expect, it } from 'vitest';
import { buildDesc, formatDate, toCommonRow } from '../src/processing/common';

describe('buildDesc', () => {
  it('joins all populated fields in order', () => {
    expect(
      buildDesc({
        description: 'Payment received',
        notes: 'Customer subscription',
        order_id: 'order_123',
        order_receipt: 'receipt_456',
        additional_utr: 'UTR789',
      }),
    ).toBe('Payment received | Customer subscription | order_123 | receipt_456 | UTR789');
  });

  it('skips blank, whitespace-only and missing fields', () => {
    expect(
      buildDesc({ description: 'Payment received', notes: '', order_id: 'order_123', order_receipt: '   ' }),
    ).toBe('Payment received | order_123');
  });

  it('never emits undefined/null/NaN placeholders', () => {
    expect(buildDesc({ description: 'x', notes: 'null', order_id: 'undefined', order_receipt: 'NaN' })).toBe('x');
  });

  it('keeps source text otherwise unchanged', () => {
    expect(buildDesc({ notes: '{"plan":"Pro, yearly"}' })).toBe('{"plan":"Pro, yearly"}');
  });

  it('returns empty string when nothing is populated', () => {
    expect(buildDesc({})).toBe('');
  });
});

describe('toCommonRow', () => {
  it('maps ref from entity_id and passes debit/credit through untouched', () => {
    const row = toCommonRow({ entity_id: 'pay_ABC123', debit: '0', credit: '1000.50', description: 'd' }, 7);
    expect(row).toMatchObject({ rowNumber: 7, ref: 'pay_ABC123', debit: '0', credit: '1000.50', desc: 'd' });
  });

  it('does not reformat amounts', () => {
    const row = toCommonRow({ entity_id: 'x', debit: '0010.100', credit: '' }, 1);
    expect(row.debit).toBe('0010.100');
    expect(row.credit).toBe('');
  });
});

describe('formatDate', () => {
  it('reformats created_at to dd-MM-yyyy and drops the time', () => {
    expect(formatDate('27/03/2026 03:36:55')).toBe('27-03-2026');
    expect(formatDate('02/04/2026 13:09')).toBe('02-04-2026');
    expect(formatDate('02/04/2026')).toBe('02-04-2026');
  });

  it('keeps late-night times on the same calendar day', () => {
    expect(formatDate('31/03/2026 23:59:59')).toBe('31-03-2026');
  });

  it('rejects invalid or unexpected formats', () => {
    for (const v of ['', undefined, '31/02/2026 10:00:00', '2026-04-02', '2/4/2026', '02-04-2026']) {
      expect(formatDate(v)).toBeNull();
    }
  });
});
