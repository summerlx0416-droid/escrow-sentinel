import assert from 'node:assert/strict';
import test from 'node:test';
import { fixturePath, readFixture, USDC_MINT } from './helpers.mjs';

test('fixture: committed snapshot keeps the 10 real W-A captures with recorded escrow evidence', () => {
  const snapshot = readFixture();
  assert.equal(snapshot.bounties.length, 10, 'fixture should hold 10 bounties');
  assert.equal(snapshot.source.kind, 'fixture');
  assert.match(snapshot.source.evidence ?? '', /new-sources/);
  assert.match(fixturePath(), /bounties-\d{8}T\d{6}Z\.json$/);

  const hackathon = snapshot.bounties.find((b) => b.id.startsWith('1052f22d'));
  assert.ok(hackathon, 'hackathon bounty must be present');
  assert.equal(hackathon.asset.symbol, 'USDC');
  assert.equal(hackathon.advertisedPool, 1000);
  assert.equal(hackathon.ledger.address, '9Nw5KFDj2vZsBJnQiYpKxpr9K2P1UkJGooLX9MtPWaEd');
  assert.equal(hackathon.ledger.balance, 1000);
  assert.equal(hackathon.verification.onchainAmount, 1000);
  assert.equal(hackathon.verification.status, 'verified');
  assert.equal(hackathon.verification.evidence, 'recorded');
  assert.equal(hackathon.health.submissionCount, 0);
  assert.ok(hackathon.gating.requiredDiscordRoleIds.includes('1546941199859060768'));
});

test('fixture: every row has an escrow address, a recorded check and no invented numbers', () => {
  const snapshot = readFixture();
  for (const bounty of snapshot.bounties) {
    assert.ok(bounty.ledger.address, `${bounty.id} needs an escrow address`);
    assert.ok(bounty.verification, `${bounty.id} needs a recorded verification`);
    assert.equal(bounty.verification.evidence, 'recorded');
    assert.ok(['verified', 'mismatch', 'unknown'].includes(bounty.verification.status));
    if (bounty.verification.status === 'verified') {
      assert.equal(typeof bounty.verification.onchainAmount, 'number');
    }
  }
  const usdcMints = new Set(
    snapshot.bounties.filter((b) => b.asset.symbol === 'USDC').map((b) => b.asset.mintAddress),
  );
  assert.deepEqual([...usdcMints], [USDC_MINT]);
});

test('fixture: the $300 CREDITS bounty is flagged as partially funded and label-mismatched', () => {
  const snapshot = readFixture();
  const credits = snapshot.bounties.find((b) => b.asset.symbol === 'CREDITS');
  assert.ok(credits, 'CREDITS bounty must exist in the fixture');
  assert.equal(credits.advertisedPool, 300);
  assert.equal(credits.ledger.balance, 120);
  assert.equal(credits.verification.coverage, 0.4);
  assert.ok(credits.verification.flags.includes('coverage_partial'));
  assert.ok(credits.verification.flags.includes('title_asset_hint_mismatch'));
});
