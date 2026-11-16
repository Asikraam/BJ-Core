import type { BatchApi } from '../main/preload';
import type {
  BatchLogEntry,
  BatchProgress,
  FileStatusUpdate,
  FontCacheStatus,
  QueueFileStatus,
} from '../shared/types';

declare global {
  interface Window {
    batchApi: BatchApi;
  }
}

interface QueueRowModel {
  relPath: string;
  format: string;
  status: QueueFileStatus;
  durationMs?: number;
  detail: string;
  tr?: HTMLTableRowElement;
}

const dropZone = document.getElementById('dropZone') as HTMLElement;
const inputDirEl = document.getElementById('inputDir') as HTMLInputElement;
const outputDirEl = document.getElementById('outputDir') as HTMLInputElement;
const browseInputBtn = document.getElementById('browseInputBtn') as HTMLButtonElement;
const browseOutputBtn = document.getElementById('browseOutputBtn') as HTMLButtonElement;
const recursiveCheck = document.getElementById('recursiveCheck') as HTMLInputElement;
const mergeCheck = document.getElementById('mergeCheck') as HTMLInputElement;
const mergedNameWrap = document.getElementById('mergedNameWrap') as HTMLDivElement;
const mergedFileNameEl = document.getElementById('mergedFileName') as HTMLInputElement;

const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement;
const openOutputBtn = document.getElementById('openOutputBtn') as HTMLButtonElement;

const fontStatusText = document.getElementById('fontStatusText') as HTMLSpanElement;

const statTotal = document.getElementById('statTotal') as HTMLElement;
const statOk = document.getElementById('statOk') as HTMLElement;
const statSkip = document.getElementById('statSkip') as HTMLElement;
const statError = document.getElementById('statError') as HTMLElement;

const queueBody = document.getElementById('queueBody') as HTMLTableSectionElement;
const filterTabs = Array.from(
  document.querySelectorAll<HTMLButtonElement>('.filter-tab')
);

const progressBar = document.getElementById('progressBar') as HTMLDivElement;
const phaseText = document.getElementById('phaseText') as HTMLSpanElement;
const progressMeta = document.getElementById('progressMeta') as HTMLSpanElement;

let outputManuallyEdited = false;
let isRunning = false;
let lastOutputDir = '';
let activeFilter: 'all' | 'ok' | 'warn' | 'error' = 'all';

const queueOrder: QueueRowModel[] = [];
const queueMap = new Map<string, QueueRowModel>();

function formatEta(ms: number | null): string {
  if (ms === null || ms < 0) return '—';
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `~${totalSec} dtk`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `~${min} mnt ${sec} dtk`;
}

function formatStatusLabel(status: QueueFileStatus): string {
  switch (status) {
    case 'waiting':
      return 'Menunggu';
    case 'processing':
      return 'Proses...';
    case 'ok':
      return 'OK';
    case 'warn':
      return 'Font Fallback';
    case 'skip':
      return 'Skip';
    case 'error':
      return 'Gagal';
  }
}

function matchesFilter(status: QueueFileStatus): boolean {
  if (activeFilter === 'all') return true;
  if (activeFilter === 'ok') return status === 'ok';
  if (activeFilter === 'warn') return status === 'warn' || status === 'skip';
  if (activeFilter === 'error') return status === 'error';
  return true;
}

function updateRowCells(row: QueueRowModel): void {
  if (!row.tr) return;
  const cells = row.tr.cells;
  cells[1].textContent = row.format;

  const statusSpan = cells[2].firstElementChild as HTMLSpanElement;
  statusSpan.className = `status-badge status-${row.status}`;
  statusSpan.textContent = formatStatusLabel(row.status);

  cells[3].textContent =
    typeof row.durationMs === 'number' ? `${row.durationMs} ms` : '—';
  cells[4].textContent = row.detail;
  cells[4].title = row.detail;

  row.tr.classList.toggle('hidden', !matchesFilter(row.status));
}

function buildRowElement(row: QueueRowModel): HTMLTableRowElement {
  const tr = document.createElement('tr');

  const tdName = document.createElement('td');
  tdName.className = 'cell-mono';
  tdName.textContent = row.relPath;
  tdName.title = row.relPath;

  const tdType = document.createElement('td');
  tdType.className = 'cell-mono';

  const tdStatus = document.createElement('td');
  const statusSpan = document.createElement('span');
  tdStatus.appendChild(statusSpan);

  const tdDur = document.createElement('td');
  tdDur.className = 'cell-mono cell-dur';

  const tdDetail = document.createElement('td');
  tdDetail.className = 'cell-mono';

  tr.append(tdName, tdType, tdStatus, tdDur, tdDetail);
  row.tr = tr;
  updateRowCells(row);
  return tr;
}

function renderQueueTable(emptyMessage?: string): void {
  queueBody.innerHTML = '';
  if (queueOrder.length === 0) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent =
      emptyMessage ||
      'Pilih atau tarik folder sumber untuk menampilkan daftar file .wmf / .emf / .wmz / .emz.';
    tr.appendChild(td);
    queueBody.appendChild(tr);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const row of queueOrder) {
    frag.appendChild(row.tr ?? buildRowElement(row));
  }
  queueBody.appendChild(frag);
}

function applyFilter(): void {
  for (const row of queueOrder) {
    if (row.tr) {
      row.tr.classList.toggle('hidden', !matchesFilter(row.status));
    }
  }
}

async function refreshFileQueue(): Promise<void> {
  const inputDir = inputDirEl.value.trim();
  queueOrder.length = 0;
  queueMap.clear();

  if (!inputDir) {
    statTotal.textContent = '0';
    statOk.textContent = '0';
    statSkip.textContent = '0';
    statError.textContent = '0';
    renderQueueTable();
    return;
  }

  const scanned = await window.batchApi.scanFolder(inputDir, recursiveCheck.checked);
  for (const item of scanned) {
    const model: QueueRowModel = {
      relPath: item.relPath,
      format: item.ext,
      status: 'waiting',
      detail: 'Siap dikonversi',
    };
    queueOrder.push(model);
    queueMap.set(item.relPath, model);
  }

  statTotal.textContent = String(scanned.length);
  statOk.textContent = '0';
  statSkip.textContent = '0';
  statError.textContent = '0';
  progressBar.style.width = '0%';
  progressMeta.textContent = `0 / ${scanned.length} (0%) | ETA: —`;
  phaseText.textContent =
    scanned.length > 0
      ? `${scanned.length} file siap dikonversi`
      : 'Tidak ada file metafile ditemukan';

  renderQueueTable(
    scanned.length === 0
      ? 'Tidak ditemukan file .wmf, .emf, .wmz, atau .emz di folder ini.'
      : undefined
  );
}

function handleFileUpdate(update: FileStatusUpdate): void {
  let row = queueMap.get(update.relPath);
  if (!row) {
    row = {
      relPath: update.relPath,
      format: update.format || '',
      status: update.status,
      durationMs: update.durationMs,
      detail: update.detail || '',
    };
    queueOrder.push(row);
    queueMap.set(update.relPath, row);
    if (queueOrder.length === 1) {
      queueBody.innerHTML = '';
    }
    queueBody.appendChild(buildRowElement(row));
  } else {
    if (update.format) row.format = update.format;
    row.status = update.status;
    if (typeof update.durationMs === 'number') row.durationMs = update.durationMs;
    if (update.detail !== undefined) row.detail = update.detail;
    updateRowCells(row);
  }

  if (update.status === 'processing' && row.tr) {
    row.tr.scrollIntoView({ block: 'nearest' });
  }
}

function updateFontStatus(status: FontCacheStatus): void {
  fontStatusText.classList.remove('ready', 'error');
  if (status.error) {
    fontStatusText.classList.add('error');
    fontStatusText.textContent = 'Font Windows: gagal dimuat';
  } else if (status.ready) {
    fontStatusText.classList.add('ready');
    fontStatusText.textContent = `Font Windows: ${status.fontFileCount} siap`;
  } else {
    fontStatusText.textContent = 'Font Windows: memuat...';
  }
}

async function setInputFolder(folderPath: string): Promise<void> {
  inputDirEl.value = folderPath;
  if (!outputManuallyEdited || !outputDirEl.value.trim()) {
    outputDirEl.value = await window.batchApi.getDefaultOutputDir(folderPath);
    outputManuallyEdited = false;
  }
  updateControls();
  await refreshFileQueue();
}

function updateControls(): void {
  const hasInput = inputDirEl.value.trim().length > 0;
  startBtn.disabled = isRunning || !hasInput;
  cancelBtn.disabled = !isRunning;
  browseInputBtn.disabled = isRunning;
  browseOutputBtn.disabled = isRunning;
  inputDirEl.disabled = isRunning;
  outputDirEl.disabled = isRunning;
  recursiveCheck.disabled = isRunning;
  mergeCheck.disabled = isRunning;
  mergedFileNameEl.disabled = isRunning;
  openOutputBtn.disabled = !(lastOutputDir || outputDirEl.value.trim());
}

function updateProgress(p: BatchProgress): void {
  const pct = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;
  progressBar.style.width = `${pct}%`;

  statTotal.textContent = String(p.total);
  statOk.textContent = String(p.successCount);
  statSkip.textContent = String(p.skipCount);
  statError.textContent = String(p.errorCount);

  progressMeta.textContent = `${p.current} / ${p.total} (${pct}%) | ETA: ${formatEta(
    p.etaMs
  )}`;

  switch (p.phase) {
    case 'scanning':
      phaseText.textContent = 'Memindai folder & menyiapkan font...';
      break;
    case 'converting':
      phaseText.textContent = p.currentFile
        ? `Mengonversi: ${p.currentFile}`
        : 'Mengonversi ke PDF vektor...';
      break;
    case 'merging':
      phaseText.textContent = `Menggabungkan PDF: ${p.currentFile || ''}`;
      break;
    case 'done':
      phaseText.textContent = p.mergedOutputPath
        ? `Selesai (${(p.elapsedMs / 1000).toFixed(1)} dtk) — Gabungan tersimpan`
        : `Selesai dalam ${(p.elapsedMs / 1000).toFixed(1)} dtk`;
      break;
    case 'cancelled':
      phaseText.textContent = 'Dibatalkan oleh pengguna';
      break;
  }
}

function handleLogFallback(entry: BatchLogEntry): void {
  if (entry.level === 'error' && !entry.file) {
    phaseText.textContent = `Error: ${entry.message}`;
  }
}

// Event Listeners
browseInputBtn.addEventListener('click', async () => {
  const selected = await window.batchApi.selectFolder(
    inputDirEl.value.trim() || undefined
  );
  if (selected) {
    await setInputFolder(selected);
  }
});

browseOutputBtn.addEventListener('click', async () => {
  const selected = await window.batchApi.selectFolder(
    outputDirEl.value.trim() || inputDirEl.value.trim() || undefined
  );
  if (selected) {
    outputDirEl.value = selected;
    outputManuallyEdited = true;
    updateControls();
  }
});

let inputDebounce: number | undefined;
inputDirEl.addEventListener('input', () => {
  window.clearTimeout(inputDebounce);
  inputDebounce = window.setTimeout(async () => {
    const val = inputDirEl.value.trim();
    if (val && !outputManuallyEdited) {
      outputDirEl.value = await window.batchApi.getDefaultOutputDir(val);
    } else if (!val && !outputManuallyEdited) {
      outputDirEl.value = '';
    }
    updateControls();
    await refreshFileQueue();
  }, 220);
});

outputDirEl.addEventListener('input', () => {
  outputManuallyEdited = outputDirEl.value.trim().length > 0;
  updateControls();
});

recursiveCheck.addEventListener('change', () => {
  if (!isRunning) {
    void refreshFileQueue();
  }
});

mergeCheck.addEventListener('change', () => {
  mergedNameWrap.classList.toggle('hidden', !mergeCheck.checked);
});

['dragenter', 'dragover'].forEach((evtName) => {
  dropZone.addEventListener(evtName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isRunning) dropZone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach((evtName) => {
  dropZone.addEventListener(evtName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  });
});

dropZone.addEventListener('drop', async (e) => {
  if (isRunning) return;
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;
  const rawPath = window.batchApi.getPathForFile(files[0]);
  const folderPath = await window.batchApi.resolveDroppedPath(rawPath);
  if (folderPath) {
    await setInputFolder(folderPath);
  } else {
    phaseText.textContent = 'Item yang ditarik bukan folder atau file yang valid.';
  }
});

startBtn.addEventListener('click', async () => {
  const inputDir = inputDirEl.value.trim();
  if (!inputDir || isRunning) return;

  const outputDir =
    outputDirEl.value.trim() ||
    (await window.batchApi.getDefaultOutputDir(inputDir));
  outputDirEl.value = outputDir;

  isRunning = true;
  lastOutputDir = outputDir;
  updateControls();

  // Reset row status to waiting before run
  for (const row of queueOrder) {
    row.status = 'waiting';
    row.durationMs = undefined;
    row.detail = 'Menunggu...';
    updateRowCells(row);
  }

  try {
    const result = await window.batchApi.startBatch({
      inputDir,
      outputDir,
      recursive: recursiveCheck.checked,
      mergePdf: mergeCheck.checked,
      mergedFileName: mergedFileNameEl.value.trim() || 'BJ-Core_Gabungan.pdf',
    });
    lastOutputDir = result.outputDir;
  } catch (err) {
    phaseText.textContent =
      err instanceof Error ? err.message : String(err);
  } finally {
    isRunning = false;
    updateControls();
  }
});

cancelBtn.addEventListener('click', async () => {
  if (!isRunning) return;
  await window.batchApi.cancelBatch();
});

openOutputBtn.addEventListener('click', async () => {
  const target = lastOutputDir || outputDirEl.value.trim();
  if (!target) return;
  const errMsg = await window.batchApi.openFolder(target);
  if (errMsg) {
    phaseText.textContent = `Gagal membuka folder: ${errMsg}`;
  }
});

filterTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    filterTabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeFilter = (tab.dataset.filter as typeof activeFilter) || 'all';
    applyFilter();
  });
});

// IPC Subscriptions
window.batchApi.onFontStatus(updateFontStatus);
window.batchApi.onProgress(updateProgress);
window.batchApi.onFileUpdate(handleFileUpdate);
window.batchApi.onLog(handleLogFallback);

void window.batchApi.getFontStatus().then(updateFontStatus);
updateControls();
