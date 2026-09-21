// Sample data for the public demo. Everything here is fictional and written for
// this demo: "Lattice" is not a real company, and the "public source" projects
// live under git.example.org (an RFC 2606 reserved domain) so they can't be
// mistaken for — or collide with — real repositories. The demo runs PoryGen's
// real pipeline over these files; only the repository itself is invented.

import type { StaticCorpusEntry, ScanSourceFile } from "@porygen/provenance-core";

export const SAMPLE_REPOSITORY = {
  name: "lattice-app",
  owner: "lattice (fictional)",
  branch: "main",
  commit: "a3f9c21",
  commitMessage: "Add API rate limiting",
  fixCommit: "b81e0d4",
  fixMessage: "Replace rate limiter with fixed-window counter on shared cache",
  totalFiles: 312,
};

const SLIDING_WINDOW_SOURCE = `export interface WindowOptions {
  limit: number;
  windowMs: number;
}

export interface WindowDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class SlidingWindow {
  private hits = new Map<string, number[]>();

  constructor(private readonly options: WindowOptions) {}

  check(key: string, now: number = Date.now()): WindowDecision {
    const windowStart = now - this.options.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (recent.length >= this.options.limit) {
      const retryAfterMs = recent[0] + this.options.windowMs - now;
      this.hits.set(key, recent);
      return { allowed: false, remaining: 0, retryAfterMs };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true, remaining: this.options.limit - recent.length, retryAfterMs: 0 };
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}`;

const DEBOUNCE_SOURCE = `export function debounce(fn, wait) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, wait);
  };
}`;

const DEEP_MERGE_SOURCE = `export function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const output: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const incoming = source[key];
    const existing = output[key];
    if (isPlainObject(existing) && isPlainObject(incoming)) {
      output[key] = deepMerge(existing, incoming);
    } else if (Array.isArray(existing) && Array.isArray(incoming)) {
      output[key] = [...existing, ...incoming];
    } else if (incoming !== undefined) {
      output[key] = incoming;
    }
  }
  return output as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}`;

export const SAMPLE_CORPUS: StaticCorpusEntry[] = [
  {
    id: "sample-slidewindow",
    title: "SlidingWindow rate limiter",
    license: "GPL-3.0",
    language: "typescript",
    source: SLIDING_WINDOW_SOURCE,
    origin: {
      kind: "sample",
      label: "Fictional public project (sample data)",
      repository: "git.example.org/sample-oss/slidewindow",
      path: "src/window.ts",
      url: null,
    },
  },
  {
    id: "sample-tiny-debounce",
    title: "debounce(fn, wait)",
    license: "MIT",
    language: "javascript",
    source: DEBOUNCE_SOURCE,
    commonIdiom: true,
    origin: {
      kind: "sample",
      label: "Fictional public project (sample data)",
      repository: "git.example.org/sample-oss/tiny-utils",
      path: "src/debounce.js",
      url: null,
    },
  },
  {
    id: "sample-objectkit-merge",
    title: "deepMerge(target, source)",
    license: "MPL-2.0",
    language: "typescript",
    source: DEEP_MERGE_SOURCE,
    origin: {
      kind: "sample",
      label: "Fictional public project (sample data)",
      repository: "git.example.org/sample-oss/objectkit",
      path: "src/merge.ts",
      url: null,
    },
  },
];

export const RATE_LIMIT_PATH = "src/api/rateLimit.ts";

/** What the coding agent wrote in commit a3f9c21. */
export const RATE_LIMIT_BEFORE = `import type { Request, Response, NextFunction } from "express";

type LimiterConfig = {
  max: number;
  intervalMs: number;
};

type LimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export class RequestLimiter {
  private requests = new Map<string, number[]>();

  constructor(private readonly config: LimiterConfig) {}

  check(clientId: string, at: number = Date.now()): LimitResult {
    const cutoff = at - this.config.intervalMs;
    const active = (this.requests.get(clientId) ?? []).filter((stamp) => stamp > cutoff);
    if (active.length >= this.config.max) {
      const retryAfterMs = active[0] + this.config.intervalMs - at;
      this.requests.set(clientId, active);
      return { allowed: false, remaining: 0, retryAfterMs };
    }
    active.push(at);
    this.requests.set(clientId, active);
    return { allowed: true, remaining: this.config.max - active.length, retryAfterMs: 0 };
  }

  reset(clientId: string): void {
    this.requests.delete(clientId);
  }
}

const limiter = new RequestLimiter({ max: 120, intervalMs: 60_000 });

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const decision = limiter.check(req.ip ?? "anonymous");
  if (!decision.allowed) {
    res.setHeader("Retry-After", Math.ceil(decision.retryAfterMs / 1000));
    return res.status(429).json({ error: "Too many requests" });
  }
  next();
}`;

/** The replacement in commit b81e0d4 — a different design, written against the app's own cache. */
export const RATE_LIMIT_AFTER = `import type { Request, Response, NextFunction } from "express";
import { cache } from "../lib/cache";

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 120;

// Fixed-window counter on the shared cache: one key per client per minute.
export async function rateLimit(req: Request, res: Response, next: NextFunction) {
  const clientId = req.ip ?? "anonymous";
  const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  const used = await cache.incr(\`rl:\${clientId}:\${window}\`, { ttlSeconds: WINDOW_SECONDS });
  res.setHeader("X-RateLimit-Remaining", Math.max(0, MAX_REQUESTS - used));
  if (used > MAX_REQUESTS) {
    res.setHeader("Retry-After", WINDOW_SECONDS);
    return res.status(429).json({ error: "Too many requests" });
  }
  next();
}`;

const DEBOUNCE_FILE = `export function debounce(callback, delayMs) {
  let pending = null;
  return function (...params) {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      callback.apply(this, params);
    }, delayMs);
  };
}

export const debounceSearch = (search) => debounce(search, 250);`;

const MERGE_CONFIG_FILE = `type Config = Record<string, unknown>;

// Merges user settings over defaults. Arrays from settings replace defaults.
export function mergeConfig(defaults: Config, overrides: Config): Config {
  const result: Config = { ...defaults };
  for (const key of Object.keys(overrides)) {
    const next = overrides[key];
    const current = result[key];
    if (isRecord(current) && isRecord(next)) {
      result[key] = mergeConfig(current, next);
    } else if (next !== undefined) {
      result[key] = next;
    }
  }
  return result;
}

function isRecord(value: unknown): value is Config {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}`;

const PACKAGE_JSON = JSON.stringify(
  { name: "lattice-app", private: true, dependencies: { react: "^19.2.0", "react-dom": "^19.2.0", express: "^5.1.0" }, devDependencies: { typescript: "^6.0.0", vite: "^8.0.0" } },
  null,
  2,
);

function file(path: string, content: string): ScanSourceFile {
  return { path, content, bytes: new TextEncoder().encode(content).length };
}

const SHARED_FILES: ScanSourceFile[] = [
  file("src/lib/debounce.js", DEBOUNCE_FILE),
  file("src/lib/mergeConfig.ts", MERGE_CONFIG_FILE),
  file("src/app.ts", `import express from "express";\nimport { rateLimit } from "./api/rateLimit";\n\nconst app = express();\napp.use("/api", rateLimit);\napp.listen(3000);\n`),
  file("package.json", PACKAGE_JSON),
];

export const SAMPLE_FILES_BEFORE: ScanSourceFile[] = [file(RATE_LIMIT_PATH, RATE_LIMIT_BEFORE), ...SHARED_FILES];
export const SAMPLE_FILES_AFTER: ScanSourceFile[] = [file(RATE_LIMIT_PATH, RATE_LIMIT_AFTER), ...SHARED_FILES];

const AREAS = ["components", "routes", "lib", "hooks", "api", "billing", "auth", "workers", "db", "emails", "reports", "settings"];
const NOUNS = [
  "Account", "Invoice", "Team", "Project", "Report", "Session", "Webhook", "Audit", "Search", "Upload",
  "Member", "Plan", "Usage", "Export", "Notice", "Token", "Workspace", "Chart", "Filter", "Timeline",
  "Comment", "Label", "Schedule", "Digest", "Import", "Role",
];
const SUFFIXES = ["", "List", "Form", "Panel", "Service", "Store", "Card", "Table"];

/** The rest of the sample repository, as paths only — simulated clear files for the scan readout. */
export function simulatedPaths(count: number): string[] {
  const paths: string[] = [];
  let seed = 7;
  const next = () => (seed = (seed * 48271) % 2147483647);
  const taken = new Set(SAMPLE_FILES_BEFORE.map((f) => f.path));
  while (paths.length < count) {
    const area = AREAS[next() % AREAS.length];
    const noun = NOUNS[next() % NOUNS.length];
    const suffix = SUFFIXES[next() % SUFFIXES.length];
    const ext = area === "components" || area === "routes" ? "tsx" : "ts";
    const path = `src/${area}/${noun}${suffix}.${ext}`;
    if (taken.has(path)) continue;
    taken.add(path);
    paths.push(path);
  }
  return paths;
}
