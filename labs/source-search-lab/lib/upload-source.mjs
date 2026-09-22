import yauzl from 'yauzl';
import { crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import { GITHUB_LIMITS, excludedPath } from './github-source.mjs';
import { detectLanguage } from './search.mjs';
import { IngestionError, safePath, exclusionRules, excludedByUser } from './ingestion-policy.mjs';

export const UPLOAD_LIMITS = Object.freeze({
  ...GITHUB_LIMITS,
  maxRequestBytes: 4_000_000,
  maxArchiveBytes: 2_900_000,
  maxExtractedBytes: 10_000_000,
  maxEntries: 1_000,
  maxProcessingMs: 20_000,
});

const fail = (code, message, status = 400) => { throw new IngestionError(code, message, status); };
const decoder = new TextDecoder('utf-8', { fatal: true });

export async function ingestUpload(input, { limits = UPLOAD_LIMITS } = {}) {
  const started = Date.now();
  const rules = exclusionRules(input.exclusions);
  const files = [], skipped = [], supportedFilesInTree = [], seen = new Set();
  const incompleteReasons = {}, skippedReasons = {};
  let entries = 0, declaredBytes = 0, extractedBytes = 0, totalBytes = 0, excludedFiles = 0;
  const deadline = () => {
    if (Date.now() - started >= limits.maxProcessingMs) fail('PROCESSING_TIMEOUT', 'Project processing timed out. Upload a smaller project.', 408);
  };
  function skip(path, reason, incomplete = false) {
    skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
    if (incomplete) incompleteReasons[reason] = (incompleteReasons[reason] ?? 0) + 1;
    if (skipped.length < limits.maxSkippedDetails) skipped.push({ path, reason });
  }
  function register(rawPath, size, directory = false) {
    deadline();
    if (++entries > limits.maxEntries) fail('TOO_MANY_FILES', 'The export contains too many entries.', 413);
    const path = safePath(rawPath, directory);
    if (seen.has(path)) fail('DUPLICATE_PATH', 'The export contains duplicate project paths.');
    seen.add(path);
    if (!Number.isSafeInteger(size) || size < 0) fail('INVALID_ARCHIVE', 'Invalid archive size metadata.');
    declaredBytes += size;
    // OWASP requires decompressed-size limits, not only compressed upload limits:
    // https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
    if (declaredBytes > limits.maxExtractedBytes) fail('EXTRACTED_SIZE_LIMIT', 'The expanded project exceeds the size limit.', 413);
    if (directory) return null;
    if (detectLanguage(path) !== 'unknown') supportedFilesInTree.push(path);
    if (excludedByUser(path, rules)) { excludedFiles++; skip(path, 'user_excluded'); return null; }
    if (excludedPath(path) || path.split('/').some(p => ['.git', '.svn', '.hg'].includes(p)) || /\.(min|generated)\.[^.]+$/i.test(path)) {
      skip(path, 'excluded_directory'); return null;
    }
    if (/\.(zip|tar|gz|tgz|bz2|xz|7z|rar)$/i.test(path)) { skip(path, 'nested_archive'); return null; }
    if (detectLanguage(path) === 'unknown') { skip(path, 'unsupported_type'); return null; }
    if (size > limits.maxFileBytes) { skip(path, 'file_too_large', true); return null; }
    return path;
  }
  function accept(path, buffer) {
    deadline();
    if (buffer.includes(0) || buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4]))) { skip(path, 'binary', true); return; }
    let source;
    try { source = decoder.decode(buffer); } catch { skip(path, 'binary', true); return; }
    if (/[\x00-\x08\x0e-\x1f]/.test(source)) { skip(path, 'binary', true); return; }
    files.push({ path, source, bytes: buffer.length, language: detectLanguage(path) });
  }

  if (input.sourceType === 'files') {
    if (!Array.isArray(input.files)) fail('INVALID_FILES', 'Supply a files array containing path and content strings.');
    if (input.files.length > limits.maxEntries) fail('TOO_MANY_FILES', 'The selection contains too many files.', 413);
    for (const file of input.files) {
      if (!file || typeof file.content !== 'string' || (file.type && file.type !== 'file')) fail('INVALID_FILES', 'Only regular files with path and content strings are accepted.');
      const bytes = Buffer.byteLength(file.content, 'utf8');
      const path = register(file.path, bytes);
      if (path) { extractedBytes += bytes; accept(path, Buffer.from(file.content)); }
    }
  } else if (input.sourceType === 'zip') {
    const encoded = input.archiveBase64;
    if (typeof encoded !== 'string' || !encoded.length || encoded.length % 4) fail('INVALID_ARCHIVE', 'Supply a base64-encoded ZIP archive.');
    if (encoded.length > Math.ceil(limits.maxArchiveBytes / 3) * 4) fail('UPLOAD_TOO_LARGE', 'The ZIP exceeds the upload size limit.', 413);
    const archive = Buffer.from(encoded, 'base64');
    if (archive.toString('base64') !== encoded) fail('INVALID_ARCHIVE', 'Supply canonical base64 without a data URL prefix.');
    if (archive.length > limits.maxArchiveBytes) fail('UPLOAD_TOO_LARGE', 'The ZIP exceeds the upload size limit.', 413);
    if (!['504b0304', '504b0506'].includes(archive.subarray(0, 4).toString('hex'))) fail('INVALID_ARCHIVE', 'The upload is not a supported ZIP archive.');
    let zip;
    try {
      // Sequential lazy entry reads and actual decompressed size validation avoid
      // unbounded fan-out: https://github.com/thejoshwolfe/yauzl#readme
      zip = await yauzl.fromBufferPromise(archive, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true });
      if (zip.entryCount > limits.maxEntries) fail('TOO_MANY_FILES', 'The archive contains too many entries.', 413);
      const ranges = [];
      for await (const entry of zip.eachEntry()) {
        deadline();
        const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (mode && mode !== 0x8000 && mode !== 0x4000) fail('UNSAFE_ENTRY', 'Symlinks and special files are not accepted.');
        if ((entry.generalPurposeBitFlag & 0x41) || ![0, 8].includes(entry.compressionMethod)) fail('UNSUPPORTED_ARCHIVE', 'Encrypted or unsupported ZIP entries are not accepted.');
        const directory = entry.fileName.endsWith('/');
        if ((mode === 0x4000 && !directory) || (directory && entry.uncompressedSize !== 0)) fail('INVALID_ARCHIVE', 'Invalid directory entry.');
        const offset = entry.relativeOffsetOfLocalHeader;
        if (!Number.isSafeInteger(offset) || offset < 0 || offset + 30 > archive.length || archive.readUInt32LE(offset) !== 0x04034b50) fail('INVALID_ARCHIVE', 'Invalid ZIP entry header.');
        const end = offset + 30 + archive.readUInt16LE(offset + 26) + archive.readUInt16LE(offset + 28) + entry.compressedSize;
        if (end > archive.length || ranges.some(([a, b]) => offset < b && end > a)) fail('INVALID_ARCHIVE', 'Overlapping or truncated ZIP entries are not accepted.');
        ranges.push([offset, end]);
        if (entry.uncompressedSize > Math.max(1, entry.compressedSize) * 1000) fail('SUSPICIOUS_ARCHIVE', 'The archive has an unsafe compression ratio.');
        const path = register(entry.fileName, entry.uncompressedSize, directory);
        if (!path) continue;
        const stream = await zip.openReadStreamPromise(entry);
        const chunks = [];
        let bytes = 0, checksum = 0;
        try {
          for await (const chunk of stream) {
            deadline(); bytes += chunk.length; extractedBytes += chunk.length;
            if (bytes > limits.maxFileBytes || extractedBytes > limits.maxExtractedBytes) fail('EXTRACTED_SIZE_LIMIT', 'Expanded source exceeds the size limit.', 413);
            checksum = crc32(chunk, checksum); chunks.push(chunk);
          }
        } finally { stream.destroy(); }
        // yauzl deliberately does not check CRCs. Node supplies incremental CRC32:
        // https://nodejs.org/api/zlib.html#zlibcrc32data-value
        if (checksum !== entry.crc32 || bytes !== entry.uncompressedSize) fail('INVALID_ARCHIVE', 'ZIP source integrity check failed.');
        accept(path, Buffer.concat(chunks, bytes));
      }
    } catch (error) {
      if (error instanceof IngestionError) throw error;
      fail('INVALID_ARCHIVE', 'The ZIP is malformed, truncated, or contains unsafe entries.');
    } finally { zip?.close(); }
  } else fail('INVALID_SOURCE_TYPE', 'Choose github, zip, or files.');

  // Stable ordering means the same upload and exclusions select the same files.
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const selected = [];
  for (const file of files) {
    if (selected.length >= limits.maxFiles) { skip(file.path, 'file_limit', true); continue; }
    if (totalBytes + file.bytes > limits.maxTotalBytes) { skip(file.path, 'total_byte_limit', true); continue; }
    selected.push(file); totalBytes += file.bytes;
  }
  const hash = createHash('sha256');
  for (const file of selected) hash.update(JSON.stringify([file.path, file.source]));
  const incomplete = Object.values(incompleteReasons).reduce((a, b) => a + b, 0);
  return {
    source: { type: input.sourceType, transient: true },
    repository: 'Local project', repositoryUrl: null, commit: hash.digest('hex'), commitUrl: null, defaultBranch: null,
    files: selected, skipped, partial: incomplete > 0,
    stats: {
      fetchedFiles: selected.length, fetchedBytes: totalBytes, supportedFilesInTree,
      // A browser selection cannot prove deletion from the whole local project.
      treeComplete: false, treeTruncated: false,
      stoppedForLimit: incomplete > 0, incompleteSupportedFiles: incomplete, incompleteReasons,
      skippedCount: Object.values(skippedReasons).reduce((a, b) => a + b, 0),
      exclusions: rules, excludedFiles,
      ingestion: { entries, declaredBytes, extractedBytes, skippedReasons, selectionComplete: true, empty: selected.length === 0 },
    },
  };
}
