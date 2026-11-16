export type LogLevel = 'ok' | 'skip' | 'error' | 'warn' | 'info';

export type QueueFileStatus =
  | 'waiting'
  | 'processing'
  | 'ok'
  | 'warn'
  | 'skip'
  | 'error';

export interface ScannedFileEntry {
  fullPath: string;
  relPath: string;
  ext: string;
}

export interface DroppedItemsResolution {
  mode: 'files' | 'folder';
  inputDir: string;
  files?: ScannedFileEntry[];
}

export interface FileStatusUpdate {
  relPath: string;
  format?: string;
  status: QueueFileStatus;
  durationMs?: number;
  detail?: string;
  outputPdfPath?: string;
}

export interface BatchOptions {
  inputDir: string;
  selectedFiles?: string[];
  outputDir: string;
  recursive: boolean;
  mergePdf: boolean;
  mergedFileName?: string;
}

export interface FontCacheStatus {
  ready: boolean;
  loading: boolean;
  fontFileCount: number;
  familyCount: number;
  loadTimeMs: number;
  ramMb: number;
  error?: string;
}

export interface BatchLogEntry {
  level: LogLevel;
  tag: 'OK' | 'SKIP' | 'ERROR' | 'FONT' | 'INFO';
  file?: string;
  message: string;
  timestamp: string;
}

export interface BatchProgress {
  phase: 'scanning' | 'converting' | 'merging' | 'done' | 'cancelled';
  current: number;
  total: number;
  successCount: number;
  skipCount: number;
  errorCount: number;
  missingFontWarnings: number;
  elapsedMs: number;
  etaMs: number | null;
  ramMb: number;
  currentFile?: string;
  mergedOutputPath?: string;
}

export interface BatchResult {
  cancelled: boolean;
  total: number;
  successCount: number;
  skipCount: number;
  errorCount: number;
  missingFontWarnings: number;
  outputDir: string;
  mergedOutputPath?: string;
  elapsedMs: number;
}
