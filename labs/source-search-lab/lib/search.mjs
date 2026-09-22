const JS_KEYWORDS = new Set([
  "function","return","if","else","for","while","do","switch","case","break","continue",
  "class","extends","new","this","super","try","catch","finally","throw","const","let","var",
  "import","export","default","from","async","await","yield","typeof","instanceof","in","of",
  "delete","void","null","undefined","true","false","static","get","set",
]);

const TS_KEYWORDS = new Set([
  ...JS_KEYWORDS,
  "interface","type","enum","implements","public","private","protected","readonly","namespace",
  "declare","as","is","keyof","infer","abstract","satisfies",
]);

const PY_KEYWORDS = new Set([
  "def","return","if","elif","else","for","while","break","continue","class","try","except",
  "finally","raise","import","from","as","with","lambda","yield","async","await","in","is",
  "not","and","or","pass","global","nonlocal","assert","del","None","True","False","self",
]);

const JS_TOKEN_PATTERN =
  /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[A-Za-z_$][A-Za-z0-9_$]*|\b\d+(?:\.\d+)?\b|[A-Za-z_$][A-Za-z0-9_$]*|=>|===|!==|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|\*\*|\.\.\.|[{}()[\];,.:?=<>+\-*/%&|!^~]/g;

const PY_TOKEN_PATTERN =
  /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|#[^\n]*|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*|==|!=|<=|>=|\*\*|\/\/|:=|\.\.\.|[{}()[\];,.:?=<>+\-*/%&|!^~]/g;

const PUNCTUATION = new Set([
  "{","}","(",")","[","]",";",",",".",":","?","=>","=","==","===","!=","!==","<",">",
  "<=",">=","+","-","*","/","%","&&","||","!","&","|","^","~","++","--","+=","-=","*=",
  "/=","**","//",":=","...",
]);

export const DEFAULT_SETTINGS = Object.freeze({
  shingleSize: 7,
  winnowWindow: 4,
  regionTokens: 120,
  regionStride: 60,
  shortlist: 20,
  minMatchedTokens: 24,
  minContiguousTokens: 12,
  minSmallerCoverage: 0.60,
  possibleMatchedTokens: 12,
  possibleContiguousTokens: 7,
  possibleSmallerCoverage: 0.35,
  commonFingerprintRatio: 0.60,
});

export function detectLanguage(path) {
  const lower = path.toLowerCase();
  if (/\.(ts|tsx|mts|cts)$/.test(lower)) return "typescript";
  if (/\.(js|jsx|mjs|cjs)$/.test(lower)) return "javascript";
  if (lower.endsWith(".py")) return "python";
  return "unknown";
}

export function languagesCompatible(a, b) {
  if (a === b) return true;
  const aJsFamily = a === "javascript" || a === "typescript";
  const bJsFamily = b === "javascript" || b === "typescript";
  return aJsFamily && bJsFamily;
}

function keywordSet(language) {
  if (language === "typescript") return TS_KEYWORDS;
  if (language === "python") return PY_KEYWORDS;
  return JS_KEYWORDS;
}

export function tokenizeSource(source, language, { normalizeIdentifiers = false } = {}) {
  const keywords = keywordSet(language);
  const pattern = language === "python" ? PY_TOKEN_PATTERN : JS_TOKEN_PATTERN;
  const tokens = [];
  let line = 1;
  let lastIndex = 0;
  pattern.lastIndex = 0;

  for (let match; (match = pattern.exec(source)); ) {
    for (let i = lastIndex; i < match.index; i++) {
      if (source.charCodeAt(i) === 10) line += 1;
    }
    lastIndex = pattern.lastIndex;

    const raw = match[0];
    const startLine = line;
    const newlines = raw.match(/\n/g);
    if (newlines) line += newlines.length;

    const isJsComment = language !== "python" && (raw.startsWith("//") || raw.startsWith("/*"));
    const isPyComment = language === "python" && raw.startsWith("#");
    if (isJsComment || isPyComment) continue;

    const isLiteral =
      raw[0] === '"' ||
      raw[0] === "'" ||
      raw[0] === "`" ||
      /^\d/.test(raw);

    if (isLiteral) {
      tokens.push({
        kind: normalizeIdentifiers ? "LIT" : `lit:${raw}`,
        line: startLine,
      });
      continue;
    }

    if (PUNCTUATION.has(raw)) {
      tokens.push({ kind: raw, line: startLine });
      continue;
    }

    if (keywords.has(raw)) {
      tokens.push({ kind: `kw:${raw}`, line: startLine });
      continue;
    }

    tokens.push({ kind: normalizeIdentifiers ? "ID" : `id:${raw}`, line: startLine });
  }

  return tokens;
}

export function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function hashShingles(tokens, k = DEFAULT_SETTINGS.shingleSize) {
  if (tokens.length < k) return [];
  const result = [];
  for (let i = 0; i <= tokens.length - k; i++) {
    let gram = "";
    for (let j = 0; j < k; j++) gram += tokens[i + j].kind + "\u0001";
    result.push({ hash: fnv1a(gram), position: i });
  }
  return result;
}

export function winnow(shingles, windowSize = DEFAULT_SETTINGS.winnowWindow) {
  if (shingles.length === 0) return [];
  if (shingles.length <= windowSize) {
    let best = 0;
    for (let i = 1; i < shingles.length; i++) {
      if (shingles[i].hash <= shingles[best].hash) best = i;
    }
    return [shingles[best]];
  }

  const fingerprints = [];
  let lastPosition = -1;
  for (let start = 0; start <= shingles.length - windowSize; start++) {
    let best = start;
    for (let i = start + 1; i < start + windowSize; i++) {
      if (shingles[i].hash <= shingles[best].hash) best = i;
    }
    if (shingles[best].position !== lastPosition) {
      fingerprints.push(shingles[best]);
      lastPosition = shingles[best].position;
    }
  }
  return fingerprints;
}

export function fingerprintTokens(tokens, settings = DEFAULT_SETTINGS) {
  return winnow(hashShingles(tokens, settings.shingleSize), settings.winnowWindow);
}

function addPosting(postings, hash, docId, position) {
  const key = String(hash);
  if (!postings[key]) postings[key] = [];
  postings[key].push([docId, position]);
}

export function buildReferenceIndex(documents, settings = DEFAULT_SETTINGS) {
  const postings = { preserving: {}, normalized: {} };
  const indexedDocuments = [];

  for (const document of documents) {
    const preservingTokens = tokenizeSource(document.source, document.language);
    const normalizedTokens = tokenizeSource(document.source, document.language, { normalizeIdentifiers: true });
    const preservingFingerprints = fingerprintTokens(preservingTokens, settings);
    const normalizedFingerprints = fingerprintTokens(normalizedTokens, settings);

    for (const fp of preservingFingerprints) addPosting(postings.preserving, fp.hash, document.id, fp.position);
    for (const fp of normalizedFingerprints) addPosting(postings.normalized, fp.hash, document.id, fp.position);

    indexedDocuments.push({
      id: document.id,
      repository: document.repository,
      commit: document.commit,
      path: document.path,
      language: document.language,
      license: document.license ?? "Unknown",
      licenseUrl: document.licenseUrl ?? null,
      sourceUrl: document.sourceUrl,
      source: document.source,
      tokens: {
        preserving: preservingTokens,
        normalized: normalizedTokens,
      },
    });
  }

  return {
    version: 2,
    builtAt: new Date().toISOString(),
    settings: { ...settings },
    coverage: {
      repositories: [...new Set(indexedDocuments.map((d) => d.repository))],
      files: indexedDocuments.length,
      languages: [...new Set(indexedDocuments.map((d) => d.language))],
      claim: `This lab searches only ${indexedDocuments.length} pinned files from ${new Set(indexedDocuments.map((d) => d.repository)).size} documented public repositories.`,
    },
    documents: indexedDocuments,
    postings,
  };
}

function uniqueDocumentFrequency(postings) {
  return new Set(postings.map(([docId]) => docId)).size;
}

function regionStarts(length, windowSize, stride) {
  if (length <= windowSize) return [0];
  const starts = [];
  for (let start = 0; start < length; start += stride) {
    if (start + windowSize >= length) break;
    starts.push(start);
  }
  const last = Math.max(0, length - windowSize);
  if (starts[starts.length - 1] !== last) starts.push(last);
  return starts;
}

export function makeRegions(source, path, language, settings = DEFAULT_SETTINGS) {
  const preserving = tokenizeSource(source, language);
  const normalized = tokenizeSource(source, language, { normalizeIdentifiers: true });
  if (preserving.length === 0) return [];

  return regionStarts(preserving.length, settings.regionTokens, settings.regionStride).map((start, index) => {
    const end = Math.min(preserving.length, start + settings.regionTokens);
    const p = preserving.slice(start, end);
    const n = normalized.slice(start, end);
    return {
      id: `${path}:${index}`,
      path,
      language,
      tokenStart: start,
      tokenEnd: end - 1,
      lineStart: p[0]?.line ?? 1,
      lineEnd: p[p.length - 1]?.line ?? 1,
      shortRegion: p.length < settings.minMatchedTokens,
      preserving: p,
      normalized: n,
      fingerprints: {
        preserving: fingerprintTokens(p, settings),
        normalized: fingerprintTokens(n, settings),
      },
    };
  });
}

export function retrieveCandidates(region, index, settings = DEFAULT_SETTINGS) {
  const compatibleDocIds = new Set(
    index.documents
      .filter((doc) => languagesCompatible(region.language, doc.language))
      .map((doc) => doc.id),
  );
  const totalDocs = Math.max(1, compatibleDocIds.size);
  const candidates = new Map();

  for (const representation of ["preserving", "normalized"]) {
    const seenQueryHashes = new Set();
    for (const fp of region.fingerprints[representation]) {
      if (seenQueryHashes.has(fp.hash)) continue;
      seenQueryHashes.add(fp.hash);

      const rawPostings = index.postings[representation][String(fp.hash)] ?? [];
      if (rawPostings.length === 0) continue;

      const postingsByDoc = new Map();
      for (const [docId, position] of rawPostings) {
        if (!compatibleDocIds.has(docId)) continue;
        let positions = postingsByDoc.get(docId);
        if (!positions) postingsByDoc.set(docId, (positions = []));
        positions.push(position);
      }
      if (postingsByDoc.size === 0) continue;

      const df = postingsByDoc.size;
      const commonRatio = df / totalDocs;
      const idf = Math.log((totalDocs + 1) / (df + 1)) + 1;
      const weight = commonRatio >= settings.commonFingerprintRatio ? idf * 0.20 : idf;

      for (const [docId, positions] of postingsByDoc) {
        let candidate = candidates.get(docId);
        if (!candidate) {
          candidate = {
            docId,
            score: 0,
            preservingScore: 0,
            normalizedScore: 0,
            matchedHashes: 0,
            commonHashes: 0,
            positions: { preserving: [], normalized: [] },
          };
          candidates.set(docId, candidate);
        }

        // A query fingerprint contributes at most once per candidate document.
        // Repeated occurrences are retained only as location evidence.
        candidate.score += weight;
        candidate[`${representation}Score`] += weight;
        candidate.matchedHashes += 1;
        if (commonRatio >= settings.commonFingerprintRatio) candidate.commonHashes += 1;
        candidate.positions[representation].push(...positions);
      }
    }
  }

  return [...candidates.values()]
    .map((candidate) => ({
      ...candidate,
      commonFingerprintRatio: candidate.matchedHashes === 0 ? 0 : candidate.commonHashes / candidate.matchedHashes,
    }))
    .sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId))
    .slice(0, settings.shortlist);
}

function lcsLength(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  const previous = new Uint16Array(b.length + 1);
  const current = new Uint16Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    current.fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1].kind === b[j - 1].kind) {
        current[j] = previous[j - 1] + 1;
      } else {
        current[j] = Math.max(previous[j], current[j - 1]);
      }
    }
    previous.set(current);
  }
  return previous[b.length];
}

function longestCommonContiguous(a, b) {
  if (a.length === 0 || b.length === 0) return { length: 0, aStart: 0, bStart: 0 };
  const previous = new Uint16Array(b.length + 1);
  const current = new Uint16Array(b.length + 1);
  let bestLength = 0;
  let bestAEnd = 0;
  let bestBEnd = 0;

  for (let i = 1; i <= a.length; i++) {
    current.fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1].kind === b[j - 1].kind) {
        current[j] = previous[j - 1] + 1;
        if (current[j] > bestLength) {
          bestLength = current[j];
          bestAEnd = i;
          bestBEnd = j;
        }
      }
    }
    previous.set(current);
  }

  return {
    length: bestLength,
    aStart: bestAEnd - bestLength,
    bStart: bestBEnd - bestLength,
  };
}

function candidateSpan(candidate, document, settings) {
  const positions = [
    ...candidate.positions.preserving,
    ...candidate.positions.normalized,
  ].sort((a, b) => a - b);

  if (positions.length === 0) return { start: 0, end: Math.min(document.tokens.normalized.length, settings.regionTokens) };

  const min = positions[0];
  const max = positions[positions.length - 1];
  const padding = Math.floor(settings.regionTokens / 2);
  const start = Math.max(0, min - padding);
  const end = Math.min(document.tokens.normalized.length, max + settings.shingleSize + padding);
  return { start, end };
}

function lineRange(tokens, start, length) {
  if (length <= 0 || tokens.length === 0) return null;
  const first = tokens[start];
  const last = tokens[Math.min(tokens.length - 1, start + length - 1)];
  if (!first || !last) return null;
  return { start: first.line, end: last.line };
}

export function verifyCandidate(region, candidate, document, settings = DEFAULT_SETTINGS) {
  const span = candidateSpan(candidate, document, settings);
  const candidateTokens = document.tokens.normalized.slice(span.start, span.end);
  const queryTokens = region.normalized;

  const matchedTokens = lcsLength(queryTokens, candidateTokens);
  const contiguous = longestCommonContiguous(queryTokens, candidateTokens);
  const customerCoverage = queryTokens.length === 0 ? 0 : matchedTokens / queryTokens.length;
  const sourceCoverage = candidateTokens.length === 0 ? 0 : matchedTokens / candidateTokens.length;
  const smallerCoverage = matchedTokens / Math.max(1, Math.min(queryTokens.length, candidateTokens.length));

  const customerMatchLines = lineRange(queryTokens, contiguous.aStart, contiguous.length);
  const sourceMatchLines = lineRange(candidateTokens, contiguous.bStart, contiguous.length);

  const strong =
    matchedTokens >= settings.minMatchedTokens &&
    contiguous.length >= settings.minContiguousTokens &&
    smallerCoverage >= settings.minSmallerCoverage &&
    candidate.commonFingerprintRatio < 0.75;

  const possible =
    matchedTokens >= settings.possibleMatchedTokens &&
    contiguous.length >= settings.possibleContiguousTokens &&
    smallerCoverage >= settings.possibleSmallerCoverage;

  return {
    classification: strong ? "strong_match" : possible ? "possible_common_pattern" : "insufficient_evidence",
    matchedTokens,
    contiguousTokens: contiguous.length,
    customerCoverage,
    sourceCoverage,
    smallerCoverage,
    customerLines: customerMatchLines ?? { start: region.lineStart, end: region.lineEnd },
    sourceLines: sourceMatchLines,
    candidateSpan: span,
    commonFingerprintRatio: candidate.commonFingerprintRatio,
    retrievalScore: candidate.score,
  };
}

function sliceLines(source, range, context = 1) {
  if (!range) return "";
  const lines = source.split(/\r?\n/);
  const start = Math.max(1, range.start - context);
  const end = Math.min(lines.length, range.end + context);
  return lines.slice(start - 1, end).join("\n");
}

function stableFindingId(filePath, document) {
  return `${filePath}|${document.repository}|${document.path}`;
}

export function scanSourceFiles(files, index, settings = DEFAULT_SETTINGS) {
  const documentById = new Map(index.documents.map((doc) => [doc.id, doc]));
  const findings = [];
  const errors = [];

  for (const file of files) {
    const language = file.language ?? detectLanguage(file.path);
    if (language === "unknown") continue;

    const regions = makeRegions(file.source, file.path, language, settings);
    const bestBySource = new Map();

    if (regions.length === 0) {
      findings.push({
        id: `${file.path}|insufficient`,
        classification: "insufficient_evidence",
        customer: { path: file.path, lines: null, excerpt: "" },
        publicSource: null,
        explanation: "The file contained no supported code tokens.",
      });
      continue;
    }

    for (const region of regions) {
      try {
        const candidates = retrieveCandidates(region, index, settings);
        for (const candidate of candidates) {
          const document = documentById.get(candidate.docId);
          if (!document || !languagesCompatible(language, document.language)) continue;
          const evidence = verifyCandidate(region, candidate, document, settings);
          if (evidence.classification === "insufficient_evidence") continue;

          const record = {
            id: stableFindingId(file.path, document),
            classification: evidence.classification,
            customer: {
              path: file.path,
              lines: evidence.customerLines,
              excerpt: sliceLines(file.source, evidence.customerLines),
            },
            publicSource: {
              repository: document.repository,
              commit: document.commit,
              path: document.path,
              url: document.sourceUrl,
              lines: evidence.sourceLines,
              excerpt: sliceLines(document.source, evidence.sourceLines),
              license: document.license,
              licenseUrl: document.licenseUrl,
            },
            metrics: {
              customerCoverage: evidence.customerCoverage,
              sourceCoverage: evidence.sourceCoverage,
              matchedTokens: evidence.matchedTokens,
              contiguousTokens: evidence.contiguousTokens,
              retrievalScore: evidence.retrievalScore,
            },
            explanation:
              evidence.classification === "strong_match"
                ? "Strong similarity evidence inside this lab's indexed sources. This is not proof of copying or AI authorship."
                : "Possible similarity or a common implementation pattern. Review the source before drawing conclusions.",
          };

          const previous = bestBySource.get(record.id);
          const rank = record.classification === "strong_match" ? 2 : 1;
          const previousRank = previous?.classification === "strong_match" ? 2 : previous ? 1 : 0;
          if (!previous || rank > previousRank || record.metrics.matchedTokens > previous.metrics.matchedTokens) {
            bestBySource.set(record.id, record);
          }
        }
      } catch (error) {
        errors.push({ file: file.path, region: region.id, message: error instanceof Error ? error.message : String(error) });
      }
    }

    if (bestBySource.size === 0) {
      findings.push({
        id: `${file.path}|insufficient`,
        classification: "insufficient_evidence",
        customer: {
          path: file.path,
          lines: { start: regions[0].lineStart, end: regions[regions.length - 1].lineEnd },
          excerpt: "",
        },
        publicSource: null,
        explanation: "Nothing sufficiently strong was found in the indexed sources. This does not prove the code is original.",
      });
    } else {
      findings.push(...bestBySource.values());
    }
  }

  findings.sort((a, b) => {
    const rank = { strong_match: 2, possible_common_pattern: 1, insufficient_evidence: 0 };
    return rank[b.classification] - rank[a.classification] ||
      (b.metrics?.matchedTokens ?? 0) - (a.metrics?.matchedTokens ?? 0) ||
      a.id.localeCompare(b.id);
  });

  return { findings, errors };
}
