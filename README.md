# Easexpense Transaction Processor

Internal tool: turns Razorpay's Combined Report into journal-ready CSV files for Zoho Books.

```sh
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # static site in dist/
npm run preview  # serve the build at http://localhost:4173/razorpay-Tnx-shorting/
```

## Hosting (GitHub Pages)

Live at **https://lakhaeasenode.github.io/razorpay-Tnx-shorting/**.

`.github/workflows/deploy.yml` runs on every push to `main`: install → test → build → deploy.
A failing test blocks the deploy. One-time setup: repo **Settings → Pages → Source: GitHub Actions**.

The build is served from `/razorpay-Tnx-shorting/` (`base` in `vite.config.ts`); rename the repo
and that value must change too. The site is public, but uploaded CSVs are processed only in the
viewer's browser and are never sent anywhere.

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

## Results screen

- Rows in file, processed rows, errors.
- **Date range picker**: From / To default to the earliest and latest journal line `date` and
  cannot go outside them. Counts and every download (except `row_errors.csv`, which always covers
  the whole file) are limited to the selected range, inclusive. Downloaded file names carry the
  range, e.g. `unassigned_rows_01-04-2026_to_30-04-2026.csv`. A payment and its fee share a date,
  so they are always included together.
- Line counts in the selected range: Payments, Fees, Refunds, Settlements (plus any other
  Razorpay type found) and total journal lines.

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
