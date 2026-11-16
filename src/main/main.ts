import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { BatchOptions } from '../shared/types';
import { runBatchConversion, scanFolderMetafiles } from './converter';
import { ensureSystemFontsLoaded, getFontCacheStatus } from './fontIndex';

let mainWindow: BrowserWindow | null = null;
let activeAbortController: AbortController | null = null;

const isSmokeTest = process.argv.includes('--smoke-test');

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 580,
    minWidth: 740,
    minHeight: 500,
    show: !isSmokeTest,
    title: 'BJ-Core',
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
  ipcMain.handle('select-folder', async (_event, defaultPath?: string) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Pilih Folder',
      defaultPath: defaultPath || undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('resolve-dropped-path', async (_event, rawPath: string) => {
    if (!rawPath) return null;
    try {
      const info = await stat(rawPath);
      return info.isDirectory() ? rawPath : path.dirname(rawPath);
    } catch {
      return null;
    }
  });

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
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  // Load and cache Windows system fonts immediately when the app starts
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
