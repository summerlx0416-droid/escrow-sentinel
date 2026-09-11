import fs from 'node:fs';
import path from 'node:path';
import type { Bounty, Snapshot } from '../types.js';
import { createSnapshot, extractDetailFromHtml, mergeDetail, normalizeExplorePayload } from './normalize.js';
import { errorMessage, fetchJson, fetchWithRetry, nowIso, redactUrl, sleep } from './util.js';

export interface DiscoverOptions {
  source: 'auto' | 'live' | 'fixture';
  fixturePath: string | null;
  fixturesDir: string;
  exploreUrl: string;
  detailUrlTemplate: string;
  vaultUrl: string;
  rpcEndpoint: string | null;
  enrich: boolean;
  timeoutMs: number;
  limit: number | null;
  fetchImpl?: typeof fetch;
  now: Date;
  offline: boolean;
  /** Max detail pages to fetch when `enrich` is on (politeness cap). */
  enrichLimit?: number;
}

export interface DiscoverResult {
  snapshot: Snapshot;
  warnings: string[];
  usedFallback: boolean;
  origin: 'live' | 'fixture';
}

export function listFixtureFiles(fixturesDir: string): string[] {
  if (!fs.existsSync(fixturesDir)) return [];
  return fs
    .readdirSync(fixturesDir)
    .filter((name) => /^bounties-.*\.json$/.test(name))
    .sort()
    .reverse()
    .map((name) => path.join(fixturesDir, name));
}

export function findLatestFixture(fixturesDir: string): string | null {
  return listFixtureFiles(fixturesDir)[0] ?? null;
}

/** Read a snapshot/fixture file and fail loudly when it is not a snapshot document. */
export function readSnapshotFile(filePath: string): Snapshot {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as Snapshot;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.bounties)) {
    throw new Error(`${filePath} is not an Escrow Sentinel snapshot (missing "bounties" array).`);
  }
  return parsed;
}

export function writeSnapshotFile(snapshot: Snapshot, snapshotsDir: string): string {
  fs.mkdirSync(snapshotsDir, { recursive: true });
  const stamp = snapshot.capturedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const filePath = path.join(snapshotsDir, `bounties-${stamp}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return filePath;
}

/**
 * Discovery layer.
 *
 * `live`     -> GET api.gib.work/explore (public listing the site itself calls)
 * `fixture`  -> replay a committed snapshot captured from real public data
 * `auto`     -> live first, fixture fallback (never fail because the API is down)
 */
export async function discoverBounties(options: DiscoverOptions): Promise<DiscoverResult> {
  const warnings: string[] = [];
  const capturedAt = nowIso(options.now);

  if (options.source === 'fixture' || options.offline) {
    const fixturePath = options.fixturePath ?? findLatestFixture(options.fixturesDir);
    if (!fixturePath) {
      throw new Error(`No fixture found in ${options.fixturesDir}. Run "escrow-sentinel discover --source live" first.`);
    }
    const snapshot = readSnapshotFile(fixturePath);
    const bounties = options.limit ? snapshot.bounties.slice(0, options.limit) : snapshot.bounties;
    return {
      snapshot: { ...snapshot, bounties },
      warnings: [`offline/fixture mode: replayed ${path.basename(fixturePath)} (captured ${snapshot.capturedAt})`],
      usedFallback: false,
      origin: 'fixture',
    };
  }

  try {
    const payload = await fetchJson(options.exploreUrl, {
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
    });
    const { bounties: normalized, meta } = normalizeExplorePayload(payload, {
      capturedAt,
      note: options.exploreUrl,
      source: 'live',
      detailUrlTemplate: options.detailUrlTemplate,
    });
    let bounties = normalized;
    if (options.limit) bounties = bounties.slice(0, options.limit);
    if (meta.total !== null && meta.total !== bounties.length && !options.limit) {
      warnings.push(`listing reports total=${meta.total} but returned ${bounties.length} rows (pagination limit ${meta.limit})`);
    }

    if (options.enrich && bounties.length > 0) {
      const enriched = await enrichBounties(bounties, options, warnings);
      bounties = enriched;
    }

    const snapshot = createSnapshot({
      capturedAt,
      bounties,
      warnings,
      source: {
        kind: 'live',
        exploreUrl: options.exploreUrl,
        detailUrlTemplate: options.detailUrlTemplate,
        vaultUrl: options.vaultUrl,
        rpcEndpoint: redactUrl(options.rpcEndpoint),
        fixturePath: null,
        evidence: null,
      },
    });
    return { snapshot, warnings, usedFallback: false, origin: 'live' };
  } catch (error) {
    const message = errorMessage(error);
    if (options.source !== 'auto') throw error;
    const fixturePath = options.fixturePath ?? findLatestFixture(options.fixturesDir);
    if (!fixturePath) throw error;
    warnings.push(`live discovery failed (${message}); fell back to ${path.basename(fixturePath)}`);
    const snapshot = readSnapshotFile(fixturePath);
    const bounties = options.limit ? snapshot.bounties.slice(0, options.limit) : snapshot.bounties;
    return {
      snapshot: { ...snapshot, bounties, warnings: [...snapshot.warnings, ...warnings] },
      warnings,
      usedFallback: true,
      origin: 'fixture',
    };
  }
}

/** Fetch bounty detail pages and merge submission counts / gating fields. */
async function enrichBounties(bounties: Bounty[], options: DiscoverOptions, warnings: string[]): Promise<Bounty[]> {
  const cap = options.enrichLimit ?? bounties.length;
  const out: Bounty[] = [];
  for (const bounty of bounties) {
    if (out.length >= cap) {
      out.push(bounty);
      continue;
    }
    const url = options.detailUrlTemplate.replace('{id}', bounty.id);
    try {
      const response = await fetchWithRetry(url, {
        timeoutMs: options.timeoutMs,
        retries: 1,
        fetchImpl: options.fetchImpl,
        headers: { accept: 'text/html' },
      });
      if (!response.ok) {
        warnings.push(`detail ${bounty.id}: HTTP ${response.status}`);
        out.push(bounty);
        continue;
      }
      const detail = extractDetailFromHtml(await response.text());
      out.push(mergeDetail(bounty, detail));
    } catch (error) {
      warnings.push(`detail ${bounty.id}: ${errorMessage(error)}`);
      out.push(bounty);
    }
    await sleep(150);
  }
  return out;
}
