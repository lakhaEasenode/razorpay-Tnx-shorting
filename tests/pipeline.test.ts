import { describe, expect, it } from 'vitest';
import { OUTPUTS } from '../src/processing/outputs';
import type { OutputSpec } from '../src/processing/outputs/types';
import { createProcessor } from '../src/processing/pipeline';

const D = '02/04/2026 13:09:41';

describe('createProcessor', () => {
  it('with pending outputs, every journal line is reported as unassigned, not dropped', () => {
    const p = createProcessor(OUTPUTS);
    p.addRow({ entity_id: 'pay_1', type: 'payment', debit: '0', credit: '95', amount: '100', fee: '5', created_at: D }, 1);
    p.addRow({ entity_id: 'setl_1', type: 'settlement', debit: '95', credit: '0', created_at: D }, 2);
    const r = p.finish();
    expect(r.totalRows).toBe(2);
    expect(r.processedRows).toBe(2);
    expect(r.lines).toEqual([
      { dateKey: '2026-04-02', category: 'payment' },
      { dateKey: '2026-04-02', category: 'fee' },
      { dateKey: '2026-04-02', category: 'settlement' },
    ]);
    expect(r.outputs.every((o) => o.rows.length === 0)).toBe(true);
    expect(r.unassigned.map((u) => [u.row.entity_id, u.row.line])).toEqual([
      ['pay_1', 'payment'],
      ['pay_1', 'fee'],
      ['setl_1', 'entry'],
    ]);
  });

  it('reports the earliest and latest date across months and years', () => {
    const p = createProcessor(OUTPUTS);
    const row = (id: string, created_at: string) => ({ entity_id: id, type: 'refund', debit: '1', credit: '0', created_at });
    p.addRow(row('a', '15/04/2026 10:00:00'), 1);
    p.addRow(row('b', '28/12/2025 10:00:00'), 2);
    p.addRow(row('c', '02/05/2026 10:00:00'), 3);
    p.addRow(row('d', '31/01/2026 10:00:00'), 4);
    expect(p.finish().dateRange).toEqual({ from: '2025-12-28', to: '2026-05-02' });
  });

  it('has no date range when nothing was processed', () => {
    expect(createProcessor(OUTPUTS).finish().dateRange).toBeNull();
  });

  it('reports rows that fail journal checks as errors', () => {
    const p = createProcessor(OUTPUTS);
    p.addRow({ entity_id: 'x', type: 'refund', debit: '1', credit: '1', created_at: D }, 4);
    const r = p.finish();
    expect(r.errors).toEqual([{ rowNumber: 4, entityId: 'x', message: 'both debit (1) and credit (1) are non-zero' }]);
    expect(r.lines).toHaveLength(0);
  });

  it('counts rows with parse errors and excludes them from outputs', () => {
    const p = createProcessor(OUTPUTS);
    p.addRow({ entity_id: 'pay_1' }, 1, 'Too few fields');
    const r = p.finish();
    expect(r.errors).toEqual([{ rowNumber: 1, entityId: 'pay_1', message: 'Too few fields' }]);
    expect(r.processedRows).toBe(0);
    expect(r.unassigned).toHaveLength(0);
  });

  it('routes rows to configured outputs in input order', () => {
    const spec: OutputSpec = {
      id: 't', label: 't', configured: true, fileName: 't.csv', columns: ['ref'],
      includes: (line) => line.source.type === 'settlement',
      toRow: (line) => ({ ref: line.ref }),
    };
    const p = createProcessor([spec]);
    p.addRow({ created_at: D, entity_id: 'a', type: 'settlement', debit: '1', credit: '0' }, 1);
    p.addRow({ created_at: D, entity_id: 'b', type: 'refund', debit: '1', credit: '0' }, 2);
    p.addRow({ created_at: D, entity_id: 'c', type: 'settlement', debit: '1', credit: '0' }, 3);
    const r = p.finish();
    expect(r.outputs[0]!.rows.map((d) => d.row)).toEqual([{ ref: 'a' }, { ref: 'c' }]);
    expect(r.unassigned.map((u) => u.row.entity_id)).toEqual(['b']);
  });
});
