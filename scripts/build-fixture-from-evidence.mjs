#!/usr/bin/env node
/**
 * Rebuild `fixtures/bounties-<stamp>.json` from the read-only evidence captured by
 * workstream W-A (`workstreams/new-sources/_gib/`).
 *
 * Inputs (all public read-only captures, 2026-09-11T17:11–17:34Z):
 *   explore-p1.json    GET  api.gib.work/explore?page=1
 *   details-all.json   GET  gib.work/bounty/<id>          (embedded task object)
 *   vaults-all.json    the platform's public vault query  (escrow address + ledger)
 *   onchain-verify.json Solana mainnet RPC reads of each escrow token account
 *
 * The script runs the *production* verification code (`dist/lib/*.js`) against a
 * recorded RPC client, then labels the result `evidence: "recorded"` so offline
 * runs never pretend to have re-read the chain.
 *
 * Usage: npm run build && node scripts/build-fixture-from-evidence.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSnapshot, mergeDetail, normalizeExplorePayload } from '../dist/lib/normalize.js';
import { normalizeVault } from '../dist/lib/vaults.js';
import { verifySnapshot } from '../dist/lib/verify.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const evidenceDir = path.resolve(projectRoot, '..', 'new-sources', '_gib');

const EXPLORE = path.join(evidenceDir, 'explore-p1.json');
const DETAILS = path.join(evidenceDir, 'details-all.json');
const VAULTS = path.join(evidenceDir, 'vaults-all.json');
const ONCHAIN = path.join(evidenceDir, 'onchain-verify.json');

for (const file of [EXPLORE, DETAILS, VAULTS, ONCHAIN]) {
  if (!fs.existsSync(file)) throw new Error(`Missing evidence file: ${file}`);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const explore = readJson(EXPLORE);
const details = readJson(DETAILS);
const vaults = readJson(VAULTS);
const onchain = readJson(ONCHAIN);

const CAPTURED_AT = '2026-09-11T17:34:21Z';
const RPC_CAPTURED_AT = '2026-09-11T17:33:55Z';
const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';
const DASHBOARD_URL = 'https://gib.work/bounty/{id}';
const EXPLORE_URL = 'https://api.gib.work/explore?page=1';
const VAULT_URL = 'https://api.gib.work/vaults';

const detailById = new Map(details.map((row) => [row.id, row.task ?? {}]));
const vaultById = new Map(vaults.map((row) => [row.id, row.vault ?? {}]));
const onchainById = new Map(onchain.map((row) => [row.id, row]));

// 1) normalize the live listing payload through the production code path
const { bounties: normalized } = normalizeExplorePayload(explore, {
  capturedAt: CAPTURED_AT,
  note: `${EXPLORE_URL} (captured 2026-09-11T17:11:25Z)`,
  source: 'fixture',
  detailUrlTemplate: DASHBOARD_URL,
});

// 2) merge the detail-page fields (health metrics, gating, createdAt)
let bounties = normalized.map((bounty) => {
  const task = detailById.get(bounty.id);
  if (!task) return bounty;
  return mergeDetail(bounty, {
    health: task.health
      ? {
          status: task.health.status ?? null,
          submissionCount: task.health.metrics?.submissionCount ?? null,
          approvedCount: task.health.metrics?.approvedCount ?? null,
          rejectedCount: task.health.metrics?.rejectedCount ?? null,
          pendingCount: task.health.metrics?.pendingCount ?? null,
          rewardDensity: task.health.metrics?.rewardDensity ?? null,
          bountyUsd: task.health.metrics?.bountyUsd ?? null,
        }
      : null,
    createdAt: task.createdAt ?? null,
    deadline: task.deadline ?? null,
    minSubmissionAmount: task.minSubmissionAmount ?? null,
    allowOnlyVerifiedSubmissions: task.allowOnlyVerifiedSubmissions ?? null,
    minTwitterFollowers: task.minTwitterFollowers ?? null,
    maxSubmissions: task.maxSubmissions ?? null,
    requiredDiscordGuildId: task.requiredDiscordGuildId ?? null,
    requiredDiscordRoleIds: Array.isArray(task.requiredDiscordRoleIds) ? task.requiredDiscordRoleIds : [],
    allowOnlyDiscordGuildSubmissions: task.allowOnlyDiscordGuildSubmissions ?? null,
  });
});

// 3) attach the escrow ledger captured from the platform's public vault query
bounties = bounties.map((bounty) => {
  const ledger = normalizeVault(vaultById.get(bounty.id) ?? {});
  return ledger ? { ...bounty, ledger } : bounty;
});

// 4) replay the recorded on-chain reads through the production verification code
const recordedAccounts = new Map();
for (const row of onchain) {
  if (!row.escrow) continue;
  recordedAccounts.set(row.escrow, {
    address: row.escrow,
    mint: row.mint_address ?? vaultById.get(row.id)?.mintAddress ?? null,
    owner: row.escrow_owner ?? null,
    tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    amount: row.rpc_amount ?? null,
    decimals: row.rpc_getTokenAccountBalance?.result?.value?.decimals ?? null,
    uiAmount: row.rpc_uiAmount ?? null,
    slot: row.rpc_slot ?? null,
  });
}

const recordedRpc = {
  endpoint: RPC_ENDPOINT,
  async getTokenAccount(address) {
    return recordedAccounts.get(address) ?? null;
  },
  async getTokenAccountBalance(address) {
    const account = recordedAccounts.get(address);
    if (!account) return null;
    return {
      address,
      amount: account.amount ?? '0',
      decimals: account.decimals ?? 0,
      uiAmount: account.uiAmount ?? 0,
      slot: account.slot ?? null,
    };
  },
};

const baseSnapshot = createSnapshot({
  capturedAt: CAPTURED_AT,
  snapshotId: 'fixture-20260911T173421Z',
  source: {
    kind: 'fixture',
    exploreUrl: EXPLORE_URL,
    detailUrlTemplate: DASHBOARD_URL,
    vaultUrl: VAULT_URL,
    rpcEndpoint: RPC_ENDPOINT,
    fixturePath: 'fixtures/bounties-20260911T173421Z.json',
    evidence:
      'workstreams/new-sources/_gib/{explore-p1,details-all,vaults-all,onchain-verify}.json — public read-only captures 2026-09-11T17:11:25Z–17:34:21Z',
  },
  warnings: [
    'fixture replay: balances come from the recorded 2026-09-11T17:33:55Z Solana RPC reads, not from a live call',
  ],
  bounties,
});

const verified = await verifySnapshot(baseSnapshot, {
  rpcClient: recordedRpc,
  vaultUrl: VAULT_URL,
  vaultLookup: false,
  timeoutMs: 15000,
  now: new Date('2026-09-11T17:33:55Z'),
  reuseRecorded: false,
});

const fixture = {
  ...verified.snapshot,
  bounties: verified.snapshot.bounties.map((bounty) => ({
    ...bounty,
    verification: bounty.verification
      ? {
          ...bounty.verification,
          evidence: 'recorded',
          checkedAt: RPC_CAPTURED_AT,
          flags: bounty.verification.flags.filter((flag) => flag !== 'balance_only'),
        }
      : null,
  })),
};

const outFile = path.join(projectRoot, 'fixtures', 'bounties-20260911T173421Z.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

const counts = fixture.bounties.reduce(
  (acc, bounty) => {
    const status = bounty.verification?.status ?? 'unchecked';
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  },
  {},
);
console.log(`wrote ${path.relative(projectRoot, outFile)}`);
console.log(`bounties: ${fixture.bounties.length}`, counts);
