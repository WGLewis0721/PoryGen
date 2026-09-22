import { gunzipSync } from "node:zlib";

const BLOCK = 512;

function readString(buffer, start, length) {
  const end = buffer.indexOf(0, start);
  return buffer.toString("utf8", start, end === -1 || end > start + length ? start + length : end);
}

function readOctal(buffer, start, length) {
  const text = readString(buffer, start, length).trim();
  return text ? parseInt(text, 8) : 0;
}

function parsePax(body) {
  const records = {};
  let offset = 0;
  while (offset < body.length) {
    const space = body.indexOf(0x20, offset);
    if (space === -1) break;
    const length = parseInt(body.toString("utf8", offset, space), 10);
    if (!length) break;
    const record = body.toString("utf8", space + 1, offset + length - 1);
    const eq = record.indexOf("=");
    if (eq > 0) records[record.slice(0, eq)] = record.slice(eq + 1);
    offset += length;
  }
  return records;
}

/**
 * Yields regular files from a (optionally gzipped) tar archive.
 * Supports ustar, pax extended headers and GNU long names — enough for npm
 * tarballs and Python sdists. Never writes to disk.
 */
export function* readTar(input, { maxEntryBytes = Infinity } = {}) {
  const buffer = input[0] === 0x1f && input[1] === 0x8b ? gunzipSync(input) : input;
  let offset = 0;
  let longName = null;
  let pax = null;

  while (offset + BLOCK <= buffer.length) {
    const header = buffer.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;

    const size = readOctal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 0x30);
    const bodyStart = offset + BLOCK;
    const body = buffer.subarray(bodyStart, bodyStart + size);
    offset = bodyStart + Math.ceil(size / BLOCK) * BLOCK;

    if (type === "L") { longName = readString(body, 0, body.length); continue; }
    if (type === "x") { pax = parsePax(body); continue; }
    if (type === "g") continue;

    const prefix = readString(header, 345, 155);
    const name = pax?.path ?? longName ?? (prefix ? `${prefix}/${readString(header, 0, 100)}` : readString(header, 0, 100));
    longName = null;
    pax = null;

    if ((type === "0" || type === "\0" || type === "7") && size <= maxEntryBytes) {
      yield { path: name, size, content: body };
    }
  }
}

/** Strip the single top-level directory npm ("package/") and sdists ("name-1.0/") use. */
export function stripRoot(path) {
  const slash = path.indexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}
