/**
 * fb097: `buildStoreZip`/`crc32` (`src/ui/zip-archive.ts`) are the
 * dependency-free STORE-only ZIP writer the GIF-capture control's downloaded
 * archive is built from. Pure unit coverage, no DOM/canvas — proves the
 * writer produces a structurally valid, byte-round-trippable ZIP rather than
 * just "looks plausible": this file implements a minimal reader (STORE-only,
 * matching the writer) that decodes what `buildStoreZip` wrote and checks it
 * lands back at the original bytes/names/CRCs.
 */
import { describe, expect, it } from 'vitest';

import { buildStoreZip, crc32, type ZipEntry } from '../src/ui/zip-archive';

interface DecodedEntry {
  name: string;
  data: Uint8Array;
  crc: number;
}

/** Minimal STORE-only ZIP reader, walking local file headers sequentially. */
function readStoreZip(bytes: Uint8Array): DecodedEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: DecodedEntry[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break; // reached the central directory
    const compression = view.getUint16(offset + 8, true);
    const crc = view.getUint32(offset + 14, true);
    const size = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const data = bytes.slice(dataStart, dataStart + size);
    expect(compression, `${name}: expected STORE (0), got ${compression}`).toBe(0);
    out.push({ name, data, crc });
    offset = dataStart + size;
  }
  return out;
}

async function toUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('fb097: buildStoreZip / crc32', () => {
  it('round-trips a single small entry byte-for-byte', async () => {
    const entries: ZipEntry[] = [{ name: 'frame-000.png', data: new Uint8Array([1, 2, 3, 4, 250, 251, 252, 253]) }];
    const zip = buildStoreZip(entries);
    const decoded = readStoreZip(await toUint8Array(zip));

    expect(decoded).toHaveLength(1);
    expect(decoded[0].name).toBe('frame-000.png');
    expect(Array.from(decoded[0].data)).toEqual(Array.from(entries[0].data));
    expect(decoded[0].crc).toBe(crc32(entries[0].data));
  });

  it('round-trips multiple entries in order, each with a correct CRC', async () => {
    const entries: ZipEntry[] = Array.from({ length: 6 }, (_, i) => ({
      name: `frame-${String(i).padStart(3, '0')}.png`,
      // Distinct content per frame so an ordering/mixup bug would be visible.
      data: new Uint8Array(50).map((_v, j) => (i * 7 + j) % 256),
    }));
    const zip = buildStoreZip(entries);
    const decoded = readStoreZip(await toUint8Array(zip));

    expect(decoded.map((d) => d.name)).toEqual(entries.map((e) => e.name));
    for (let i = 0; i < entries.length; i++) {
      expect(Array.from(decoded[i].data)).toEqual(Array.from(entries[i].data));
      expect(decoded[i].crc).toBe(crc32(entries[i].data));
    }
  });

  it('handles zero entries without throwing (an empty, still-parseable archive)', async () => {
    const zip = buildStoreZip([]);
    const decoded = readStoreZip(await toUint8Array(zip));
    expect(decoded).toEqual([]);
    // Still ends in a real end-of-central-directory record, not a truncated blob.
    const bytes = await toUint8Array(zip);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  });

  it('crc32 disagrees for different content and matches a known reference value', () => {
    // "123456789" -> 0xCBF43926 is the standard CRC-32 (ISO-3309) check value.
    const ref = new TextEncoder().encode('123456789');
    expect(crc32(ref)).toBe(0xcbf43926);
    expect(crc32(ref)).not.toBe(crc32(new TextEncoder().encode('123456780')));
  });

  it('the end-of-central-directory record reports the real entry count and offsets', async () => {
    const entries: ZipEntry[] = [
      { name: 'a.png', data: new Uint8Array([9, 9]) },
      { name: 'b.png', data: new Uint8Array([1]) },
      { name: 'c.png', data: new Uint8Array(0) },
    ];
    const bytes = await toUint8Array(buildStoreZip(entries));
    const view = new DataView(bytes.buffer);
    // Scan backward for the EOCD signature (it has no comment field here, so
    // it is always the last 22 bytes).
    const eocdOffset = bytes.length - 22;
    expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);
    expect(view.getUint16(eocdOffset + 10, true)).toBe(3); // total entries
    const centralOffset = view.getUint32(eocdOffset + 16, true);
    // The central directory must start exactly where the local entries end.
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
  });
});
