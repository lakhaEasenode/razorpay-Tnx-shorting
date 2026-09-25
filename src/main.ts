import type { GeneratedFile, WorkerMessage } from './worker-protocol';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const fileInput = $<HTMLInputElement>('file');
const selected = $('selected');
const processBtn = $<HTMLButtonElement>('process');
const progress = $<HTMLProgressElement>('progress');
const message = $('message');
const result = $('result');

let worker: Worker | null = null;
const objectUrls: string[] = [];

function reset() {
  worker?.terminate();
  worker = null;
  objectUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  message.hidden = true;
  message.replaceChildren();
  result.hidden = true;
  progress.hidden = true;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function showAlert(kind: 'error' | 'warn', title: string, items: string[] = []) {
  const box = el('div', undefined, `alert ${kind}`);
  box.append(el('strong', title));
  if (items.length) {
    const ul = el('ul');
    items.forEach((i) => ul.append(el('li', i)));
    box.append(ul);
  }
  message.append(box);
  message.hidden = false;
}

function fileRow(f: GeneratedFile, pendingText?: string): HTMLLIElement {
  const li = el('li');
  const info = el('div');
  info.append(el('div', f.configured ? f.fileName : f.label, 'name'));
  info.append(
    el('div', pendingText ?? `${f.rowCount.toLocaleString()} rows`, 'muted'),
  );
  li.append(info);

  const btn = el('button', 'Download', 'secondary') as HTMLButtonElement;
  if (pendingText) {
    btn.disabled = true;
  } else {
    btn.onclick = () => {
      const url = URL.createObjectURL(new Blob([f.csv], { type: 'text/csv;charset=utf-8' }));
      objectUrls.push(url);
      const a = el('a');
      a.href = url;
      a.download = f.fileName;
      a.click();
    };
  }
  li.append(btn);
  return li;
}

function render(msg: Extract<WorkerMessage, { type: 'done' }>) {
  $('total').textContent = msg.totalRows.toLocaleString();
  $('processed').textContent = msg.processedRows.toLocaleString();
  $('lines').textContent = msg.journalLines.toLocaleString();
  $('errors').textContent = msg.errorReport.rowCount.toLocaleString();

  $('files').replaceChildren(
    ...msg.files.map((f) => fileRow(f, f.configured ? undefined : 'Specification pending')),
  );

  const review = [msg.unassigned];
  if (msg.errorReport.rowCount > 0) review.push(msg.errorReport);
  $('review').replaceChildren(...review.map((f) => fileRow(f)));

  if (msg.unassigned.rowCount > 0) {
    showAlert(
      'warn',
      `${msg.unassigned.rowCount.toLocaleString()} journal lines were not placed in any output file. ` +
        'Download "unassigned_rows.csv" to review them.',
    );
  }

  const errorList = $('error-list');
  errorList.replaceChildren();
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
    errorList.append(el('h2', 'Row errors'));
    if (msg.errorReport.rowCount > msg.errors.length) {
      errorList.append(
        el('p', `Showing first ${msg.errors.length} of ${msg.errorReport.rowCount.toLocaleString()}. Download row_errors.csv for all.`, 'muted'),
      );
    }
    errorList.append(table);
  }

  result.hidden = false;
}

fileInput.onchange = () => {
  reset();
  const file = fileInput.files?.[0];
  selected.textContent = file ? `Selected file: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)` : '';
  processBtn.disabled = !file;
};

processBtn.onclick = () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  reset();
  processBtn.disabled = true;
  progress.value = 0;
  progress.hidden = false;

  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const msg = e.data;
    if (msg.type === 'progress') {
      progress.value = msg.percent;
      return;
    }
    progress.hidden = true;
    processBtn.disabled = false;
    if (msg.type === 'invalid') {
      const items = [
        ...msg.missing.map((c) => `Missing column: ${c}`),
        ...msg.duplicates.map((c) => `Duplicate column: ${c}`),
      ];
      showAlert('error', 'This file cannot be processed. Fix the columns below and upload again.', items);
    } else if (msg.type === 'failed') {
      showAlert('error', `Could not read the file: ${msg.message}`);
    } else {
      render(msg);
    }
    worker?.terminate();
    worker = null;
  };
  worker.onerror = (e) => {
    progress.hidden = true;
    processBtn.disabled = false;
    showAlert('error', `Processing failed: ${e.message}`);
  };
  worker.postMessage({ file });
};
