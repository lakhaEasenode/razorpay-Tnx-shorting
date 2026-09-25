/// <reference lib="webworker" />
import Papa from 'papaparse';
import { toCsv } from './processing/csv';
import { OUTPUTS } from './processing/outputs';
import {
  createProcessor,
  UNASSIGNED_COLUMNS,
  type DateRange,
  type ProcessingResult,
} from './processing/pipeline';
import { countByCategory, countInRange, rowsInRange } from './processing/range';
import type { SourceRow } from './processing/schema';
import { normalizeHeader, validateHeaders } from './processing/validate';
import {
  ERRORS_ID,
  UNASSIGNED_ID,
  type WorkerMessage,
  type WorkerRequest,
} from './worker-protocol';

const post = (msg: WorkerMessage) => self.postMessage(msg);

/** Result of the last processed file, kept so date ranges can be applied without re-parsing. */
let result: ProcessingResult | null = null;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  if (req.type === 'process') process(req.file);
  else if (req.type === 'summarize') summarize(req.range);
  else exportFile(req.fileId, req.range);
};

function summarize(range: DateRange) {
  if (!result) return;
  const fileRows: Record<string, number> = {};
  for (const o of result.outputs) fileRows[o.id] = countInRange(o.rows, range);
  fileRows[UNASSIGNED_ID] = countInRange(result.unassigned, range);
  const byCategory = countByCategory(result.lines, range);
  post({
    type: 'summary',
    range,
    journalLines: Object.values(byCategory).reduce((a, b) => a + b, 0),
    byCategory,
    fileRows,
  });
}

function exportFile(fileId: string, range: DateRange) {
  if (!result) return;
  let csv: string;
  if (fileId === ERRORS_ID) {
    // Errors have no reliable date, so the report always covers the whole file.
    csv = toCsv(
      ['row_number', 'entity_id', 'error'],
      result.errors.map((er) => ({
        row_number: String(er.rowNumber),
        entity_id: er.entityId,
        error: er.message,
      })),
    );
  } else if (fileId === UNASSIGNED_ID) {
    csv = toCsv(UNASSIGNED_COLUMNS, rowsInRange(result.unassigned, range));
  } else {
    const out = result.outputs.find((o) => o.id === fileId);
    if (!out) return;
    csv = toCsv(out.columns, rowsInRange(out.rows, range));
  }
  post({ type: 'export', fileId, csv });
}

function process(file: File) {
  result = null;
  const processor = createProcessor(OUTPUTS);
  let rowsSeen = 0;
  let headerChecked = false;
  let invalid = false;
  let lastPercent = -1;

  Papa.parse<SourceRow>(file, {
    header: true,
    // Keep every value as the original string: no number/boolean coercion.
    dynamicTyping: false,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader,
    chunk(results, parser) {
      if (!headerChecked) {
        headerChecked = true;
        const renamed = results.meta.renamedHeaders ?? {};
        const headers = (results.meta.fields ?? []).map((f) => renamed[f] ?? f);
        const check = validateHeaders(headers);
        if (!check.ok) {
          invalid = true;
          post({ type: 'invalid', missing: check.missing, duplicates: check.duplicates });
          parser.abort();
          return;
        }
      }

      const errorsByIndex = new Map<number, string>();
      for (const err of results.errors) {
        if (err.row === undefined) continue;
        const prev = errorsByIndex.get(err.row);
        errorsByIndex.set(err.row, prev ? `${prev}; ${err.message}` : err.message);
      }

      results.data.forEach((row, i) => {
        processor.addRow(row, rowsSeen + i + 1, errorsByIndex.get(i));
      });
      rowsSeen += results.data.length;

      const percent = Math.floor((results.meta.cursor / file.size) * 100);
      if (percent !== lastPercent) {
        lastPercent = percent;
        post({ type: 'progress', percent });
      }
    },
    complete() {
      if (invalid) return;
      if (!headerChecked) {
        post({ type: 'failed', message: 'The file is empty or has no header row.' });
        return;
      }
      result = processor.finish();
      post({
        type: 'done',
        totalRows: result.totalRows,
        processedRows: result.processedRows,
        dateRange: result.dateRange,
        errors: result.errors.slice(0, 200),
        errorCount: result.errors.length,
        files: result.outputs.map(({ id, label, configured, fileName }) => ({
          id,
          label,
          configured,
          fileName,
        })),
      });
      if (result.dateRange) summarize(result.dateRange);
    },
    error(err) {
      post({ type: 'failed', message: err.message });
    },
  });
}
