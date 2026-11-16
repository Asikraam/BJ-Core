import { Buffer } from 'node:buffer';

/**
 * Builds a minimal valid Aldus Placeable WMF binary with a rectangle,
 * optional font creation, and text record.
 */
export function buildSampleWmf({ fontName = 'Arial', text = 'DWG-01' } = {}) {
  const records = [];

  const pushRecord = (fn, paramsWords) => {
    const sizeWords = 3 + paramsWords.length;
    const buf = Buffer.alloc(sizeWords * 2);
    buf.writeUInt32LE(sizeWords, 0);
    buf.writeUInt16LE(fn, 4);
    for (let i = 0; i < paramsWords.length; i++) {
      buf.writeUInt16LE(paramsWords[i] & 0xffff, 6 + i * 2);
    }
    records.push(buf);
  };

  // META_SETWINDOWORG (0x020B): y=0, x=0
  pushRecord(0x020b, [0, 0]);
  // META_SETWINDOWEXT (0x020C): y=200, x=400
  pushRecord(0x020c, [200, 400]);

  // META_CREATEFONTINDIRECT (0x02FB): lfHeight(2), lfWidth(2), esc(2), orient(2),
  // weight(2), italic..pitch(8 bytes = 4 words), lfFaceName(32 bytes = 16 words)
  const fontBuf = Buffer.alloc(6 + 18 + 32);
  fontBuf.writeUInt32LE(fontBuf.length / 2, 0);
  fontBuf.writeUInt16LE(0x02fb, 4);
  fontBuf.writeInt16LE(-24, 6); // lfHeight
  fontBuf.writeInt16LE(400, 14); // lfWeight
  fontBuf.write(fontName.slice(0, 31), 24, 'latin1');
  records.push(fontBuf);

  // META_SELECTOBJECT (0x012D): index 0
  pushRecord(0x012d, [0]);

  // META_RECTANGLE (0x041B): bottom, right, top, left
  pushRecord(0x041b, [180, 380, 20, 20]);

  // META_TEXTOUT (0x0521): len, chars (padded to even), y, x
  const textBytes = Buffer.from(text, 'latin1');
  const paddedLen = textBytes.length + (textBytes.length % 2);
  const textRec = Buffer.alloc(6 + 2 + paddedLen + 4);
  textRec.writeUInt32LE(textRec.length / 2, 0);
  textRec.writeUInt16LE(0x0521, 4);
  textRec.writeUInt16LE(textBytes.length, 6);
  textBytes.copy(textRec, 8);
  textRec.writeInt16LE(100, 8 + paddedLen); // y
  textRec.writeInt16LE(50, 10 + paddedLen); // x
  records.push(textRec);

  // META_EOF (0x0000)
  pushRecord(0x0000, []);

  const body = Buffer.concat(records);
  const stdHeader = Buffer.alloc(18);
  stdHeader.writeUInt16LE(1, 0); // memory metafile
  stdHeader.writeUInt16LE(9, 2); // header size in words
  stdHeader.writeUInt16LE(0x0300, 4); // Windows 3.0
  stdHeader.writeUInt32LE((18 + body.length) / 2, 6); // file size in words
  stdHeader.writeUInt16LE(1, 10); // numObjects
  stdHeader.writeUInt32LE(30, 12); // maxRecord
  stdHeader.writeUInt16LE(0, 16); // noParameters

  // Aldus Placeable Header (22 bytes)
  const aldus = Buffer.alloc(22);
  aldus.writeUInt32LE(0x9ac6cdd7, 0); // magic
  aldus.writeUInt16LE(0, 4); // hmf
  aldus.writeInt16LE(0, 6); // left
  aldus.writeInt16LE(0, 8); // top
  aldus.writeInt16LE(400, 10); // right
  aldus.writeInt16LE(200, 12); // bottom
  aldus.writeUInt16LE(96, 14); // inch
  aldus.writeUInt32LE(0, 16); // reserved
  let checksum = 0;
  for (let i = 0; i < 20; i += 2) {
    checksum ^= aldus.readUInt16LE(i);
  }
  aldus.writeUInt16LE(checksum, 20);

  return Buffer.concat([aldus, stdHeader, body]);
}
