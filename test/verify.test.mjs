import assert from 'node:assert/strict';
import test from 'node:test';
import { distImport, makeBounty, makeRpcClient, TEST_ESCROW, USDC_MINT } from './helpers.mjs';

const { verifyBounty, verifySnapshot } = await distImport('lib/verify.js');
const { RpcError } = await distImport('lib/solana.js');

const NOW = new Date('2026-09-11T18:00:00Z');
const BASE_OPTIONS = {
  vaultUrl: 'https://api.gib.work/vaults',
  vaultLookup: false,
  timeoutMs: 1000,
  now: NOW,
  reuseRecorded: false,
};

test('verify: matching ledger and chain balance resolve to verified with full coverage', async () => {
  const bounty = makeBounty({ id: 'ok' });
  const verified = await verifyBounty(bounty, { ...BASE_OPTIONS, rpcClient: makeRpcClient({ mode: 'ok' }) });
  assert.equal(verified.verification.status, 'verified');
  assert.equal(verified.verification.evidence, 'live');
  assert.equal(verified.verification.onchainAmount, 1000);
  assert.equal(verified.verification.onchainMint, USDC_MINT);
  assert.equal(verified.verification.coverage, 1);
  assert.equal(verified.verification.slot, 446217696);
  assert.deepEqual(verified.verification.flags, []);
});

test('verify: a smaller on-chain balance than the ledger is a mismatch', async () => {
  const bounty = makeBounty({ id: 'short', ledger: { balance: 1000 } });
  const verified = await verifyBounty(bounty, {
    ...BASE_OPTIONS,
    rpcClient: makeRpcClient({ mode: 'ok', account: { uiAmount: 250, amount: '250000000' } }),
  });
  assert.equal(verified.verification.status, 'mismatch');
  assert.ok(verified.verification.flags.includes('ledger_mismatch'));
  assert.match(verified.verification.reason ?? '', /1000.*250|250.*1000/);
});

test('verify: an RPC failure degrades to unknown instead of inventing a balance', async () => {
  const bounty = makeBounty({ id: 'rate-limited' });
  const verified = await verifyBounty(bounty, {
    ...BASE_OPTIONS,
    rpcClient: makeRpcClient({ mode: 'throw', error: new RpcError('getAccountInfo', 'HTTP 429', 429) }),
  });
  assert.equal(verified.verification.status, 'unknown');
  assert.equal(verified.verification.onchainAmount, null);
  assert.ok(verified.verification.flags.includes('rpc_error'));
  assert.match(verified.verification.reason, /rpc_error/);
  assert.match(verified.verification.reason, /429/);
});

test('verify: a missing escrow token account is unknown, not verified', async () => {
  const bounty = makeBounty({ id: 'missing' });
  const verified = await verifyBounty(bounty, { ...BASE_OPTIONS, rpcClient: makeRpcClient({ mode: 'not-found' }) });
  assert.equal(verified.verification.status, 'unknown');
  assert.ok(verified.verification.flags.includes('escrow_account_not_found'));
});

test('verify: a failing vault lookup leaves the row unknown with a clear reason', async () => {
  const bounty = makeBounty({ id: 'no-address', ledger: { address: null } });
  const verified = await verifyBounty(bounty, {
    ...BASE_OPTIONS,
    vaultLookup: true,
    rpcClient: makeRpcClient({ mode: 'ok' }),
    fetchImpl: async () => {
      throw new Error('network down');
    },
  });
  assert.equal(verified.verification.status, 'unknown');
  assert.equal(verified.verification.onchainAmount, null);
  assert.ok(verified.verification.flags.includes('vault_lookup_failed'));
  assert.match(verified.verification.reason ?? '', /vault lookup failed/);
});

test('verify: offline replay keeps recorded evidence and never calls the RPC', async () => {
  const bounty = makeBounty({
    id: 'recorded',
    verification: { status: 'verified', evidence: 'recorded', checkedAt: '2026-09-11T17:33:55Z', onchainAmount: 1000 },
  });
  let calls = 0;
  const countingClient = {
    endpoint: 'https://rpc.test',
    async getTokenAccount() {
      calls += 1;
      return null;
    },
    async getTokenAccountBalance() {
      calls += 1;
      return null;
    },
  };
  const verified = await verifyBounty(bounty, { ...BASE_OPTIONS, rpcClient: countingClient, reuseRecorded: true });
  assert.equal(calls, 0, 'no network call when replaying recorded evidence');
  assert.equal(verified.verification.status, 'verified');
  assert.equal(verified.verification.evidence, 'recorded');
});

test('verify: offline replay of a snapshot also keeps an earlier live check untouched', async () => {
  const bounty = makeBounty({
    id: 'live-snapshot',
    verification: { status: 'verified', evidence: 'live', checkedAt: '2026-09-11T18:02:06Z', onchainAmount: 1000, slot: 446220126 },
  });
  let calls = 0;
  const countingClient = {
    endpoint: 'https://rpc.test',
    async getTokenAccount() {
      calls += 1;
      return null;
    },
    async getTokenAccountBalance() {
      calls += 1;
      return null;
    },
  };
  const verified = await verifyBounty(bounty, { ...BASE_OPTIONS, rpcClient: countingClient, reuseRecorded: true });
  assert.equal(calls, 0);
  assert.equal(verified.verification.evidence, 'live');
  assert.equal(verified.verification.slot, 446220126);

  // ... and an offline run over a snapshot without any verification stays unknown.
  const unchecked = makeBounty({ id: 'never-checked', verification: null });
  const replayed = await verifyBounty(unchecked, { ...BASE_OPTIONS, rpcClient: null, reuseRecorded: true });
  assert.equal(replayed.verification.status, 'unknown');
  assert.ok(replayed.verification.flags.includes('rpc_disabled'));
});

test('verify: an escrowed asset that does not match the advertised symbol is flagged', async () => {
  const bounty = makeBounty({
    id: 'credits',
    asset: { symbol: 'CREDITS', advertisedValue: 300, mintAddress: '29bHTjaAdZ2s2ZCAy5m7UkFy4m4hxBCRUA7sVAAAGsRT' },
    advertisedPool: 300,
    ledger: { balance: 120, symbol: 'CREDITS', mintAddress: '29bHTjaAdZ2s2ZCAy5m7UkFy4m4hxBCRUA7sVAAAGsRT' },
  });
  const verified = await verifyBounty(bounty, {
    ...BASE_OPTIONS,
    rpcClient: makeRpcClient({
      mode: 'ok',
      account: { mint: '29bHTjaAdZ2s2ZCAy5m7UkFy4m4hxBCRUA7sVAAAGsRT', uiAmount: 120, amount: '120000000000', decimals: 9 },
    }),
  });
  assert.equal(verified.verification.status, 'verified');
  assert.equal(verified.verification.coverage, 0.4);
  assert.ok(verified.verification.flags.includes('coverage_partial'));
});

test('verify: snapshot level summary counts verified / mismatch / unknown', async () => {
  const snapshot = {
    schemaVersion: 1,
    tool: { name: 'escrow-sentinel', version: '0.1.0' },
    snapshotId: 'snap',
    capturedAt: '2026-09-11T18:00:00Z',
    source: {
      kind: 'live',
      exploreUrl: 'x',
      detailUrlTemplate: 'y',
      vaultUrl: 'z',
      rpcEndpoint: null,
      fixturePath: null,
      evidence: null,
    },
    warnings: [],
    bounties: [
      makeBounty({ id: 'v1' }),
      makeBounty({ id: 'm1', ledger: { balance: 999 } }),
      makeBounty({ id: 'u1', ledger: { address: null } }),
    ],
  };
  const result = await verifySnapshot(snapshot, {
    ...BASE_OPTIONS,
    rpcClient: {
      endpoint: 'https://rpc.test',
      async getTokenAccount(address) {
        if (address === TEST_ESCROW) {
          return { address, mint: USDC_MINT, owner: null, tokenProgram: null, amount: '1000000000', decimals: 6, uiAmount: 1000, slot: 5 };
        }
        return null;
      },
      async getTokenAccountBalance() {
        return null;
      },
    },
  });
  assert.equal(result.summary.checked, 3);
  assert.equal(result.summary.verified, 1);
  assert.equal(result.summary.mismatch, 1);
  assert.equal(result.summary.unknown, 1);
});
