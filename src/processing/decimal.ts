/**
 * Exact decimal arithmetic on amount strings, used only for integrity checks.
 * Amounts written to output files are always the original source strings.
 */
const DECIMAL = /^-?\d+(\.\d+)?$/;

export function isDecimal(value: string): boolean {
  return DECIMAL.test(value.trim());
}

/** Parse to a scaled BigInt; returns null when the value is not a plain decimal. Blank counts as 0. */
function scaled(value: string, scale: number): bigint | null {
  const v = value.trim();
  if (v === '') return 0n;
  if (!DECIMAL.test(v)) return null;
  const negative = v.startsWith('-');
  const [int = '0', frac = ''] = v.replace('-', '').split('.');
  if (frac.length > scale) return null;
  const n = BigInt(int + frac.padEnd(scale, '0'));
  return negative ? -n : n;
}

const SCALE = 6;

export function isZero(value: string): boolean {
  return scaled(value, SCALE) === 0n;
}

/** a - b === c - d, or null if any value is not a valid decimal. */
export function differencesEqual(a: string, b: string, c: string, d: string): boolean | null {
  const [sa, sb, sc, sd] = [a, b, c, d].map((v) => scaled(v, SCALE));
  if (sa == null || sb == null || sc == null || sd == null) return null;
  return sa - sb === sc - sd;
}
