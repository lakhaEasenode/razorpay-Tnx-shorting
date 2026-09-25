import { icon, type IconName } from './icons';
import { fromDateKey, type DateRange } from './processing/pipeline';
import {
  ERRORS_ID,
  UNASSIGNED_ID,
  type FileInfo,
  type WorkerMessage,
  type WorkerRequest,
} from './worker-protocol';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const fileInput = $<HTMLInputElement>('file');
const dropzone = $<HTMLLabelElement>('dropzone');
const processBtn = $<HTMLButtonElement>('process');
const progress = $('progress');
const progressBar = $('progress-bar');
const message = $('message');
const result = $('result');
const rangeFrom = $<HTMLInputElement>('range-from');
const rangeTo = $<HTMLInputElement>('range-to');
const rangeError = $('range-error');

/** Categories always shown, in this order; any other Razorpay type is appended. */
const CATEGORIES: Record<string, { label: string; icon: IconName }> = {
  payment: { label: 'Payments', icon: 'payment' },
  fee: { label: 'Fees', icon: 'fee' },
  refund: { label: 'Refunds', icon: 'refund' },
  settlement: { label: 'Settlements', icon: 'settlement' },
};

document.querySelectorAll<HTMLElement>('[data-icon]').forEach((n) => {
  n.append(icon(n.dataset.icon as IconName));
});

let worker: Worker | null = null;
let fullRange: DateRange | null = null;
/** Current valid selection; null while the inputs hold an invalid range. */
let range: DateRange | null = null;
let files: FileInfo[] = [];
let errorCount = 0;
let fileRows: Record<string, number> = {};

const send = (req: WorkerRequest) => worker?.postMessage(req);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function reset() {
  worker?.terminate();
  worker = null;
  fullRange = range = null;
  message.hidden = true;
  message.replaceChildren();
  result.hidden = true;
  progress.hidden = true;
}

function showError(title: string, items: string[] = []) {
  const box = el('div', undefined, 'alert');
  const body = el('div');
  body.append(el('strong', title));
  if (items.length) {
    const ul = el('ul');
    items.forEach((i) => ul.append(el('li', i)));
    body.append(ul);
  }
  box.append(icon('alert'), body);
  message.append(box);
  message.hidden = false;
}

/** output_1.csv → output_1_01-04-2026_to_30-06-2026.csv */
function rangedFileName(fileName: string, r: DateRange) {
  return fileName.replace(/\.csv$/i, '') + `_${fromDateKey(r.from)}_to_${fromDateKey(r.to)}.csv`;
}

function download(csv: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = el('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const pendingExports = new Map<string, string>();

function requestExport(fileId: string, fileName: string) {
  if (!range) return;
  pendingExports.set(fileId, fileId === ERRORS_ID ? fileName : rangedFileName(fileName, range));
  send({ type: 'export', fileId, range });
}

function fileRow(name: string, detail: string, onDownload: (() => void) | null) {
  const li = el('li');
  const fileIcon = el('span', undefined, 'file-icon');
  fileIcon.append(icon('file'));
  const info = el('div', undefined, 'file-info');
  info.append(el('div', name, 'file-name'), el('div', detail, 'file-meta'));
  const btn = el('button', undefined, 'ghost') as HTMLButtonElement;
  btn.append(icon('download'), 'Download');
  if (onDownload && range) btn.onclick = onDownload;
  else btn.disabled = true;
  li.append(fileIcon, info, btn);
  return li;
}


const rows = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'row' : 'rows'}`;

function renderFiles() {
  // Output files appear only once their specification is implemented.
  const ready = files.filter((f) => f.configured);
  $('files').hidden = ready.length === 0;
  $('files').replaceChildren(
    ...ready.map((f) =>
      fileRow(f.fileName, rows(fileRows[f.id] ?? 0), () => requestExport(f.id, f.fileName)),
    ),
  );

  const review = [
    fileRow('unassigned_rows.csv', `${rows(fileRows[UNASSIGNED_ID] ?? 0)} · not yet in an output file`, () =>
      requestExport(UNASSIGNED_ID, 'unassigned_rows.csv'),
    ),
  ];
  if (errorCount > 0) {
    review.push(
      fileRow('row_errors.csv', `${rows(errorCount)} (whole file)`, () =>
        requestExport(ERRORS_ID, 'row_errors.csv'),
      ),
    );
  }
  $('review').replaceChildren(...review);
}

function tile(className: string, iconName: IconName, label: string, value: number) {
  const div = el('div', undefined, `cat ${className}`);
  const head = el('div', undefined, 'cat-head');
  head.append(icon(iconName), label);
  div.append(head, el('div', value.toLocaleString(), 'cat-value'));
  return div;
}

function renderCategories(byCategory: Record<string, number>, journalLines: number) {
  const known = Object.entries(CATEGORIES).map(([k, c]) => tile(k, c.icon, c.label, byCategory[k] ?? 0));
  const others = Object.keys(byCategory)
    .filter((k) => !(k in CATEGORIES))
    .sort()
    .map((k) => tile('other', 'other', k || '(no type)', byCategory[k]!));
  $('categories').replaceChildren(...known, ...others, tile('lines', 'lines', 'Journal lines', journalLines));
}

function onRangeChange() {
  if (!fullRange) return;
  const from = rangeFrom.value;
  const to = rangeTo.value;
  let error = '';
  if (!from || !to) error = 'Choose both a From and a To date.';
  else if (from < fullRange.from || to > fullRange.to)
    error = `Dates must be between ${fromDateKey(fullRange.from)} and ${fromDateKey(fullRange.to)}.`;
  else if (from > to) error = 'From date must be on or before To date.';

  rangeError.textContent = error;
  rangeError.hidden = !error;
  range = error ? null : { from, to };
  // Counts belong to the last valid range; fade them until the new one is valid.
  $('categories').classList.toggle('stale', !range);
  if (range) send({ type: 'summarize', range });
  else renderFiles(); // disables downloads until the range is valid
}

rangeFrom.onchange = onRangeChange;
rangeTo.onchange = onRangeChange;
$('range-reset').onclick = () => {
  if (!fullRange) return;
  rangeFrom.value = fullRange.from;
  rangeTo.value = fullRange.to;
  onRangeChange();
};

function renderDone(msg: Extract<WorkerMessage, { type: 'done' }>) {
  // Instructions are no longer needed once a file has been processed; they can be reopened.
  $<HTMLDetailsElement>('howto').open = false;
  $('total').textContent = msg.totalRows.toLocaleString();
  $('processed').textContent = msg.processedRows.toLocaleString();
  $('errors').textContent = msg.errorCount.toLocaleString();
  $('errors-stat').classList.toggle('bad', msg.errorCount > 0);
  files = msg.files;
  errorCount = msg.errorCount;
  fileRows = {};

  fullRange = range = msg.dateRange;
  $('range-section').hidden = !fullRange;
  if (fullRange) {
    $('range-full').textContent = `File covers ${fromDateKey(fullRange.from)} – ${fromDateKey(fullRange.to)}`;
    for (const input of [rangeFrom, rangeTo]) {
      input.min = fullRange.from;
      input.max = fullRange.to;
    }
    rangeFrom.value = fullRange.from;
    rangeTo.value = fullRange.to;
    rangeError.hidden = true;
  }

  const errorList = $('error-list');
  errorList.replaceChildren();
  $('error-card').hidden = msg.errors.length === 0;
  if (msg.errors.length) {
    const table = el('table');
    const head = el('tr');
    head.append(el('th', 'Row'), el('th', 'Entity'), el('th', 'Error'));
    table.append(head);
    msg.errors.forEach((er) => {
      const tr = el('tr');
      tr.append(el('td', String(er.rowNumber)), el('td', er.entityId), el('td', er.message));
      table.append(tr);
    });
    if (msg.errorCount > msg.errors.length) {
      errorList.append(
        el('p', `Showing first ${msg.errors.length} of ${msg.errorCount.toLocaleString()}. Download row_errors.csv for all.`, 'muted'),
      );
    }
    errorList.append(table);
  }

  renderFiles();
  result.hidden = false;
}

function renderSummary(msg: Extract<WorkerMessage, { type: 'summary' }>) {
  // Ignore a summary for a range the user has since changed.
  if (!range || msg.range.from !== range.from || msg.range.to !== range.to) return;
  fileRows = msg.fileRows;
  renderCategories(msg.byCategory, msg.journalLines);
  renderFiles();
}

function onFileSelected() {
  reset();
  const file = fileInput.files?.[0];
  dropzone.classList.toggle('has-file', !!file);
  $('dz-title').textContent = file ? file.name : 'Choose Razorpay CSV';
  $('dz-sub').textContent = file
    ? `${(file.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 0 })} KB · click to change`
    : 'or drag and drop it here';
  processBtn.disabled = !file;
}

fileInput.onchange = onFileSelected;
dropzone.ondragover = (e) => {
  e.preventDefault();
  dropzone.classList.add('drag');
};
dropzone.ondragleave = () => dropzone.classList.remove('drag');
dropzone.ondrop = (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag');
  if (e.dataTransfer?.files.length) {
    fileInput.files = e.dataTransfer.files;
    onFileSelected();
  }
};

processBtn.onclick = () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  reset();
  processBtn.disabled = true;
  progressBar.style.width = '0%';
  progress.hidden = false;

  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const msg = e.data;
    switch (msg.type) {
      case 'progress':
        progressBar.style.width = `${msg.percent}%`;
        return;
      case 'summary':
        renderSummary(msg);
        return;
      case 'export': {
        const name = pendingExports.get(msg.fileId);
        pendingExports.delete(msg.fileId);
        if (name) download(msg.csv, name);
        return;
      }
    }
    progress.hidden = true;
    processBtn.disabled = false;
    if (msg.type === 'invalid') {
      const items = [
        ...msg.missing.map((c) => `Missing column: ${c}`),
        ...msg.duplicates.map((c) => `Duplicate column: ${c}`),
      ];
      showError('This file cannot be processed. Fix the columns below and upload again.', items);
    } else if (msg.type === 'failed') {
      showError(`Could not read the file: ${msg.message}`);
    } else {
      renderDone(msg);
    }
    // The worker stays alive after 'done' to serve date-range summaries and downloads.
    if (msg.type !== 'done') {
      worker?.terminate();
      worker = null;
    }
  };
  worker.onerror = (e) => {
    progress.hidden = true;
    processBtn.disabled = false;
    showError(`Processing failed: ${e.message}`);
  };
  send({ type: 'process', file });
};
