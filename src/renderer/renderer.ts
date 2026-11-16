import type { BatchApi } from '../main/preload';
import type {
  BatchLogEntry,
  BatchProgress,
  DroppedItemsResolution,
  FileStatusUpdate,
  FontCacheStatus,
  QueueFileStatus,
  ScannedFileEntry,
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
  outputPdfPath?: string;
  tr?: HTMLTableRowElement;
}

const dropZone = document.getElementById('dropZone') as HTMLElement;
const inputDirEl = document.getElementById('inputDir') as HTMLInputElement;
const outputDirEl = document.getElementById('outputDir') as HTMLInputElement;
const browseFileBtn = document.getElementById('browseFileBtn') as HTMLButtonElement;
const browseInputBtn = document.getElementById('browseInputBtn') as HTMLButtonElement;
const browseOutputBtn = document.getElementById('browseOutputBtn') as HTMLButtonElement;
const recursiveCheck = document.getElementById('recursiveCheck') as HTMLInputElement;
const mergeCheck = document.getElementById('mergeCheck') as HTMLInputElement;
const mergedNameWrap = document.getElementById('mergedNameWrap') as HTMLDivElement;
const mergedFileNameEl = document.getElementById('mergedFileName') as HTMLInputElement;
const modeBadge = document.getElementById('modeBadge') as HTMLSpanElement;

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

// Selection state: either 'folder' or 'files'
let selectionMode: 'folder' | 'files' = 'folder';
let selectedFilePaths: string[] = [];
let baseSourceDir = '';

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
      return 'Siap';
    case 'processing':
      return 'Proses...';
    case 'ok':
      return 'Berhasil (OK)';
    case 'warn':
      return 'OK (Font Disesuaikan)';
    case 'skip':
      return 'Dilewati';
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

  const hasPdf = Boolean(row.outputPdfPath);
  row.tr.classList.toggle('clickable-row', hasPdf);
  row.tr.title = hasPdf
    ? `Klik 2x untuk langsung membuka ${row.outputPdfPath}`
    : '';
  row.tr.classList.toggle('hidden', !matchesFilter(row.status));
}

function buildRowElement(row: QueueRowModel): HTMLTableRowElement {
  const tr = document.createElement('tr');

  tr.addEventListener('dblclick', async () => {
    if (!row.outputPdfPath) return;
    phaseText.textContent = `Membuka file PDF: ${row.relPath}...`;
    const errMsg = await window.batchApi.openFile(row.outputPdfPath);
    if (errMsg) {
      phaseText.textContent = `Gagal membuka PDF: ${errMsg}`;
    }
  });

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
      'Belum ada gambar dipilih. Klik tombol "Pilih 1 File..." atau "Pilih 1 Folder..." di atas.';
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

function populateQueueFromEntries(entries: ScannedFileEntry[]): void {
  queueOrder.length = 0;
  queueMap.clear();

  for (const item of entries) {
    const model: QueueRowModel = {
      relPath: item.relPath,
      format: item.ext,
      status: 'waiting',
      detail: 'Siap diubah ke PDF',
    };
    queueOrder.push(model);
    queueMap.set(item.relPath, model);
  }

  statTotal.textContent = String(entries.length);
  statOk.textContent = '0';
  statSkip.textContent = '0';
  statError.textContent = '0';
  progressBar.style.width = '0%';
  progressMeta.textContent = `0 / ${entries.length} (0%) | Sisa waktu: —`;
  phaseText.textContent =
    entries.length > 0
      ? `${entries.length} gambar siap diubah ke PDF — Klik tombol "1. Mulai Ubah ke PDF"`
      : 'Tidak ada file .wmf / .emf ditemukan';

  renderQueueTable(
    entries.length === 0
      ? 'Tidak ditemukan file .wmf, .emf, .wmz, atau .emz.'
      : undefined
  );
}

async function refreshFolderQueue(): Promise<void> {
  if (selectionMode !== 'folder') return;
  const inputDir = inputDirEl.value.trim();
  baseSourceDir = inputDir;
  if (!inputDir) {
    populateQueueFromEntries([]);
    return;
  }
  const scanned = await window.batchApi.scanFolder(inputDir, recursiveCheck.checked);
  populateQueueFromEntries(scanned);
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
      outputPdfPath: update.outputPdfPath,
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
    if (update.outputPdfPath) row.outputPdfPath = update.outputPdfPath;
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

const STORAGE_KEYS = {
  lastInputDir: 'bj_pdf_last_input_dir',
  lastOutputDir: 'bj_pdf_last_output_dir',
  lastOutputManual: 'bj_pdf_last_output_manual',
  recursive: 'bj_pdf_recursive',
  merge: 'bj_pdf_merge',
};

function savePrefs(): void {
  try {
    if (baseSourceDir) {
      localStorage.setItem(STORAGE_KEYS.lastInputDir, baseSourceDir);
    }
    localStorage.setItem(STORAGE_KEYS.lastOutputDir, outputDirEl.value.trim());
    localStorage.setItem(
      STORAGE_KEYS.lastOutputManual,
      outputManuallyEdited ? '1' : '0'
    );
    localStorage.setItem(
      STORAGE_KEYS.recursive,
      recursiveCheck.checked ? '1' : '0'
    );
    localStorage.setItem(STORAGE_KEYS.merge, mergeCheck.checked ? '1' : '0');
  } catch {
    // Ignore storage error
  }
}

async function restorePrefs(): Promise<void> {
  try {
    const savedRec = localStorage.getItem(STORAGE_KEYS.recursive);
    if (savedRec !== null) recursiveCheck.checked = savedRec === '1';

    const savedMerge = localStorage.getItem(STORAGE_KEYS.merge);
    if (savedMerge !== null) {
      mergeCheck.checked = savedMerge === '1';
      mergedNameWrap.classList.toggle('hidden', !mergeCheck.checked);
    }

    const savedInput = localStorage.getItem(STORAGE_KEYS.lastInputDir)?.trim();
    if (savedInput) {
      const scanned = await window.batchApi.scanFolder(
        savedInput,
        recursiveCheck.checked
      );
      if (scanned.length > 0) {
        selectionMode = 'folder';
        selectedFilePaths = [];
        baseSourceDir = savedInput;
        inputDirEl.value = savedInput;
        modeBadge.textContent = 'Mode: 1 Folder Penuh (Folder Terakhir)';

        const savedManual =
          localStorage.getItem(STORAGE_KEYS.lastOutputManual) === '1';
        const savedOut = localStorage.getItem(STORAGE_KEYS.lastOutputDir)?.trim();
        if (savedManual && savedOut) {
          outputDirEl.value = savedOut;
          outputManuallyEdited = true;
        } else {
          outputDirEl.value = await window.batchApi.getDefaultOutputDir(savedInput);
          outputManuallyEdited = false;
        }
        populateQueueFromEntries(scanned);
        updateControls();
      }
    }
  } catch {
    // Ignore restore error
  }
}

async function applyFileSelection(res: DroppedItemsResolution): Promise<void> {
  if (res.mode === 'folder') {
    await setInputFolder(res.inputDir);
    return;
  }
  selectionMode = 'files';
  baseSourceDir = res.inputDir;
  const entries = res.files || [];
  selectedFilePaths = entries.map((e) => e.fullPath);

  if (entries.length === 1) {
    inputDirEl.value = entries[0].fullPath;
    modeBadge.textContent = 'Mode: 1 File Gambar';
  } else {
    inputDirEl.value = `${entries.length} file dipilih dari ${res.inputDir}`;
    modeBadge.textContent = `Mode: ${entries.length} File Pilihan`;
  }

  if (!outputManuallyEdited || !outputDirEl.value.trim()) {
    outputDirEl.value = await window.batchApi.getDefaultOutputDir(res.inputDir);
    outputManuallyEdited = false;
  }
  savePrefs();
  populateQueueFromEntries(entries);
  updateControls();
}

async function setInputFolder(folderPath: string): Promise<void> {
  selectionMode = 'folder';
  selectedFilePaths = [];
  baseSourceDir = folderPath;
  inputDirEl.value = folderPath;
  modeBadge.textContent = 'Mode: 1 Folder Penuh';

  if (!outputManuallyEdited || !outputDirEl.value.trim()) {
    outputDirEl.value = await window.batchApi.getDefaultOutputDir(folderPath);
    outputManuallyEdited = false;
  }
  savePrefs();
  await refreshFolderQueue();
  updateControls();
}

function updateControls(): void {
  const hasSelection =
    selectionMode === 'files'
      ? selectedFilePaths.length > 0
      : inputDirEl.value.trim().length > 0;
  startBtn.disabled = isRunning || !hasSelection || queueOrder.length === 0;
  cancelBtn.disabled = !isRunning;
  browseFileBtn.disabled = isRunning;
  browseInputBtn.disabled = isRunning;
  browseOutputBtn.disabled = isRunning;
  inputDirEl.disabled = isRunning;
  outputDirEl.disabled = isRunning;
  recursiveCheck.disabled = isRunning || selectionMode === 'files';
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

  progressMeta.textContent = `${p.current} / ${p.total} (${pct}%) | Sisa waktu: ${formatEta(
    p.etaMs
  )}`;

  switch (p.phase) {
    case 'scanning':
      phaseText.textContent = 'Menyiapkan gambar & font...';
      break;
    case 'converting':
      phaseText.textContent = p.currentFile
        ? `Sedang mengubah: ${p.currentFile}`
        : 'Sedang mengubah ke PDF...';
      break;
    case 'merging':
      phaseText.textContent = `Menyatukan PDF: ${p.currentFile || ''}`;
      break;
    case 'done':
      phaseText.textContent = p.mergedOutputPath
        ? `Selesai (${(p.elapsedMs / 1000).toFixed(1)} dtk) — Klik "2. Buka Folder Hasil PDF"`
        : `Selesai dalam ${(p.elapsedMs / 1000).toFixed(1)} dtk — Klik "2. Buka Folder Hasil PDF"`;
      break;
    case 'cancelled':
      phaseText.textContent = 'Dihentikan oleh pengguna';
      break;
  }
}

function handleLogFallback(entry: BatchLogEntry): void {
  if (entry.level === 'error' && !entry.file) {
    phaseText.textContent = `Error: ${entry.message}`;
  }
}

// Event Listeners
browseFileBtn.addEventListener('click', async () => {
  const res = await window.batchApi.selectFiles(baseSourceDir || undefined);
  if (res) {
    await applyFileSelection(res);
  }
});

browseInputBtn.addEventListener('click', async () => {
  const selected = await window.batchApi.selectFolder(
    baseSourceDir || inputDirEl.value.trim() || undefined
  );
  if (selected) {
    await setInputFolder(selected);
  }
});

browseOutputBtn.addEventListener('click', async () => {
  const selected = await window.batchApi.selectFolder(
    outputDirEl.value.trim() || baseSourceDir || undefined
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
    // If user types/pastes a single .wmf/.emf path directly into the box:
    if (/\.(wmf|emf|wmz|emz)$/i.test(val)) {
      const res = await window.batchApi.resolveDroppedPaths([val]);
      if (res) {
        await applyFileSelection(res);
        return;
      }
    }
    selectionMode = 'folder';
    selectedFilePaths = [];
    baseSourceDir = val;
    modeBadge.textContent = 'Mode: 1 Folder Penuh';
    if (val && !outputManuallyEdited) {
      outputDirEl.value = await window.batchApi.getDefaultOutputDir(val);
    } else if (!val && !outputManuallyEdited) {
      outputDirEl.value = '';
    }
    await refreshFolderQueue();
    updateControls();
  }, 220);
});

outputDirEl.addEventListener('input', () => {
  outputManuallyEdited = outputDirEl.value.trim().length > 0;
  savePrefs();
  updateControls();
});

recursiveCheck.addEventListener('change', () => {
  savePrefs();
  if (!isRunning && selectionMode === 'folder') {
    void refreshFolderQueue();
  }
});

mergeCheck.addEventListener('change', () => {
  savePrefs();
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
  const rawPaths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    rawPaths.push(window.batchApi.getPathForFile(files[i]));
  }
  const resolved = await window.batchApi.resolveDroppedPaths(rawPaths);
  if (resolved) {
    await applyFileSelection(resolved);
  } else {
    phaseText.textContent =
      'File yang ditarik bukan gambar .wmf / .emf atau folder yang valid.';
  }
});

startBtn.addEventListener('click', async () => {
  if (isRunning || queueOrder.length === 0) return;

  const effectiveInputDir =
    selectionMode === 'files' ? baseSourceDir : inputDirEl.value.trim();
  if (!effectiveInputDir) return;

  const outputDir =
    outputDirEl.value.trim() ||
    (await window.batchApi.getDefaultOutputDir(effectiveInputDir));
  outputDirEl.value = outputDir;

  isRunning = true;
  lastOutputDir = outputDir;
  updateControls();

  for (const row of queueOrder) {
    row.status = 'waiting';
    row.durationMs = undefined;
    row.detail = 'Menunggu giliran...';
    updateRowCells(row);
  }

  try {
    const result = await window.batchApi.startBatch({
      inputDir: effectiveInputDir,
      selectedFiles: selectionMode === 'files' ? selectedFilePaths : undefined,
      outputDir,
      recursive: recursiveCheck.checked,
      mergePdf: mergeCheck.checked,
      mergedFileName: mergedFileNameEl.value.trim() || 'BJ-PDF_Gabungan.pdf',
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
void restorePrefs();
updateControls();
