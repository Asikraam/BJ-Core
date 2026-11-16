import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  BatchLogEntry,
  BatchOptions,
  BatchProgress,
  BatchResult,
  DroppedItemsResolution,
  FileStatusUpdate,
  FontCacheStatus,
  ScannedFileEntry,
} from '../shared/types';

export interface BatchApi {
  selectFiles: (defaultPath?: string) => Promise<DroppedItemsResolution | null>;
  selectFolder: (defaultPath?: string) => Promise<string | null>;
  resolveDroppedPaths: (rawPaths: string[]) => Promise<DroppedItemsResolution | null>;
  getPathForFile: (file: File) => string;
  getDefaultOutputDir: (inputDir: string) => Promise<string>;
  scanFolder: (inputDir: string, recursive: boolean) => Promise<ScannedFileEntry[]>;
  getFontStatus: () => Promise<FontCacheStatus>;
  startBatch: (options: BatchOptions) => Promise<BatchResult>;
  cancelBatch: () => Promise<boolean>;
  openFolder: (targetPath: string) => Promise<string>;
  openFile: (filePath: string) => Promise<string>;
  onFontStatus: (cb: (status: FontCacheStatus) => void) => () => void;
  onLog: (cb: (entry: BatchLogEntry) => void) => () => void;
  onProgress: (cb: (progress: BatchProgress) => void) => () => void;
  onFileUpdate: (cb: (update: FileStatusUpdate) => void) => () => void;
}

const api: BatchApi = {
  selectFiles: (defaultPath) => ipcRenderer.invoke('select-files', defaultPath),
  selectFolder: (defaultPath) => ipcRenderer.invoke('select-folder', defaultPath),
  resolveDroppedPaths: (rawPaths) =>
    ipcRenderer.invoke('resolve-dropped-paths', rawPaths),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  getDefaultOutputDir: (inputDir) =>
    ipcRenderer.invoke('get-default-output-dir', inputDir),
  scanFolder: (inputDir, recursive) =>
    ipcRenderer.invoke('scan-folder', inputDir, recursive),
  getFontStatus: () => ipcRenderer.invoke('get-font-status'),
  startBatch: (options) => ipcRenderer.invoke('start-batch', options),
  cancelBatch: () => ipcRenderer.invoke('cancel-batch'),
  openFolder: (targetPath) => ipcRenderer.invoke('open-folder', targetPath),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  onFontStatus: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, status: FontCacheStatus) =>
      cb(status);
    ipcRenderer.on('font-status', listener);
    return () => ipcRenderer.removeListener('font-status', listener);
  },
  onLog: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, entry: BatchLogEntry) =>
      cb(entry);
    ipcRenderer.on('batch-log', listener);
    return () => ipcRenderer.removeListener('batch-log', listener);
  },
  onProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, progress: BatchProgress) =>
      cb(progress);
    ipcRenderer.on('batch-progress', listener);
    return () => ipcRenderer.removeListener('batch-progress', listener);
  },
  onFileUpdate: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, update: FileStatusUpdate) =>
      cb(update);
    ipcRenderer.on('batch-file-update', listener);
    return () => ipcRenderer.removeListener('batch-file-update', listener);
  },
};

contextBridge.exposeInMainWorld('batchApi', api);
