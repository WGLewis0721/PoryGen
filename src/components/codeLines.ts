/** Keeps only the lines of `code` (which starts at `startLine`) between `from` and `to`, inclusive. */
export function sliceLines(code: string, startLine: number, from: number, to: number): { code: string; startLine: number } {
  const lines = code.split("\n");
  const first = Math.max(from, startLine);
  const last = Math.min(to, startLine + lines.length - 1);
  return { code: lines.slice(first - startLine, last - startLine + 1).join("\n"), startLine: first };
}
