/// <reference lib="webworker" />
import Papa from 'papaparse';
import { toCsv } from './processing/csv';
import { OUTPUTS } from './processing/outputs';
import { createProcessor, UNASSIGNED_COLUMNS } from './processing/pipeline';
import type { SourceRow } from './processing/schema';
import { normalizeHeader, validateHeaders } from './processing/validate';
import type { WorkerMessage, WorkerRequest } from './worker-protocol';

const post = (msg: WorkerMessage) => self.postMessage(msg);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { file } = e.data;
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
      const result = processor.finish();
      post({
        type: 'done',
        totalRows: result.totalRows,
        processedRows: result.processedRows,
        journalLines: result.journalLines,
        errors: result.errors.slice(0, 200),
        files: result.outputs.map((o) => ({
          id: o.id,
          label: o.label,
          configured: o.configured,
          fileName: o.fileName,
          rowCount: o.rows.length,
          csv: o.configured ? toCsv(o.columns, o.rows) : '',
        })),
        unassigned: {
          id: 'unassigned',
          label: 'Unassigned journal lines',
          configured: true,
          fileName: 'unassigned_rows.csv',
          rowCount: result.unassigned.length,
          csv: toCsv(UNASSIGNED_COLUMNS, result.unassigned),
        },
        errorReport: {
          id: 'errors',
          label: 'Row errors',
          configured: true,
          fileName: 'row_errors.csv',
          rowCount: result.errors.length,
          csv: toCsv(
            ['row_number', 'entity_id', 'error'],
            result.errors.map((er) => ({
              row_number: String(er.rowNumber),
              entity_id: er.entityId,
              error: er.message,
            })),
          ),
        },
      });
    },
    error(err) {
      post({ type: 'failed', message: err.message });
    },
  });
};
