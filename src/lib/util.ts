/** Small, dependency-free helpers: time, numbers, redaction and fetch with retry. */

export const TOOL_NAME = 'escrow-sentinel';
export const TOOL_VERSION = '0.1.0';
export const SCHEMA_VERSION = 1;

export function nowIso(now: Date = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function clamp(value: number, lo: number, hi: number): number {
  if (Number.isNaN(value)) return lo;
  return Math.min(hi, Math.max(lo, value));
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

export function toStr(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** Whole days between `from` and `to`; negative when `to` is in the past. */
export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 86_400_000;
}

export function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Strip credentials and query strings from an RPC URL.
 * `https://rpc.example.com/?api-key=SECRET` -> `https://rpc.example.com`
 */
export function redactUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '<unparseable-url>';
  }
}

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly bodySnippet: string;

  constructor(status: number, url: string, bodySnippet = '') {
    super(`HTTP ${status} for ${redactUrl(url)}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.bodySnippet = bodySnippet.slice(0, 200);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  fetchImpl?: typeof fetch;
}

/**
 * fetch() with a hard timeout and bounded retries on network errors / 429 / 5xx.
 * Returns the raw Response so callers can decide how to parse it.
 */
export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const {
    timeoutMs = 15_000,
    retries = 2,
    retryDelayMs = 500,
    method = 'GET',
    headers = {},
    body,
    fetchImpl = fetch,
  } = options;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method,
        headers: { accept: 'application/json, text/html;q=0.9, */*;q=0.8', ...headers },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = new HttpError(response.status, url, await safeText(response));
        if (attempt < retries) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        throw lastError;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/** GET + JSON parse with retry, throwing HttpError on non-2xx. */
export async function fetchJson<T = unknown>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await fetchWithRetry(url, options);
  if (!response.ok) {
    throw new HttpError(response.status, url, await safeText(response));
  }
  return (await response.json()) as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export function formatAmount(value: number | null, digits = 2): string {
  if (value === null) return 'unknown';
  return value.toFixed(digits).replace(/\.0+$/, '');
}

export function formatPercent(value: number | null, digits = 0): string {
  if (value === null) return 'unknown';
  return `${(value * 100).toFixed(digits)}%`;
}

/** Minimal `--flag=value` / `--flag value` parser. Unknown flags are collected for validation. */
export function parseArgs(argv: string[]): { positionals: string[]; flags: Record<string, string | boolean> } {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] as string;
    if (token.startsWith('--')) {
      const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s);
      const key = rawKey as string;
      if (inlineValue !== undefined) {
        flags[key] = inlineValue;
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[key] = next;
          i += 1;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positionals.push(token);
    }
  }
  return { positionals, flags };
}

export function flagBool(flags: Record<string, string | boolean>, key: string, fallback = false): boolean {
  if (!(key in flags)) return fallback;
  const value = flags[key];
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}

export function flagStr(flags: Record<string, string | boolean>, key: string): string | null {
  const value = flags[key];
  if (value === undefined || typeof value === 'boolean') return null;
  return value;
}

export function flagNum(flags: Record<string, string | boolean>, key: string): number | null {
  const raw = flagStr(flags, key);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
