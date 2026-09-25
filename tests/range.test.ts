import { describe, expect, it } from 'vitest';
import { OUTPUTS } from '../src/processing/outputs';
import { createProcessor, fromDateKey, toDateKey } from '../src/processing/pipeline';
import { countByCategory, countInRange, rowsInRange } from '../src/processing/range';

function sample() {
  const p = createProcessor(OUTPUTS);
  p.addRow({ entity_id: 'pay_1', type: 'payment', debit: '0', credit: '95', amount: '100', fee: '5', created_at: '31/03/2026 23:59:59' }, 1);
  p.addRow({ entity_id: 'pay_2', type: 'payment', debit: '0', credit: '9', amount: '10', fee: '1', created_at: '01/04/2026 00:00:01' }, 2);
  p.addRow({ entity_id: 'rfnd_1', type: 'refund', debit: '1', credit: '0', created_at: '15/04/2026 10:00:00' }, 3);
  p.addRow({ entity_id: 'setl_1', type: 'settlement', debit: '103', credit: '0', created_at: '30/04/2026 13:00:00' }, 4);
  return p.finish();
}

describe('date range filtering', () => {
  it('converts between dd-MM-yyyy and yyyy-MM-dd', () => {
    expect(toDateKey('27-03-2026')).toBe('2026-03-27');
    expect(fromDateKey('2026-03-27')).toBe('27-03-2026');
  });

  it('counts every category across the full range', () => {
    const r = sample();
    expect(r.dateRange).toEqual({ from: '2026-03-31', to: '2026-04-30' });
    expect(countByCategory(r.lines, r.dateRange!)).toEqual({ payment: 2, fee: 2, refund: 1, settlement: 1 });
  });

  it('includes both boundary dates', () => {
    const r = sample();
    const range = { from: '2026-04-01', to: '2026-04-15' };
    expect(countByCategory(r.lines, range)).toEqual({ payment: 1, fee: 1, refund: 1 });
    expect(rowsInRange(r.unassigned, range).map((u) => [u.entity_id, u.line])).toEqual([
      ['pay_2', 'payment'],
      ['pay_2', 'fee'],
      ['rfnd_1', 'entry'],
    ]);
  });

  it('keeps a payment and its fee together in any range', () => {
    const r = sample();
    const range = { from: '2026-03-31', to: '2026-03-31' };
    expect(rowsInRange(r.unassigned, range).map((u) => u.line)).toEqual(['payment', 'fee']);
    expect(countInRange(r.unassigned, range)).toBe(2);
  });

  it('returns nothing for a range with no transactions', () => {
    const r = sample();
    expect(countInRange(r.unassigned, { from: '2026-04-16', to: '2026-04-29' })).toBe(0);
  });
});
