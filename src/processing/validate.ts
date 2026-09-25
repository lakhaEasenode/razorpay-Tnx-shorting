import { REQUIRED_COLUMNS } from './schema';

/** Header cleanup applied while parsing: strip a UTF-8 BOM and surrounding whitespace. */
export function normalizeHeader(header: string): string {
  return header.replace(/^﻿/, '').trim();
}

export interface HeaderValidation {
  ok: boolean;
  missing: string[];
  duplicates: string[];
}

export function validateHeaders(headers: readonly string[]): HeaderValidation {
  const present = new Set(headers);
  const missing = REQUIRED_COLUMNS.filter((c) => !present.has(c));

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const h of headers) {
    if (seen.has(h)) duplicates.add(h);
    seen.add(h);
  }
  // A duplicated required column makes the source value ambiguous, so it blocks processing.
  const blockingDuplicates = [...duplicates].filter((d) =>
    (REQUIRED_COLUMNS as readonly string[]).includes(d),
  );

  return {
    ok: missing.length === 0 && blockingDuplicates.length === 0,
    missing,
    duplicates: blockingDuplicates,
  };
}
