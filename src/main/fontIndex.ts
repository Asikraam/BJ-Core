import { loadSystemFonts } from 'emf-converter';
import type { FontCacheStatus } from '../shared/types';

export interface CachedFontStore {
  fonts: Uint8Array[];
  families: Set<string>;
  status: FontCacheStatus;
}

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

let cachedStore: CachedFontStore | null = null;
let inflightLoad: Promise<CachedFontStore> | null = null;

/**
 * Normalizes a Windows font face name for case-insensitive lookup.
 */
export function normalizeFontName(name: string): string {
  return name.trim().replace(/\0/g, '').replace(/\s+/g, ' ').toLowerCase();
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

function extractFamiliesFromSfnt(
  buf: Uint8Array,
  sfntOffset: number,
  out: Set<string>
): void {
  if (sfntOffset + 12 > buf.length) return;
  const numTables = readUint16BE(buf, sfntOffset + 4);
  const tableDirStart = sfntOffset + 12;
  if (tableDirStart + numTables * 16 > buf.length) return;

  let nameOffset = 0;
  let nameLength = 0;
  for (let i = 0; i < numTables; i++) {
    const rec = tableDirStart + i * 16;
    if (readTag(buf, rec) === 'name') {
      nameOffset = readUint32BE(buf, rec + 8);
      nameLength = readUint32BE(buf, rec + 12);
      break;
    }
  }
  if (!nameOffset || nameOffset + 6 > buf.length || nameOffset + nameLength > buf.length) {
    return;
  }

  const count = readUint16BE(buf, nameOffset + 2);
  const stringStorage = nameOffset + readUint16BE(buf, nameOffset + 4);
  const recordsStart = nameOffset + 6;
  if (recordsStart + count * 12 > buf.length) return;

  for (let i = 0; i < count; i++) {
    const rec = recordsStart + i * 12;
    const platformId = readUint16BE(buf, rec);
    const nameId = readUint16BE(buf, rec + 6);
    // NameID 1 = Font Family, NameID 4 = Full Font Name, NameID 16 = Typographic Family
    if (nameId !== 1 && nameId !== 16 && nameId !== 4) continue;
    const length = readUint16BE(buf, rec + 8);
    const offset = readUint16BE(buf, rec + 10);
    const decoded = normalizeFontName(
      decodeNameString(buf, stringStorage + offset, length, platformId)
    );
    if (decoded) out.add(decoded);
  }
}

function extractFontFamilies(buf: Uint8Array, out: Set<string>): void {
  if (buf.length < 12) return;
  const tag = readTag(buf, 0);

  if (tag === 'ttcf') {
    const numFonts = readUint32BE(buf, 8);
    const maxFonts = Math.min(numFonts, 128);
    if (12 + maxFonts * 4 > buf.length) return;
    for (let i = 0; i < maxFonts; i++) {
      const offset = readUint32BE(buf, 12 + i * 4);
      extractFamiliesFromSfnt(buf, offset, out);
    }
    return;
  }

  const sfntVersion = readUint32BE(buf, 0);
  if (
    sfntVersion === 0x00010000 ||
    tag === 'OTTO' ||
    tag === 'true' ||
    tag === 'typ1'
  ) {
    extractFamiliesFromSfnt(buf, 0, out);
  }
}

/**
 * Loads and caches all Windows system fonts via `emf-converter`'s `loadSystemFonts()`,
 * building an index of installed family names for pre-conversion validation.
 */
export async function ensureSystemFontsLoaded(): Promise<CachedFontStore> {
  if (cachedStore) return cachedStore;
  if (inflightLoad) return inflightLoad;

  inflightLoad = (async () => {
    const start = Date.now();
    try {
      const fonts = await loadSystemFonts();
      const families = new Set<string>(KNOWN_WINDOWS_LOGICAL_FACES);
      for (const fontBytes of fonts) {
        extractFontFamilies(fontBytes, families);
      }

      const loadTimeMs = Date.now() - start;
      cachedStore = {
        fonts,
        families,
        status: {
          ready: true,
          loading: false,
          fontFileCount: fonts.length,
          familyCount: families.size,
          loadTimeMs,
        },
      };
      return cachedStore;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const fallback: CachedFontStore = {
        fonts: [],
        families: new Set(KNOWN_WINDOWS_LOGICAL_FACES),
        status: {
          ready: false,
          loading: false,
          fontFileCount: 0,
          familyCount: 0,
          loadTimeMs: Date.now() - start,
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
  if (cachedStore) return cachedStore.status;
  return {
    ready: false,
    loading: inflightLoad !== null,
    fontFileCount: 0,
    familyCount: 0,
    loadTimeMs: 0,
  };
}

/**
 * Checks whether a font face declared in a metafile matches any loaded Windows system font.
 */
export function isFontAvailable(faceName: string, store: CachedFontStore): boolean {
  const norm = normalizeFontName(faceName);
  if (!norm) return true;
  if (store.families.has(norm)) return true;

  // Handle common style suffixes embedded in GDI face names (e.g. "Arial Bold")
  const stripped = norm
    .replace(/\b(bold|italic|regular|oblique|narrow|black|light|medium|semibold)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > 0 && store.families.has(stripped);
}
