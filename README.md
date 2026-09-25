# Easexpense Transaction Processor

Internal tool: upload one combined Razorpay CSV and download four generated CSV files.
Everything runs in the browser; the file is never uploaded to a server.

```sh
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # static site in dist/
```

## Layout

| Path | Purpose |
| --- | --- |
| `src/processing/schema.ts` | The 27 required input columns |
| `src/processing/validate.ts` | Header check (missing / duplicated required columns) |
| `src/processing/common.ts` | Common fields: `ref`, `desc`, `debit`, `credit`, `date` |
| `src/processing/outputs/output1..4.ts` | One module per output file (currently pending) |
| `src/processing/pipeline.ts` | Row routing, error counting, unassigned-row tracking |
| `src/worker.ts` | Streams the CSV with PapaParse off the UI thread |

## Confirmed rules

- `ref` = `entity_id`
- `desc` = `description | notes | order_id | order_receipt | additional_utr` — blank,
  whitespace-only and literal `null`/`undefined`/`NaN` values are skipped; others are trimmed
- `debit` / `credit` passed through as the original strings (never parsed or rounded)
- `date` = `created_at` reformatted to `dd-MM-yyyy` (`27/03/2026 03:36:55` → `27-03-2026`);
  a text reformat, so no timezone shift. An invalid `created_at` makes the row an error

## Journal lines (`src/processing/journal.ts`)

Every output works from journal lines, where exactly one of debit / credit carries the value.

- **payment** → two lines (Razorpay's row holds the net, `credit = amount - fee`):
  - payment line: `credit = amount` (gross), `debit = 0`
  - fee line: `debit = fee` (incl. GST), `credit = 0`, `desc` prefixed `Razorpay fee | `
  - both lines share `ref = entity_id`; both are written even when amount is 0 (eMandate)
  - the row is rejected as an error unless `amount - fee == credit - debit` exactly
- **settlement, refund, other types** → one line with the source debit / credit;
  rejected as an error if both are non-zero or either is not a number

## Data integrity

- All values are kept as strings; no number coercion.
- Rows the parser cannot read (e.g. wrong field count) are counted as errors and listed
  with their row number; they are excluded from outputs.
- Journal lines no output file claims are listed in `unassigned_rows.csv` rather than dropped.
  Until the output specifications are implemented, every line lands there.
- Row numbers are 1-based data rows (header excluded).

## Adding an output specification

Replace `pendingOutput(n)` in `src/processing/outputs/outputN.ts` with an `OutputSpec`:
set `configured: true`, `fileName`, `columns`, `includes(line)` and `toRow(line)` (both receive a `JournalLine`).
