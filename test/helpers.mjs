import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const distDir = path.join(projectRoot, 'dist');

export function distImport(relative) {
  return import(new URL(`file://${path.join(distDir, relative).replace(/\\/g, '/')}`).href);
}

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const CREDITS_MINT = '29bHTjaAdZ2s2ZCAy5m7UkFy4m4hxBCRUA7sVAAAGsRT';
export const TEST_ESCROW = '9Nw5KFDj2vZsBJnQiYpKxpr9K2P1UkJGooLX9MtPWaEd';

export function fixturePath() {
  const dir = path.join(projectRoot, 'fixtures');
  const files = fs
    .readdirSync(dir)
    .filter((name) => /^bounties-.*\.json$/.test(name))
    .sort()
    .reverse();
  if (files.length === 0) throw new Error('no fixture available');
  return path.join(dir, files[0]);
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function readFixture() {
  return readJson(fixturePath());
}

/** Build a complete bounty object with sensible defaults so tests stay short. */
export function makeBounty(overrides = {}) {
  const id = overrides.id ?? 'bounty-0001';
  const base = {
    id,
    title: overrides.title ?? `Test bounty ${id}`,
    url: `https://gib.work/bounty/${id}`,
    content: '',
    tags: [],
    status: 'CREATED',
    isOpen: true,
    createdAt: '2026-09-01T00:00:00Z',
    deadline: '2026-10-30T04:00:00.000Z',
    creator: 'tester',
    xpBonus: 0,
    asset: {
      symbol: 'USDC',
      mintAddress: USDC_MINT,
      decimals: 6,
      rawAmount: '1000000000',
      advertisedValue: 1000,
    },
    advertisedPool: 1000,
    health: {
      status: 'healthy',
      submissionCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      pendingCount: 0,
      rewardDensity: 0,
      bountyUsd: 1000,
    },
    gating: {
      minSubmissionAmount: 1,
      allowOnlyVerifiedSubmissions: false,
      minTwitterFollowers: 0,
      maxSubmissions: null,
      requiredDiscordGuildId: null,
      requiredDiscordRoleIds: [],
      allowOnlyDiscordGuildSubmissions: false,
    },
    ledger: {
      address: TEST_ESCROW,
      balance: 1000,
      totalDeposited: 1000,
      totalWithdrawn: 0,
      depositCount: 1,
      withdrawalCount: 0,
      symbol: 'USDC',
      mintAddress: USDC_MINT,
      isAccountClosed: false,
      lastActivityAt: '2026-09-01T00:00:00Z',
      lastActivityType: 'deposit',
      source: 'test',
    },
    verification: {
      status: 'verified',
      evidence: 'live',
      checkedAt: '2026-09-11T00:00:00Z',
      escrowAddress: TEST_ESCROW,
      rpcEndpoint: 'https://rpc.test',
      slot: 1,
      platformLedgerBalance: 1000,
      platformLedgerMint: USDC_MINT,
      platformLedgerSymbol: 'USDC',
      onchainAmount: 1000,
      onchainRawAmount: '1000000000',
      onchainDecimals: 6,
      onchainMint: USDC_MINT,
      onchainOwner: null,
      mintMatchesLedger: true,
      assetMatchesAdvertised: true,
      coverage: 1,
      flags: [],
      reason: null,
    },
    provenance: { source: 'live', capturedAt: '2026-09-11T00:00:00Z', note: 'test' },
  };

  const merged = { ...base, ...overrides };
  merged.asset = { ...base.asset, ...(overrides.asset ?? {}) };
  merged.health = { ...base.health, ...(overrides.health ?? {}) };
  merged.gating = { ...base.gating, ...(overrides.gating ?? {}) };
  merged.ledger = { ...base.ledger, ...(overrides.ledger ?? {}) };
  if (overrides.verification === null) merged.verification = null;
  else merged.verification = { ...base.verification, ...(overrides.verification ?? {}) };
  merged.provenance = { ...base.provenance, ...(overrides.provenance ?? {}) };
  return merged;
}

export function makeSnapshot(bounties, overrides = {}) {
  return {
    schemaVersion: 1,
    tool: { name: 'escrow-sentinel', version: '0.1.0' },
    snapshotId: overrides.snapshotId ?? 'snap-test',
    capturedAt: overrides.capturedAt ?? '2026-09-11T00:00:00Z',
    source: {
      kind: 'live',
      exploreUrl: 'https://api.gib.work/explore?page=1',
      detailUrlTemplate: 'https://gib.work/bounty/{id}',
      vaultUrl: 'https://api.gib.work/vaults',
      rpcEndpoint: 'https://rpc.test',
      fixturePath: null,
      evidence: null,
      ...(overrides.source ?? {}),
    },
    warnings: overrides.warnings ?? [],
    bounties,
  };
}

/** Fake read-only RPC client. `mode` decides what the network "returns". */
export function makeRpcClient({ mode = 'ok', account = {}, error = new Error('boom') } = {}) {
  const tokenAccount = {
    address: TEST_ESCROW,
    mint: USDC_MINT,
    owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    amount: '1000000000',
    decimals: 6,
    uiAmount: 1000,
    slot: 446217696,
    ...account,
  };
  return {
    endpoint: 'https://rpc.test',
    async getTokenAccount() {
      if (mode === 'throw') throw error;
      if (mode === 'not-found') return null;
      return tokenAccount;
    },
    async getTokenAccountBalance() {
      if (mode === 'throw') throw error;
      if (mode === 'not-found') return null;
      return {
        address: tokenAccount.address,
        amount: tokenAccount.amount,
        decimals: tokenAccount.decimals,
        uiAmount: tokenAccount.uiAmount,
        slot: tokenAccount.slot,
      };
    },
  };
}

export function tempRoot(label) {
  const dir = path.join(projectRoot, 'tmp', `test-${label}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'fixtures'), { recursive: true });
  fs.copyFileSync(fixturePath(), path.join(dir, 'fixtures', path.basename(fixturePath())));
  return dir;
}
