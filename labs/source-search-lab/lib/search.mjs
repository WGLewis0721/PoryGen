const STOP_WORDS = new Set([
  "a","an","and","are","as","at","be","by","for","from","how","in","is","it",
  "of","on","or","that","the","this","to","was","what","when","where","which",
  "with","you","your"
]);

export function tokenize(text = "") {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.-]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

function countMatches(tokens, term) {
  let count = 0;
  for (const token of tokens) {
    if (token === term) count += 1;
  }
  return count;
}

export function rankDocuments(query, documents) {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) return [];

  return documents
    .map((doc) => {
      const titleTokens = tokenize(doc.title);
      const tagTokens = tokenize(doc.tags.join(" "));
      const bodyTokens = tokenize(doc.body);

      let rawScore = 0;
      let matchedTerms = 0;

      for (const term of queryTerms) {
        const titleHits = countMatches(titleTokens, term);
        const tagHits = countMatches(tagTokens, term);
        const bodyHits = countMatches(bodyTokens, term);

        if (titleHits + tagHits + bodyHits > 0) matchedTerms += 1;
        rawScore += titleHits * 5 + tagHits * 3 + bodyHits;
      }

      const coverage = matchedTerms / queryTerms.length;
      const score = rawScore === 0 ? 0 : Number((rawScore * (1 + coverage)).toFixed(2));

      return { ...doc, score, matchedTerms, queryTerms: queryTerms.length };
    })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

export function makeSnippet(body, query, maxLength = 180) {
  const terms = tokenize(query);
  const lower = body.toLowerCase();
  const firstIndex = terms
    .map((term) => lower.indexOf(term.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? 0;

  const start = Math.max(0, firstIndex - 60);
  const end = Math.min(body.length, start + maxLength);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < body.length ? "…" : "";
  return prefix + body.slice(start, end).replace(/\s+/g, " ").trim() + suffix;
}
