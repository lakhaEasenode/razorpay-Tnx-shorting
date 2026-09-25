import { describe, expect, it } from 'vitest';
import { REQUIRED_COLUMNS } from '../src/processing/schema';
import { normalizeHeader, validateHeaders } from '../src/processing/validate';

describe('validateHeaders', () => {
  it('accepts all required columns in any order, with extras', () => {
    const headers: string[] = [...REQUIRED_COLUMNS].reverse();
    headers.push('extra_col');
    expect(validateHeaders(headers)).toEqual({ ok: true, missing: [], duplicates: [] });
  });

  it('lists missing columns', () => {
    const headers = REQUIRED_COLUMNS.filter((c) => c !== 'notes' && c !== 'arn');
    const result = validateHeaders(headers);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['notes', 'arn']);
  });

  it('rejects a duplicated required column', () => {
    const result = validateHeaders([...REQUIRED_COLUMNS, 'debit']);
    expect(result.ok).toBe(false);
    expect(result.duplicates).toEqual(['debit']);
  });
});

describe('normalizeHeader', () => {
  it('strips BOM and whitespace', () => {
    expect(normalizeHeader('﻿entity_id ')).toBe('entity_id');
  });
});
