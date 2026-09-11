import assert from 'node:assert/strict';
import test from 'node:test';
import { distImport, makeBounty, makeSnapshot } from './helpers.mjs';

const { diffSnapshots, renderDiffMarkdown } = await distImport('lib/diff.js');

test('diff: detects added, removed and field-level changes between two snapshots', () => {
  const before = makeSnapshot(
    [
      makeBounty({ id: 'keep', health: { submissionCount: 10, approvedCount: 1, rejectedCount: 0, pendingCount: 9, rewardDensity: 1, bountyUsd: 1, status: 'healthy' } }),
      makeBounty({ id: 'gone', title: 'Expired bounty', advertisedPool: 2, ledger: { balance: 2 } }),
      makeBounty({ id: 'shrink', ledger: { balance: 100, totalWithdrawn: 0 } }),
      makeBounty({ id: 'stable', title: 'Nothing moves here' }),
    ],
    { snapshotId: 'old', capturedAt: '2026-09-11T17:00:00Z' },
  );
  const after = makeSnapshot(
    [
      makeBounty({ id: 'keep', health: { submissionCount: 12, approvedCount: 2, rejectedCount: 0, pendingCount: 10, rewardDensity: 1, bountyUsd: 1, status: 'healthy' } }),
      makeBounty({ id: 'shrink', ledger: { balance: 60, totalWithdrawn: 40 }, verification: { onchainAmount: 60, coverage: 0.06 } }),
      makeBounty({ id: 'brand-new', title: 'Fresh bounty' }),
      makeBounty({ id: 'stable', title: 'Nothing moves here' }),
    ],
    { snapshotId: 'new', capturedAt: '2026-09-11T18:00:00Z' },
  );

  const diff = diffSnapshots(before, after, { oldPath: 'old.json', newPath: 'new.json', generatedAt: '2026-09-11T18:00:00Z' });
  assert.deepEqual(diff.added.map((row) => row.id), ['brand-new']);
  assert.deepEqual(diff.removed.map((row) => row.id), ['gone']);
  assert.equal(diff.unchangedCount, 1);

  const keep = diff.changed.find((row) => row.id === 'keep');
  assert.ok(keep);
  assert.deepEqual(keep.fields.map((f) => f.field), ['submissionCount', 'approvedCount']);
  assert.deepEqual(
    keep.fields.map((f) => [f.before, f.after]),
    [
      [10, 12],
      [1, 2],
    ],
  );

  const shrink = diff.changed.find((row) => row.id === 'shrink');
  assert.ok(shrink);
  const fields = shrink.fields.map((f) => f.field);
  assert.ok(fields.includes('ledgerBalance'));
  assert.ok(fields.includes('ledgerTotalWithdrawn'));
  assert.ok(fields.includes('onchainAmount'));

  assert.match(diff.summary[0], /1 new, 1 gone, 2 changed, 1 unchanged/);
  assert.match(diff.summary[1], /added: Fresh bounty/);

  const markdown = renderDiffMarkdown(diff);
  assert.match(markdown, /snapshot diff/);
  assert.match(markdown, /Expired bounty/);
});

test('diff: identical snapshots report no changes', () => {
  const snapshot = makeSnapshot([makeBounty({ id: 'same' })], { snapshotId: 'a' });
  const diff = diffSnapshots(snapshot, snapshot);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.changed.length, 0);
  assert.equal(diff.unchangedCount, 1);
});
