// Renders the app icon and a README screenshot with Electron.
// Usage: npm run build:code && npx electron scripts/capture-assets.mjs
import { app, BrowserWindow } from 'electron';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSampleWmf } from '../test/wmf-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'assets');
const buildDir = path.join(root, 'build');

const ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect x="8" y="8" width="240" height="240" rx="52" fill="#005FB8"/>
  <path d="M72 44 H160 L196 80 V212 H72 Z" fill="#FFFFFF"/>
  <path d="M160 44 V80 H196 Z" fill="#B9D4EE"/>
  <text x="134" y="158" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
        font-weight="700" font-size="64" fill="#005FB8">BJ</text>
  <rect x="98" y="176" width="72" height="20" rx="4" fill="#005FB8"/>
  <text x="134" y="191" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
        font-weight="700" font-size="15" fill="#FFFFFF" letter-spacing="1">PDF</text>
</svg>`;

const DEMO_FILES = [
  ['DWG-001_Layout_Dermaga.wmf', 'Arial'],
  ['DWG-002_Potongan_Melintang.wmf', 'Arial'],
  ['DWG-003_Detail_Fender.emf', 'Arial'],
  ['DWG-004_Detail_Bollard.wmf', 'Arial'],
  ['DWG-005_Pondasi_Tiang.wmf', 'ISOCPEUR'],
  ['DWG-006_Penulangan_Pile_Cap.wmf', 'Arial'],
  ['Detail/DTL-01_Sambungan_Balok.wmz', 'Arial'],
  ['Detail/DTL-02_Trestle_Section.wmf', 'Arial'],
  ['Detail/DTL-03_Catatan_Umum.wmf', 'Arial'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function renderIcon() {
  const win = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  const html = `<html><body style="margin:0;background:transparent">${ICON_SVG}</body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await sleep(400);
  const png = (await win.webContents.capturePage()).toPNG();
  await writeFile(path.join(buildDir, 'icon.png'), png);
  await writeFile(path.join(assetsDir, 'icon.png'), png);

  // Build valid 256x256 PNG-backed Windows .ico file
  const icoHeader = Buffer.alloc(22);
  icoHeader.writeUInt16LE(0, 0); // Reserved
  icoHeader.writeUInt16LE(1, 2); // Type 1 = ICO
  icoHeader.writeUInt16LE(1, 4); // 1 image
  icoHeader.writeUInt8(0, 6); // width 256 (0 means 256)
  icoHeader.writeUInt8(0, 7); // height 256 (0 means 256)
  icoHeader.writeUInt8(0, 8); // color palette
  icoHeader.writeUInt8(0, 9); // reserved
  icoHeader.writeUInt16LE(1, 10); // color planes
  icoHeader.writeUInt16LE(32, 12); // bits per pixel
  icoHeader.writeUInt32LE(png.length, 14); // image byte size
  icoHeader.writeUInt32LE(22, 18); // offset of PNG data
  const icoBytes = Buffer.concat([icoHeader, png]);
  await writeFile(path.join(buildDir, 'icon.ico'), icoBytes);

  win.destroy();
  console.log('icon.png & icon.ico', png.length, 'bytes');
}

async function prepareDemoFolder() {
  const demoRoot = path.join(os.tmpdir(), 'BJ-Core_Demo', 'Gambar_WMF');
  await rm(path.dirname(demoRoot), { recursive: true, force: true });
  const { gzipSync } = await import('node:zlib');
  for (const [rel, font] of DEMO_FILES) {
    const full = path.join(demoRoot, rel);
    await mkdir(path.dirname(full), { recursive: true });
    const wmf = buildSampleWmf({ fontName: font, text: path.basename(rel).slice(0, 7) });
    await writeFile(full, rel.endsWith('.wmz') ? gzipSync(wmf) : wmf);
  }
  await writeFile(path.join(demoRoot, 'DWG-007_Rusak.wmf'), Buffer.from('CORRUPTED'));
  return demoRoot;
}

async function captureUi(win, demoDir) {
  win.setContentSize(820 * 2, 580 * 2);
  win.webContents.setZoomFactor(2);
  await sleep(500);
  await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 100 && !document.querySelector('#fontStatusText.ready'); i++) await wait(100);
      const input = document.getElementById('inputDir');
      input.value = ${JSON.stringify(demoDir)};
      input.dispatchEvent(new Event('input'));
      await wait(900);
      document.getElementById('startBtn').click();
      for (let i = 0; i < 300; i++) {
        if (document.getElementById('phaseText').textContent.startsWith('Selesai')) break;
        await wait(100);
      }
      await wait(400);
      document.querySelector('.table-scroll').scrollTop = 0;
      await wait(150);
    })()
  `);
  const png = (await win.webContents.capturePage()).toPNG();
  await writeFile(path.join(assetsDir, 'screenshot.png'), png);
  console.log('screenshot.png', png.length, 'bytes');
}

await mkdir(assetsDir, { recursive: true });
await mkdir(buildDir, { recursive: true });

let started = false;
app.on('browser-window-created', (_event, win) => {
  if (started) return;
  started = true;
  win.webContents.once('did-finish-load', async () => {
    try {
      const demoDir = await prepareDemoFolder();
      await captureUi(win, demoDir);
      await renderIcon();
      app.exit(0);
    } catch (err) {
      console.error(err);
      app.exit(1);
    }
  });
});

await import(path.join(root, 'dist-electron', 'main', 'main.js').replace(/\\/g, '/').replace(/^/, 'file:///'));
