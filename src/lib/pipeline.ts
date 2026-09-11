import type { Config, SourceMode } from '../config.js';
import type { Snapshot, SnapshotDiff } from '../types.js';
import { discoverBounties, type DiscoverOptions, type DiscoverResult } from './discover.js';
import { diffSnapshots } from './diff.js';
import type { RankedBounty } from './score.js';
import { rankBounties } from './score.js';
import { createRpcClient, type RpcClient } from './solana.js';
import { verifySnapshot, type VerifySummary } from './verify.js';
import type { SnapshotRef } from './snapshot.js';

export interface DiscoverOverrides {
  source?: SourceMode;
  now?: Date;
}

export function discoverOptionsFromConfig(config: Config, overrides: DiscoverOverrides = {}): DiscoverOptions {
  return {
    source: overrides.source ?? config.source,
    fixturePath: config.fixturePath,
    fixturesDir: config.fixturesDir,
    exploreUrl: config.exploreUrl,
    detailUrlTemplate: config.detailUrlTemplate,
    vaultUrl: config.vaultUrl,
    rpcEndpoint: config.rpcUrl,
    enrich: config.enrich,
    timeoutMs: config.timeoutMs,
    limit: config.limit,
    now: overrides.now ?? config.now,
    offline: config.offline,
  };
}

export interface PipelineResult {
  snapshot: Snapshot;
  ranked: RankedBounty[];
  verification: VerifySummary | null;
  warnings: string[];
  rpcEndpoint: string | null;
  rpcClient: RpcClient | null;
  diff: SnapshotDiff | null;
  discover: DiscoverResult;
}

export interface PipelineOptions {
  verify?: boolean;
  source?: SourceMode;
  now?: Date;
  diffAgainst?: SnapshotRef | null;
  rpcClient?: RpcClient | null;
}

/** discover -> verify -> rank (-> diff) in one call. Used by `report` and the MCP tools. */
export async function runPipeline(config: Config, options: PipelineOptions = {}): Promise<PipelineResult> {
  const now = options.now ?? new Date();
  const discover = await discoverBounties(discoverOptionsFromConfig(config, { source: options.source, now }));
  const warnings = [...discover.warnings];

  let snapshot = discover.snapshot;
  let verification: VerifySummary | null = null;

  const rpcClient =
    options.rpcClient !== undefined
      ? options.rpcClient
      : config.rpcUrl
        ? createRpcClient({ url: config.rpcUrl, timeoutMs: config.timeoutMs, retries: 1 })
        : null;

  if (options.verify !== false) {
    const verified = await verifySnapshot(snapshot, {
      rpcClient,
      vaultUrl: config.vaultUrl,
      vaultLookup: config.vaultLookup,
      timeoutMs: config.timeoutMs,
      now,
      reuseRecorded: config.offline,
    });
    snapshot = verified.snapshot;
    verification = verified.summary;
    if (verification.unknown > 0) {
      warnings.push(`${verification.unknown} bounty(ies) could not be verified on-chain and are reported as unknown`);
    }
  }

  const ranked = rankBounties(snapshot.bounties, { now, top: config.topN });
  const diff = options.diffAgainst
    ? diffSnapshots(options.diffAgainst.snapshot, snapshot, {
        oldPath: options.diffAgainst.path,
        newPath: null,
        generatedAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      })
    : null;

  return {
    snapshot,
    ranked,
    verification,
    warnings,
    rpcEndpoint: rpcClient?.endpoint ?? null,
    rpcClient,
    diff,
    discover,
  };
}
