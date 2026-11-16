import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { convertMetafileToPdf, getMetafileInfo } from 'emf-converter';
import { PDFDocument } from 'pdf-lib';
import type {
  BatchLogEntry,
  BatchOptions,
  BatchProgress,
  BatchResult,
  FileStatusUpdate,
  ScannedFileEntry,
} from '../shared/types';
import {
  buildSmartFontFamilyMap,
  ensureSystemFontsLoaded,
  getProcessRamMb,
  isFontAvailable,
  resolveFontsForConversion,
  type CachedFontStore,
} from './fontIndex';

export const SUPPORTED_EXTS = new Set(['.wmf', '.emf', '.wmz', '.emz']);
const naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export interface BatchCallbacks {
  onLog: (entry: BatchLogEntry) => void;
  onProgress: (progress: BatchProgress) => void;
  onFileUpdate?: (update: FileStatusUpdate) => void;
}

function nowTimestamp(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

/**
 * Recursively or shallowly collects supported metafile paths sorted naturally.
 */
export async function collectMetafiles(
  dir: string,
  recursive: boolean
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => naturalCollator.compare(a.name, b.name));

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...(await collectMetafiles(fullPath, true)));
      }
      continue;
    }
    if (entry.isFile() && SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Lists supported metafiles with relative paths for UI queue preview.
 */
export async function scanFolderMetafiles(
  dir: string,
  recursive: boolean
): Promise<ScannedFileEntry[]> {
  const resolved = path.resolve(dir);
  const fullPaths = await collectMetafiles(resolved, recursive);
  return fullPaths.map((fullPath) => ({
    fullPath,
    relPath: path.relative(resolved, fullPath),
    ext: path.extname(fullPath).replace('.', '').toUpperCase(),
  }));
}

export function buildEntriesFromFiles(filePaths: string[]): {
  baseDir: string;
  entries: ScannedFileEntry[];
} {
  const valid = filePaths
    .map((p) => path.resolve(p))
    .filter((p) => SUPPORTED_EXTS.has(path.extname(p).toLowerCase()));
  valid.sort((a, b) => naturalCollator.compare(path.basename(a), path.basename(b)));
  const baseDir = valid.length > 0 ? path.dirname(valid[0]) : '';
  const entries: ScannedFileEntry[] = valid.map((fullPath) => ({
    fullPath,
    relPath: path.basename(fullPath),
    ext: path.extname(fullPath).replace('.', '').toUpperCase(),
  }));
  return { baseDir, entries };
}

function findMissingFonts(
  declaredFonts: Array<{ name: string; gdi: boolean; emfPlus: boolean }>,
  store: CachedFontStore
): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const font of declaredFonts) {
    const trimmed = font.name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (!isFontAvailable(trimmed, store)) {
      missing.push(trimmed);
    }
  }
  return missing;
}

/**
 * Merges an ordered list of PDF file paths into a single PDF document using `pdf-lib`.
 */
export async function mergePdfFiles(
  pdfPaths: string[],
  mergedOutPath: string,
  signal?: AbortSignal
): Promise<number> {
  const mergedDoc = await PDFDocument.create();
  let totalPages = 0;

  for (const pdfPath of pdfPaths) {
    if (signal?.aborted) {
      throw new DOMException('Batch cancelled', 'AbortError');
    }
    const bytes = await readFile(pdfPath);
    const srcDoc = await PDFDocument.load(bytes);
    const pages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices());
    for (const page of pages) {
      mergedDoc.addPage(page);
      totalPages++;
    }
  }

  const mergedBytes = await mergedDoc.save();
  await mkdir(path.dirname(mergedOutPath), { recursive: true });
  await writeFile(mergedOutPath, mergedBytes);
  return totalPages;
}

/**
 * Executes batch or single-file conversion of `.wmf`, `.emf`, `.wmz`, and `.emz` files to vector PDF.
 */
export async function runBatchConversion(
  options: BatchOptions,
  callbacks: BatchCallbacks,
  signal?: AbortSignal
): Promise<BatchResult> {
  const startTime = Date.now();
  const isSingleOrMultiFileMode =
    Array.isArray(options.selectedFiles) && options.selectedFiles.length > 0;

  const resolvedInput = isSingleOrMultiFileMode
    ? path.dirname(path.resolve(options.selectedFiles![0]))
    : path.resolve(options.inputDir);

  const resolvedOutput = path.resolve(
    options.outputDir?.trim() || path.join(resolvedInput, 'PDF_Output')
  );

  await mkdir(resolvedOutput, { recursive: true });

  const emitLog = (
    level: BatchLogEntry['level'],
    tag: BatchLogEntry['tag'],
    message: string,
    file?: string
  ) => {
    callbacks.onLog({
      level,
      tag,
      file,
      message,
      timestamp: nowTimestamp(),
    });
  };

  callbacks.onProgress({
    phase: 'scanning',
    current: 0,
    total: 0,
    successCount: 0,
    skipCount: 0,
    errorCount: 0,
    missingFontWarnings: 0,
    elapsedMs: 0,
    etaMs: null,
    ramMb: getProcessRamMb(),
  });

  const fontStore = await ensureSystemFontsLoaded();
  if (fontStore.status.error) {
    emitLog(
      'warn',
      'FONT',
      `Gagal memuat indeks font sistem: ${fontStore.status.error}. Menggunakan font PDF standar.`
    );
  } else {
    emitLog(
      'info',
      'INFO',
      `Indeks font siap (${fontStore.status.fontFileCount} file font Windows, RAM ~${getProcessRamMb()} MB).`
    );
  }

  const files = isSingleOrMultiFileMode
    ? options
        .selectedFiles!.map((p) => path.resolve(p))
        .filter((p) => SUPPORTED_EXTS.has(path.extname(p).toLowerCase()))
    : await collectMetafiles(resolvedInput, options.recursive);

  if (files.length === 0) {
    emitLog(
      'info',
      'INFO',
      'Tidak ditemukan file .wmf, .emf, .wmz, atau .emz untuk dikonversi.'
    );
    const elapsedMs = Date.now() - startTime;
    callbacks.onProgress({
      phase: 'done',
      current: 0,
      total: 0,
      successCount: 0,
      skipCount: 0,
      errorCount: 0,
      missingFontWarnings: 0,
      elapsedMs,
      etaMs: 0,
      ramMb: getProcessRamMb(),
    });
    return {
      cancelled: false,
      total: 0,
      successCount: 0,
      skipCount: 0,
      errorCount: 0,
      missingFontWarnings: 0,
      outputDir: resolvedOutput,
      elapsedMs,
    };
  }

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  let missingFontWarnings = 0;
  let cancelled = false;
  const generatedPdfPaths: string[] = [];
  const conversionStart = Date.now();

  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) {
      cancelled = true;
      break;
    }

    const filePath = files[i];
    const relPath = isSingleOrMultiFileMode
      ? path.basename(filePath)
      : path.relative(resolvedInput, filePath);
    const extUpper = path.extname(filePath).replace('.', '').toUpperCase();
    const baseName = path.basename(filePath, path.extname(filePath));
    const targetSubdir = isSingleOrMultiFileMode
      ? resolvedOutput
      : path.join(resolvedOutput, path.dirname(relPath));
    const targetPdfPath = path.join(targetSubdir, `${baseName}.pdf`);
    const fileStart = Date.now();

    callbacks.onFileUpdate?.({
      relPath,
      format: extUpper,
      status: 'processing',
      detail: 'Sedang mengubah ke PDF...',
    });

    try {
      const buffer = await readFile(filePath);
      const info = await getMetafileInfo(buffer, { maxRecords: 1_000_000 });

      if (!info) {
        skipCount++;
        const msg = 'Bukan file WMF/EMF valid';
        emitLog('skip', 'SKIP', msg, relPath);
        callbacks.onFileUpdate?.({
          relPath,
          format: extUpper,
          status: 'skip',
          durationMs: Date.now() - fileStart,
          detail: msg,
        });
      } else {
        const formatLabel = info.format.toUpperCase();
        let missing: string[] = [];
        if (info.fonts.length > 0 && fontStore.status.ready) {
          missing = findMissingFonts(info.fonts, fontStore);
          if (missing.length > 0) {
            missingFontWarnings++;
            emitLog(
              'warn',
              'FONT',
              `Font belum terpasang: ${missing.join(', ')} (otomatis disesuaikan).`,
              relPath
            );
          }
        }

        const activeFonts = await resolveFontsForConversion(info.fonts, fontStore);
        const fontFamilyMap = buildSmartFontFamilyMap(info.fonts, fontStore);

        // Preserve exact 1:1 physical page size in points (1 px at 96 DPI = 0.75 pt)
        // while rendering internal GDI/hatch grid at 2x HiDPI precision (dpiScale: 2).
        const pageWidthPt = Math.max(1, info.width * 0.75);
        const pageHeightPt = Math.max(1, info.height * 0.75);

        const pdfBytes = await convertMetafileToPdf(buffer, {
          fonts: activeFonts,
          fontFamilyMap,
          dpiScale: 2,
          maxCanvasDimension: 16384,
          maxRecords: 1_000_000,
          pageSize: { width: pageWidthPt, height: pageHeightPt },
          compress: true,
          gdiAntialias: true,
          exactRasterOps: true,
          imageResampling: 'renderer',
          fontSmoothing: 'cleartype',
          title: baseName,
          signal,
        });

        if (!pdfBytes) {
          errorCount++;
          const msg = 'Konversi gagal (hasil kosong)';
          emitLog('error', 'ERROR', msg, relPath);
          callbacks.onFileUpdate?.({
            relPath,
            format: formatLabel,
            status: 'error',
            durationMs: Date.now() - fileStart,
            detail: msg,
          });
        } else {
          await mkdir(targetSubdir, { recursive: true });
          await writeFile(targetPdfPath, pdfBytes);
          generatedPdfPaths.push(targetPdfPath);
          successCount++;
          const durationMs = Date.now() - fileStart;
          const okDetail =
            missing.length > 0
              ? `Selesai -> ${path.basename(targetPdfPath)} (Font disesuaikan: ${missing.join(', ')})`
              : `Selesai -> ${path.basename(targetPdfPath)} (${info.width}x${info.height} px)`;
          emitLog('ok', 'OK', okDetail, relPath);
          callbacks.onFileUpdate?.({
            relPath,
            format: formatLabel,
            status: missing.length > 0 ? 'warn' : 'ok',
            durationMs,
            detail: okDetail,
          });
        }
      }
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        cancelled = true;
        callbacks.onFileUpdate?.({
          relPath,
          format: extUpper,
          status: 'waiting',
          detail: 'Dibatalkan',
        });
        break;
      }
      errorCount++;
      const msg = err instanceof Error ? err.message : String(err);
      emitLog('error', 'ERROR', msg, relPath);
      callbacks.onFileUpdate?.({
        relPath,
        format: extUpper,
        status: 'error',
        durationMs: Date.now() - fileStart,
        detail: msg,
      });
    }

    const doneCount = i + 1;
    const elapsedConv = Date.now() - conversionStart;
    const avgPerFile = elapsedConv / doneCount;
    const remaining = files.length - doneCount;
    const etaMs = remaining > 0 ? Math.round(avgPerFile * remaining) : 0;

    callbacks.onProgress({
      phase: 'converting',
      current: doneCount,
      total: files.length,
      successCount,
      skipCount,
      errorCount,
      missingFontWarnings,
      elapsedMs: Date.now() - startTime,
      etaMs,
      ramMb: getProcessRamMb(),
      currentFile: relPath,
    });
  }

  let mergedOutputPath: string | undefined;

  if (!cancelled && options.mergePdf && generatedPdfPaths.length > 0) {
    const mergedName =
      options.mergedFileName?.trim() || 'BJ-PDF_Gabungan.pdf';
    const safeMergedName = mergedName.toLowerCase().endsWith('.pdf')
      ? mergedName
      : `${mergedName}.pdf`;
    mergedOutputPath = path.join(resolvedOutput, safeMergedName);

    callbacks.onProgress({
      phase: 'merging',
      current: files.length,
      total: files.length,
      successCount,
      skipCount,
      errorCount,
      missingFontWarnings,
      elapsedMs: Date.now() - startTime,
      etaMs: null,
      ramMb: getProcessRamMb(),
      currentFile: safeMergedName,
    });

    try {
      const totalPages = await mergePdfFiles(
        generatedPdfPaths,
        mergedOutputPath,
        signal
      );
      emitLog(
        'ok',
        'OK',
        `Gabungan PDF selesai: ${safeMergedName} (${totalPages} halaman).`
      );
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        cancelled = true;
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        emitLog('error', 'ERROR', `Gagal menggabungkan PDF: ${msg}`);
        mergedOutputPath = undefined;
      }
    }
  }

  const totalElapsed = Date.now() - startTime;
  callbacks.onProgress({
    phase: cancelled ? 'cancelled' : 'done',
    current: cancelled ? successCount + skipCount + errorCount : files.length,
    total: files.length,
    successCount,
    skipCount,
    errorCount,
    missingFontWarnings,
    elapsedMs: totalElapsed,
    etaMs: 0,
    ramMb: getProcessRamMb(),
    mergedOutputPath,
  });

  return {
    cancelled,
    total: files.length,
    successCount,
    skipCount,
    errorCount,
    missingFontWarnings,
    outputDir: resolvedOutput,
    mergedOutputPath,
    elapsedMs: totalElapsed,
  };
}
