import { open, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FontCacheStatus } from '../shared/types';

export interface CachedFontStore {
  /** Map from normalized font family/full name -> font file paths on disk */
  familyToPaths: Map<string, string[]>;
  /** All known normalized font family names */
  families: Set<string>;
  /** Core fallback font paths always included */
  corePaths: Set<string>;
  /** Loaded font file bytes cache (path -> Uint8Array) */
  loadedBytes: Map<string, Uint8Array>;
  status: FontCacheStatus;
}

const FONT_EXT = /\.(ttf|ttc|fon|fnt)$/i;

const CORE_FONT_FILE_PREFIXES = [
  'arial',
  'times',
  'cour',
  'tahoma',
  'segoeui',
  'calibri',
  'consola',
  'cambria',
  'verdana',
  'trebuc',
  'symbol',
  'wingding',
  'micross',
  'isocp',
  'isoct',
  'romans',
  'simplex',
  'txt',
];

const KNOWN_WINDOWS_LOGICAL_FACES = new Set([
  'system',
  'fixedsys',
  'terminal',
  'ms sans serif',
  'ms serif',
  'helv',
  'tms rmn',
  'small fonts',
  'courier',
  'modern',
  'roman',
  'script',
  'default',
]);

/**
 * Common AutoCAD / CAD SHX stroke font names mapped to clean technical TrueType fonts
 * when the user does not have a matching TTF installed.
 */
const CAD_FALLBACK_CANDIDATES: Record<string, string[]> = {
  simplex: ['isocpeur', 'consolas', 'arial'],
  romans: ['isocpeur', 'consolas', 'arial'],
  romand: ['isocpeur', 'arial'],
  romanc: ['times new roman', 'arial'],
  romant: ['times new roman', 'arial'],
  txt: ['consolas', 'courier new', 'arial'],
  monotxt: ['consolas', 'courier new'],
  isocp: ['isocpeur', 'consolas', 'arial'],
  isocp2: ['isocpeur', 'consolas', 'arial'],
  isocp3: ['isocpeur', 'consolas', 'arial'],
  isoct: ['isocpeur', 'consolas', 'arial'],
  isoct2: ['isocpeur', 'consolas', 'arial'],
  isoct3: ['isocpeur', 'consolas', 'arial'],
  technic: ['consolas', 'arial'],
  technicbold: ['consolas', 'arial'],
  techniclite: ['consolas', 'arial'],
  complex: ['times new roman', 'arial'],
  italic: ['times new roman', 'arial'],
  italicc: ['times new roman', 'arial'],
  italict: ['times new roman', 'arial'],
};

let cachedStore: CachedFontStore | null = null;
let inflightLoad: Promise<CachedFontStore> | null = null;
let lastFontArrayKey = '';
let lastFontArrayRef: Uint8Array[] = [];

export function getProcessRamMb(): number {
  return Math.round(process.memoryUsage().rss / 1048576);
}

export function normalizeFontName(name: string): string {
  return name
    .trim()
    .replace(/\0/g, '')
    .replace(/\.shx$/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function readUint16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset] << 24) |
      (buf[offset + 1] << 16) |
      (buf[offset + 2] << 8) |
      buf[offset + 3]) >>>
    0
  );
}

function readTag(buf: Uint8Array, offset: number): string {
  return String.fromCharCode(
    buf[offset],
    buf[offset + 1],
    buf[offset + 2],
    buf[offset + 3]
  );
}

function decodeNameString(
  buf: Uint8Array,
  start: number,
  length: number,
  platformId: number
): string {
  if (start < 0 || start + length > buf.length || length <= 0) return '';
  if (platformId === 3 || platformId === 0) {
    let out = '';
    for (let i = 0; i + 1 < length; i += 2) {
      const code = (buf[start + i] << 8) | buf[start + i + 1];
      if (code !== 0) out += String.fromCharCode(code);
    }
    return out;
  }
  let out = '';
  for (let i = 0; i < length; i++) {
    const c = buf[start + i];
    if (c !== 0) out += String.fromCharCode(c);
  }
  return out;
}

async function extractFamiliesFromSfntHandle(
  fh: Awaited<ReturnType<typeof open>>,
  fileSize: number,
  sfntOffset: number,
  out: Set<string>
): Promise<void> {
  if (sfntOffset + 12 > fileSize) return;
  const headerBuf = Buffer.alloc(12);
  await fh.read(headerBuf, 0, 12, sfntOffset);
  const numTables = readUint16BE(headerBuf, 4);
  if (numTables <= 0 || numTables > 128) return;

  const dirLen = numTables * 16;
  if (sfntOffset + 12 + dirLen > fileSize) return;
  const dirBuf = Buffer.alloc(dirLen);
  await fh.read(dirBuf, 0, dirLen, sfntOffset + 12);

  let nameOffset = 0;
  let nameLength = 0;
  for (let i = 0; i < numTables; i++) {
    const rec = i * 16;
    if (readTag(dirBuf, rec) === 'name') {
      nameOffset = readUint32BE(dirBuf, rec + 8);
      nameLength = readUint32BE(dirBuf, rec + 12);
      break;
    }
  }

  if (
    !nameOffset ||
    nameLength < 6 ||
    nameLength > 262144 ||
    nameOffset + nameLength > fileSize
  ) {
    return;
  }

  const nameBuf = Buffer.alloc(nameLength);
  await fh.read(nameBuf, 0, nameLength, nameOffset);

  const count = readUint16BE(nameBuf, 2);
  const stringStorage = readUint16BE(nameBuf, 4);
  if (6 + count * 12 > nameLength) return;

  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12;
    const platformId = readUint16BE(nameBuf, rec);
    const nameId = readUint16BE(nameBuf, rec + 6);
    if (nameId !== 1 && nameId !== 4 && nameId !== 16) continue;
    const length = readUint16BE(nameBuf, rec + 8);
    const offset = readUint16BE(nameBuf, rec + 10);
    const decoded = normalizeFontName(
      decodeNameString(nameBuf, stringStorage + offset, length, platformId)
    );
    if (decoded) out.add(decoded);
  }
}

async function extractFontFamiliesLightweight(filePath: string): Promise<Set<string>> {
  const out = new Set<string>();
  let fh: Awaited<ReturnType<typeof open>> | null = null;
  try {
    fh = await open(filePath, 'r');
    const stat = await fh.stat();
    const fileSize = stat.size;
    if (fileSize < 12) return out;

    const head = Buffer.alloc(12);
    await fh.read(head, 0, 12, 0);
    const tag = readTag(head, 0);

    if (tag === 'ttcf') {
      const numFonts = Math.min(readUint32BE(head, 8), 64);
      if (12 + numFonts * 4 > fileSize) return out;
      const offsetsBuf = Buffer.alloc(numFonts * 4);
      await fh.read(offsetsBuf, 0, numFonts * 4, 12);
      for (let i = 0; i < numFonts; i++) {
        const offset = readUint32BE(offsetsBuf, i * 4);
        await extractFamiliesFromSfntHandle(fh, fileSize, offset, out);
      }
      return out;
    }

    const sfntVersion = readUint32BE(head, 0);
    if (
      sfntVersion === 0x00010000 ||
      tag === 'OTTO' ||
      tag === 'true' ||
      tag === 'typ1'
    ) {
      await extractFamiliesFromSfntHandle(fh, fileSize, 0, out);
    }
  } catch {
    // Ignore unreadable font file
  } finally {
    await fh?.close();
  }
  return out;
}

function getSystemFontDirs(): string[] {
  const winDir = process.env.WINDIR || 'C:\\Windows';
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return [
    path.join(winDir, 'Fonts'),
    path.join(localAppData, 'Microsoft', 'Windows', 'Fonts'),
  ];
}

async function collectFontFilePaths(): Promise<string[]> {
  const dirs = getSystemFontDirs();
  const seen = new Set<string>();
  const result: string[] = [];

  for (const dir of dirs) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile() || !FONT_EXT.test(e.name)) continue;
      const full = path.join(dir, e.name);
      const key = full.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(full);
      }
    }
  }
  return result;
}

/**
 * Indexes all Windows system fonts by reading only their SFNT `name` table headers
 * (~5 MB RAM instead of ~411 MB), then loads full font bytes on demand for used fonts.
 */
export async function ensureSystemFontsLoaded(): Promise<CachedFontStore> {
  if (cachedStore) {
    cachedStore.status.ramMb = getProcessRamMb();
    return cachedStore;
  }
  if (inflightLoad) return inflightLoad;

  inflightLoad = (async () => {
    const start = Date.now();
    try {
      const fontPaths = await collectFontFilePaths();
      const familyToPaths = new Map<string, string[]>();
      const families = new Set<string>(KNOWN_WINDOWS_LOGICAL_FACES);
      const corePaths = new Set<string>();

      for (const fp of fontPaths) {
        const lowerBase = path.basename(fp).toLowerCase();
        // Always include core Windows/CAD TrueType fonts and all lightweight .fon/.fnt raster fonts
        if (
          /\.(fon|fnt)$/i.test(lowerBase) ||
          CORE_FONT_FILE_PREFIXES.some((prefix) => lowerBase.startsWith(prefix))
        ) {
          corePaths.add(fp);
        }

        const extracted = await extractFontFamiliesLightweight(fp);
        for (const fam of extracted) {
          families.add(fam);
          let list = familyToPaths.get(fam);
          if (!list) {
            list = [];
            familyToPaths.set(fam, list);
          }
          if (!list.includes(fp)) {
            list.push(fp);
          }
        }
      }

      const loadTimeMs = Date.now() - start;
      cachedStore = {
        familyToPaths,
        families,
        corePaths,
        loadedBytes: new Map(),
        status: {
          ready: true,
          loading: false,
          fontFileCount: fontPaths.length,
          familyCount: families.size,
          loadTimeMs,
          ramMb: getProcessRamMb(),
        },
      };
      return cachedStore;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const fallback: CachedFontStore = {
        familyToPaths: new Map(),
        families: new Set(KNOWN_WINDOWS_LOGICAL_FACES),
        corePaths: new Set(),
        loadedBytes: new Map(),
        status: {
          ready: false,
          loading: false,
          fontFileCount: 0,
          familyCount: 0,
          loadTimeMs: Date.now() - start,
          ramMb: getProcessRamMb(),
          error: message,
        },
      };
      cachedStore = fallback;
      return fallback;
    } finally {
      inflightLoad = null;
    }
  })();

  return inflightLoad;
}

export function getFontCacheStatus(): FontCacheStatus {
  if (cachedStore) {
    cachedStore.status.ramMb = getProcessRamMb();
    return cachedStore.status;
  }
  return {
    ready: false,
    loading: inflightLoad !== null,
    fontFileCount: 0,
    familyCount: 0,
    loadTimeMs: 0,
    ramMb: getProcessRamMb(),
  };
}

function stripStyleSuffix(norm: string): string {
  return norm
    .replace(/\b(bold|italic|regular|oblique|narrow|black|light|medium|semibold)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isFontAvailable(faceName: string, store: CachedFontStore): boolean {
  const norm = normalizeFontName(faceName);
  if (!norm) return true;
  if (store.families.has(norm)) return true;
  const stripped = stripStyleSuffix(norm);
  return stripped.length > 0 && store.families.has(stripped);
}

/**
 * Resolves a fontfamily fallback map for AutoCAD SHX or missing fonts.
 */
export function buildSmartFontFamilyMap(
  declaredFaces: Array<{ name: string }>,
  store: CachedFontStore
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of declaredFaces) {
    const raw = f.name.trim();
    if (!raw || isFontAvailable(raw, store)) continue;
    const norm = normalizeFontName(raw);
    const candidates = CAD_FALLBACK_CANDIDATES[norm];
    if (candidates) {
      const match = candidates.find((c) => store.families.has(c));
      if (match) {
        map[raw.toLowerCase()] = match;
      }
    }
  }
  return map;
}

/**
 * Loads only the font binaries needed for the given metafile's declared font faces
 * plus core Windows/CAD fallback fonts, keeping a stable array reference when unchanged
 * so `emf-converter`'s WeakMap cache stays warm while keeping RAM usage low.
 */
export async function resolveFontsForConversion(
  declaredFaces: Array<{ name: string }>,
  store: CachedFontStore
): Promise<Uint8Array[]> {
  const neededPaths = new Set<string>(store.corePaths);

  for (const f of declaredFaces) {
    const norm = normalizeFontName(f.name);
    const stripped = stripStyleSuffix(norm);
    for (const key of [norm, stripped]) {
      if (!key) continue;
      const paths = store.familyToPaths.get(key);
      if (paths) {
        for (const p of paths) neededPaths.add(p);
      }
      // Handle 31-char GDI LOGFONT face name truncation or style variants
      for (const [fam, famPaths] of store.familyToPaths.entries()) {
        if (fam.startsWith(key) || (key.length >= 12 && key.startsWith(fam))) {
          for (const p of famPaths) neededPaths.add(p);
        }
      }
    }
    const cadCandidates = CAD_FALLBACK_CANDIDATES[norm];
    if (cadCandidates) {
      for (const cand of cadCandidates) {
        const paths = store.familyToPaths.get(cand);
        if (paths) {
          for (const p of paths) neededPaths.add(p);
        }
      }
    }
  }

  const sortedPaths = Array.from(neededPaths).sort();
  const arrayKey = sortedPaths.join('|');
  if (arrayKey === lastFontArrayKey && lastFontArrayRef.length > 0) {
    return lastFontArrayRef;
  }

  const buffers: Uint8Array[] = [];
  for (const fp of sortedPaths) {
    let bytes = store.loadedBytes.get(fp);
    if (!bytes) {
      try {
        const buf = await readFile(fp);
        bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        store.loadedBytes.set(fp, bytes);
      } catch {
        continue;
      }
    }
    buffers.push(bytes);
  }

  lastFontArrayKey = arrayKey;
  lastFontArrayRef = buffers;
  return buffers;
}
