// Hand-drawn marks — the one human, imperfect gesture in an otherwise precise
// system. Decorative only.

export function ScrawlUnderline({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 22" fill="none" aria-hidden="true" preserveAspectRatio="none">
      <path d="M3 13 C 58 6, 118 16, 178 10 S 262 6, 297 11" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M22 18 C 92 13, 168 19, 246 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export function ScrawlArrow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 70" fill="none" aria-hidden="true">
      <path d="M6 9 C 34 3, 66 20, 74 52" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M62 44 L 75 55 L 82 39" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
