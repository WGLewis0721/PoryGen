export class IngestionError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

export function safePath(value, directory = false) {
  if (typeof value !== 'string' || !value || value.length > 512 ||
      /[\\:\x00-\x1f\x7f]/.test(value) || value.startsWith('/') || value.includes('%')) {
    throw new IngestionError('UNSAFE_PATH', 'Use relative project paths without traversal or encoded separators.');
  }
  const path = directory ? value.replace(/\/$/, '') : value;
  if (path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new IngestionError('UNSAFE_PATH', 'Use relative project paths without traversal or encoded separators.');
  }
  return path.normalize('NFC');
}

// Exact paths / directory prefixes, never user-provided regex or globs.
export function exclusionRules(value = []) {
  if (!Array.isArray(value) || value.length > 100) throw new IngestionError('INVALID_EXCLUSIONS', 'Supply at most 100 relative exclusion paths.');
  return [...new Set(value.map(rule => {
    if (typeof rule !== 'string' || /[*?\[\]{}]/.test(rule)) throw new IngestionError('INVALID_EXCLUSIONS', 'Exclusions are exact paths or folder prefixes, not globs.');
    return safePath(rule, true);
  }))].sort();
}

export const excludedByUser = (path, rules) => rules.some(rule => path === rule || path.startsWith(`${rule}/`));

export function errorResponse(error) {
  const known = error instanceof IngestionError;
  return { status: known ? error.status : 500, payload: {
    error: known ? error.message : 'The project could not be scanned. Try a smaller export.',
    code: known ? error.code : 'SCAN_FAILED',
    retryable: known && ['PROCESSING_TIMEOUT', 'SCAN_BUSY'].includes(error.code),
  } };
}
