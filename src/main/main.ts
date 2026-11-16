import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { BatchOptions, DroppedItemsResolution } from '../shared/types';
import {
  buildEntriesFromFiles,
  runBatchConversion,
  scanFolderMetafiles,
} from './converter';
import { ensureSystemFontsLoaded, getFontCacheStatus } from './fontIndex';

let mainWindow: BrowserWindow | null = null;
let activeAbortController: AbortController | null = null;

const isSmokeTest = process.argv.includes('--smoke-test');

app.setName('BJ PDF');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.aswal.bj-core');
}

function resolveAppIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    path.join(__dirname, '..', '..', 'build', 'icon.png'),
    path.join(process.resourcesPath || '', 'icon.ico'),
  ];
  return candidates.find((p) => existsSync(p));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 860,
    height: 600,
    minWidth: 760,
    minHeight: 520,
    show: !isSmokeTest,
    title: 'BJ PDF — Ubah Gambar WMF/EMF ke PDF',
    icon: resolveAppIconPath(),
    autoHideMenuBar: true,
    backgroundColor: '#F3F3F3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isSmokeTest) {
    mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
      console.error('SMOKE_FAIL_LOAD', code, desc);
      app.exit(1);
    });
    mainWindow.webContents.on('did-finish-load', async () => {
      try {
        const uiState = await mainWindow!.webContents.executeJavaScript(
          '({ title: document.title, hasApi: typeof window.batchApi === "object", heading: document.querySelector(".panel-title")?.textContent, tableCols: document.querySelectorAll(".queue-table thead th").length })'
        );
        const fonts = await ensureSystemFontsLoaded();
        console.log(
          JSON.stringify({
            smoke: 'PASS',
            uiState,
            fontFileCount: fonts.status.fontFileCount,
            familyCount: fonts.status.familyCount,
            ramMb: fonts.status.ramMb,
          })
        );
        app.exit(0);
      } catch (err) {
        console.error('SMOKE_ERROR', err);
        app.exit(1);
      }
    });
  }

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, '..', '..', 'dist-renderer', 'index.html')
    );
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function warmupSystemFonts(): void {
  void ensureSystemFontsLoaded().then((store) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('font-status', store.status);
    }
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle(
    'select-files',
    async (_event, defaultPath?: string): Promise<DroppedItemsResolution | null> => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Pilih 1 atau Beberapa File Gambar WMF / EMF',
        defaultPath: defaultPath || undefined,
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: 'Gambar WMF / EMF (.wmf, .emf, .wmz, .emz)',
            extensions: ['wmf', 'emf', 'wmz', 'emz'],
          },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const { baseDir, entries } = buildEntriesFromFiles(result.filePaths);
      if (entries.length === 0) return null;
      return {
        mode: 'files',
        inputDir: baseDir,
        files: entries,
      };
    }
  );

  ipcMain.handle('select-folder', async (_event, defaultPath?: string) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Pilih Folder Gambar WMF / EMF',
      defaultPath: defaultPath || undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    'resolve-dropped-paths',
    async (_event, rawPaths: string[]): Promise<DroppedItemsResolution | null> => {
      if (!Array.isArray(rawPaths) || rawPaths.length === 0) return null;
      try {
        const firstStat = await stat(rawPaths[0]);
        if (firstStat.isDirectory()) {
          return {
            mode: 'folder',
            inputDir: rawPaths[0],
          };
        }
        const { baseDir, entries } = buildEntriesFromFiles(rawPaths);
        if (entries.length === 0) return null;
        return {
          mode: 'files',
          inputDir: baseDir,
          files: entries,
        };
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle('get-default-output-dir', (_event, inputDir: string) => {
    if (!inputDir?.trim()) return '';
    return path.join(path.resolve(inputDir), 'PDF_Output');
  });

  ipcMain.handle(
    'scan-folder',
    async (_event, inputDir: string, recursive: boolean) => {
      if (!inputDir?.trim()) return [];
      try {
        return await scanFolderMetafiles(inputDir, recursive);
      } catch {
        return [];
      }
    }
  );

  ipcMain.handle('get-font-status', async () => {
    const status = getFontCacheStatus();
    if (status.ready) return status;
    const store = await ensureSystemFontsLoaded();
    return store.status;
  });

  ipcMain.handle('start-batch', async (_event, options: BatchOptions) => {
    if (activeAbortController) {
      throw new Error('Proses konversi lain sedang berjalan.');
    }

    const controller = new AbortController();
    activeAbortController = controller;

    try {
      return await runBatchConversion(
        options,
        {
          onLog: (entry) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('batch-log', entry);
            }
          },
          onProgress: (progress) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('batch-progress', progress);
            }
          },
          onFileUpdate: (update) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('batch-file-update', update);
            }
          },
        },
        controller.signal
      );
    } finally {
      activeAbortController = null;
    }
  });

  ipcMain.handle('cancel-batch', () => {
    if (!activeAbortController) return false;
    activeAbortController.abort();
    return true;
  });

  ipcMain.handle('open-folder', async (_event, targetPath: string) => {
    if (!targetPath) return 'Path kosong';
    return shell.openPath(path.resolve(targetPath));
  });

  ipcMain.handle('open-file', async (_event, filePath: string) => {
    if (!filePath) return 'File kosong';
    const resolved = path.resolve(filePath);
    if (!existsSync(resolved)) return 'File PDF tidak ditemukan di disk';
    return shell.openPath(resolved);
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  warmupSystemFonts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
