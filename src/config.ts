import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flagBool, flagNum, flagStr, parseArgs } from './lib/util.js';

export type SourceMode = 'auto' | 'live' | 'fixture';

export interface Config {
  root: string;
  fixturesDir: string;
  snapshotsDir: string;
  reportsDir: string;
  exploreUrl: string;
  detailUrlTemplate: string;
  vaultUrl: string;
  rpcUrl: string | null;
  source: SourceMode;
  offline: boolean;
  enrich: boolean;
  vaultLookup: boolean;
  topN: number;
  limit: number | null;
  timeoutMs: number;
  fixturePath: string | null;
  snapshotPath: string | null;
  now: Date;
}

const here = path.dirname(fileURLToPath(import.meta.url));

function envStr(key: string): string | null {
  const value = process.env[key];
  return value && value.trim() !== '' ? value.trim() : null;
}

function envBool(key: string, fallback: boolean): boolean {
  const value = envStr(key);
  if (value === null) return fallback;
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}

function envNum(key: string, fallback: number): number {
  const value = envStr(key);
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function projectRoot(): string {
  const override = envStr('ESCROW_SENTINEL_ROOT');
  if (override) return path.resolve(override);
  return path.resolve(here, '..');
}

export const DEFAULT_EXPLORE_URL = 'https://api.gib.work/explore?page=1';
export const DEFAULT_DETAIL_URL_TEMPLATE = 'https://gib.work/bounty/{id}';
export const DEFAULT_VAULT_URL = 'https://api.gib.work/vaults';
export const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';

/**
 * Build the runtime config from CLI flags, then environment variables, then defaults.
 * Flags win over env vars so a single run can be reproduced without editing files.
 */
export function loadConfig(argv: string[] = [], base: Partial<Config> = {}): { config: Config; flags: Record<string, string | boolean>; positionals: string[] } {
  const { positionals, flags } = parseArgs(argv);
  const root = projectRoot();

  const sourceFlag = flagStr(flags, 'source');
  const source = (sourceFlag ?? envStr('ESCROW_SENTINEL_SOURCE') ?? 'auto') as SourceMode;
  if (!['auto', 'live', 'fixture'].includes(source)) {
    throw new Error(`Invalid --source "${source}". Use auto | live | fixture.`);
  }

  const offline = flagBool(flags, 'offline', envBool('ESCROW_SENTINEL_OFFLINE', false));
  const rpcDisabled = flagBool(flags, 'no-rpc', envBool('ESCROW_SENTINEL_RPC_DISABLED', false));
  // Offline mode means "no network at all", so the RPC client is not created either.
  const rpcUrl = rpcDisabled || offline ? null : (flagStr(flags, 'rpc') ?? envStr('SOLANA_RPC_URL') ?? DEFAULT_RPC_URL);

  const config: Config = {
    root,
    fixturesDir: path.resolve(root, 'fixtures'),
    snapshotsDir: path.resolve(root, 'snapshots'),
    reportsDir: path.resolve(root, 'reports'),
    exploreUrl: flagStr(flags, 'explore-url') ?? envStr('GIB_EXPLORE_URL') ?? DEFAULT_EXPLORE_URL,
    detailUrlTemplate: flagStr(flags, 'detail-url-template') ?? envStr('GIB_DETAIL_URL_TEMPLATE') ?? DEFAULT_DETAIL_URL_TEMPLATE,
    vaultUrl: flagStr(flags, 'vaults-url') ?? envStr('GIB_VAULTS_URL') ?? DEFAULT_VAULT_URL,
    rpcUrl,
    source,
    offline,
    enrich: flagBool(flags, 'enrich', envBool('ESCROW_SENTINEL_ENRICH', true)) && !offline,
    vaultLookup: flagBool(flags, 'vault', envBool('ESCROW_SENTINEL_VAULT_LOOKUP', true)) && !offline,
    topN: flagNum(flags, 'top') ?? envNum('ESCROW_SENTINEL_TOP', 5),
    limit: flagNum(flags, 'limit'),
    timeoutMs: flagNum(flags, 'timeout-ms') ?? envNum('ESCROW_SENTINEL_TIMEOUT_MS', 15_000),
    fixturePath: flagStr(flags, 'fixture'),
    snapshotPath: flagStr(flags, 'snapshot'),
    now: new Date(),
    ...base,
  };

  const nowFlag = flagStr(flags, 'now');
  if (nowFlag) {
    const parsed = new Date(nowFlag);
    if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid --now "${nowFlag}" (expected ISO date).`);
    config.now = parsed;
  }

  return { config, flags, positionals };
}

export function describeConfig(config: Config, rpcRedacted: string | null): string {
  const source = config.offline ? `${config.source} (offline)` : config.source;
  return [
    `source=${source}`,
    `enrich=${config.enrich}`,
    `vaultLookup=${config.vaultLookup}`,
    `rpc=${rpcRedacted ?? 'disabled'}`,
    `top=${config.topN}`,
  ].join(' ');
}
