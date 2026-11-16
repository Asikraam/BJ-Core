import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { runBatchConversion } from '../dist-electron/main/converter.js';
import { buildSampleWmf } from './wmf-fixture.mjs';

async function main() {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'wmf2pdf-test-'));
  const inputDir = path.join(tmpRoot, 'src');
  const subDir = path.join(inputDir, 'sub');
  const outputDir = path.join(tmpRoot, 'out');
  await mkdir(subDir, { recursive: true });

  try {
    const validWmf = buildSampleWmf({ fontName: 'Arial', text: 'SHEET-1' });
    const missingFontWmf = buildSampleWmf({
      fontName: 'NonExistentDrafterFont999',
      text: 'SHEET-2',
    });
    const wmz = gzipSync(validWmf);
    const corrupt = Buffer.from('NOT_A_METAFILE_HEADER');

    await writeFile(path.join(inputDir, '01_plan.wmf'), validWmf);
    await writeFile(path.join(inputDir, '02_bad.wmf'), corrupt);
    await writeFile(path.join(subDir, '03_detail.wmz'), wmz);
    await writeFile(path.join(subDir, '04_missing_font.wmf'), missingFontWmf);

    const logs = [];
    const progressEvents = [];

    const result = await runBatchConversion(
      {
        inputDir,
        outputDir,
        recursive: true,
        mergePdf: true,
        mergedFileName: '_Merged_Test.pdf',
      },
      {
        onLog: (entry) => logs.push(entry),
        onProgress: (p) => progressEvents.push(p),
      }
    );

    assert.equal(result.cancelled, false);
    assert.equal(result.total, 4);
    assert.equal(result.successCount, 3);
    assert.equal(result.skipCount, 1);
    assert.equal(result.errorCount, 0);
    assert.ok(result.missingFontWarnings >= 1, 'Expected missing font warning');
    assert.ok(result.mergedOutputPath, 'Expected merged PDF path');

    const pdf1 = await readFile(path.join(outputDir, '01_plan.pdf'));
    const pdf3 = await readFile(path.join(outputDir, 'sub', '03_detail.pdf'));
    const mergedBytes = await readFile(result.mergedOutputPath);

    assert.equal(pdf1.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.equal(pdf3.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.equal(mergedBytes.subarray(0, 5).toString('ascii'), '%PDF-');

    const mergedDoc = await PDFDocument.load(mergedBytes);
    assert.equal(mergedDoc.getPageCount(), 3);

    const fontWarn = logs.find(
      (l) => l.tag === 'FONT' && l.message.includes('NonExistentDrafterFont999')
    );
    assert.ok(fontWarn, 'Expected [FONT] log mentioning NonExistentDrafterFont999');

    const skipLog = logs.find((l) => l.tag === 'SKIP' && l.file?.includes('02_bad.wmf'));
    assert.ok(skipLog, 'Expected [SKIP] log for corrupt file');

    console.log('ALL TESTS PASSED:', {
      total: result.total,
      success: result.successCount,
      skip: result.skipCount,
      missingFontWarnings: result.missingFontWarnings,
      mergedPages: mergedDoc.getPageCount(),
    });
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
