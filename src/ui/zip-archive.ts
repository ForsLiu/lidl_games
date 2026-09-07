/**
 * fb097: a minimal, dependency-free ZIP writer (STORE method only — no
 * compression), so a dev-only capture control can bundle several PNG frames
 * into one downloadable file without adding a new npm dependency. fb097's own
 * acceptance line explicitly allows "a downloadable frame-sequence archive"
 * as a substitute for a real GIF encoder when one is "judged too heavy a
 * dependency for this item" — a hand-rolled STORE-only ZIP is a handful of
 * well-documented, easily-verified primitives (CRC-32, local file headers, a
 * central directory, one end-of-central-directory record) rather than a
 * codec, so it stays inside that judgment without pulling in a library.
 *
 * Deliberately STORE (no DEFLATE): compression needs either a library or a
 * hand-rolled codec, neither of which this item's own scope calls for — the
 * frames are already PNG-compressed, so re-compressing the archive around
 * them would buy little anyway.
 */

/** Standard reflected CRC-32 (ISO 3309 / ITU-T V.42, ZIP's own checksum). */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/**
 * MS-DOS date/time (the ZIP format's own timestamp encoding), fixed to
 * 1980-01-01 00:00:00 — the earliest date the format can represent at all
 * (a literal `0` for both fields, tried first, decodes as the invalid
 * "month 0, day 0" per the field's own bit layout; confirmed against
 * Python's `zipfile` module, which reads it back as `(1980, 0, 0, 0, 0, 0)`).
 * There is no real capture clock worth encoding here (a dev-only tool's
 * download filename already carries `Date.now()`), so a fixed valid
 * placeholder is enough — date = ((1980-1980)<<9)|(1<<5)|1, time = 0.
 */
const DOS_DATE_1980_01_01 = 0x0021;
const DOS_TIME_MIDNIGHT = 0x0000;

/**
 * Builds a STORE-only (uncompressed) ZIP archive from in-memory entries, per
 * the PKZIP APPNOTE's local-file-header / central-directory-header /
 * end-of-central-directory layout. No streaming, no zip64 — every frame this
 * control captures is small (a downscaled canvas PNG) and the archive as a
 * whole stays well under the 4GiB/64k-entry limits those extensions exist
 * for, so the plain 32-bit fields are enough.
 */
export function buildStoreZip(entries: ZipEntry[]): Blob {
  const parts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;
  const encoder = new TextEncoder();

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const localHeader = new Uint8Array([
      ...u32(0x04034b50), // local file header signature
      ...u16(20), // version needed to extract
      ...u16(0), // general purpose bit flag
      ...u16(0), // compression method: 0 = STORE
      ...u16(DOS_TIME_MIDNIGHT),
      ...u16(DOS_DATE_1980_01_01),
      ...u32(crc),
      ...u32(size), // compressed size == uncompressed size (STORE)
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0), // extra field length
    ]);
    // `Uint8Array<ArrayBufferLike>` (this lib's default generic) isn't
    // assignable to `BlobPart` (which wants `ArrayBufferView<ArrayBuffer>`
    // specifically, excluding SharedArrayBuffer-backed views) — every buffer
    // here genuinely is a plain ArrayBuffer, so a cast is honest, not a
    // type-safety hole.
    parts.push(localHeader, nameBytes as BlobPart, entry.data as BlobPart);

    const centralHeader = new Uint8Array([
      ...u32(0x02014b50), // central file header signature
      ...u16(20), // version made by
      ...u16(20), // version needed to extract
      ...u16(0), // general purpose bit flag
      ...u16(0), // compression method: 0 = STORE
      ...u16(DOS_TIME_MIDNIGHT),
      ...u16(DOS_DATE_1980_01_01),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0), // extra field length
      ...u16(0), // file comment length
      ...u16(0), // disk number start
      ...u16(0), // internal file attributes
      ...u32(0), // external file attributes
      ...u32(offset), // relative offset of local header
    ]);
    centralParts.push(centralHeader, nameBytes as BlobPart);

    offset += localHeader.length + nameBytes.length + size;
  }

  const centralSize = centralParts.reduce((sum, p) => sum + (p as Uint8Array | string).length, 0);
  const centralOffset = offset;

  const eocd = new Uint8Array([
    ...u32(0x06054b50), // end of central directory signature
    ...u16(0), // this disk number
    ...u16(0), // disk with central directory start
    ...u16(entries.length), // entries on this disk
    ...u16(entries.length), // total entries
    ...u32(centralSize),
    ...u32(centralOffset),
    ...u16(0), // comment length
  ]);

  return new Blob([...parts, ...centralParts, eocd], { type: 'application/zip' });
}
