import assert from 'node:assert/strict';
import test from 'node:test';
import { distImport, makeBounty } from './helpers.mjs';

const { rankBounties, scoreBounty, VALUE_CEILING_USD } = await distImport('lib/score.js');

const NOW = new Date('2026-09-11T18:00:00Z');
const DEADLINE_FAR = '2026-10-30T04:00:00.000Z';

test('score: more on-chain value ranks higher, and value is capped at the ceiling', () => {
  const big = makeBounty({ id: 'a', verification: { status: 'verified', onchainAmount: 1000, coverage: 1 } });
  const small = makeBounty({ id: 'b', verification: { status: 'verified', onchainAmount: 20, coverage: 1 } });
  const bigScore = scoreBounty(big, NOW);
  const smallScore = scoreBounty(small, NOW);
  assert.ok(bigScore.valueScore > smallScore.valueScore);
  assert.equal(bigScore.valueScore, 1, `1000 USD is the documented ceiling (${VALUE_CEILING_USD})`);
  assert.ok(bigScore.score > smallScore.score);
  assert.equal(bigScore.valueBasis, 'onchain');
});

test('score: unknown escrow falls back to the platform number but loses trust points', () => {
  const unchecked = makeBounty({ id: 'c', verification: null });
  const scored = scoreBounty(unchecked, NOW);
  assert.equal(scored.trust, 'unchecked');
  assert.equal(scored.trustScore, 0.5);
  assert.equal(scored.valueBasis, 'platform');
  assert.equal(scored.valueUsd, 1000);
  assert.ok(scored.flags.includes('escrow_unchecked'));
});

test('score: a mismatch is heavily penalised and flagged', () => {
  const mismatch = makeBounty({ id: 'd', verification: { status: 'mismatch', flags: ['ledger_mismatch'], onchainAmount: 1 } });
  const verified = makeBounty({ id: 'e' });
  const mismatchScore = scoreBounty(mismatch, NOW);
  assert.equal(mismatchScore.trustScore, 0.1);
  assert.ok(mismatchScore.flags.includes('escrow_mismatch'));
  assert.ok(mismatchScore.score < scoreBounty(verified, NOW).score);
});

test('score: competition and deadline both move the score in the expected direction', () => {
  const quiet = makeBounty({ id: 'f', health: { submissionCount: 0 } });
  const crowded = makeBounty({ id: 'g', health: { submissionCount: 100 } });
  assert.ok(scoreBounty(quiet, NOW).competitionScore > scoreBounty(crowded, NOW).competitionScore);

  const soon = makeBounty({ id: 'h', deadline: '2026-09-12T18:00:00.000Z' });
  const later = makeBounty({ id: 'i', deadline: DEADLINE_FAR });
  assert.ok(scoreBounty(soon, NOW).urgencyScore > scoreBounty(later, NOW).urgencyScore);

  const unknown = makeBounty({ id: 'j', health: { submissionCount: null }, deadline: null });
  const unknownScore = scoreBounty(unknown, NOW);
  assert.ok(unknownScore.flags.includes('competition_unknown'));
  assert.ok(unknownScore.flags.includes('deadline_unknown'));
});

test('score: assets without a USD peg are never converted with an invented rate', () => {
  const credits = makeBounty({
    id: 'k',
    asset: { symbol: 'CREDITS', advertisedValue: 300, mintAddress: '29bHTjaAdZ2s2ZCAy5m7UkFy4m4hxBCRUA7sVAAAGsRT' },
    advertisedPool: 300,
    verification: { status: 'verified', onchainAmount: 120, coverage: 0.4, assetMatchesAdvertised: true, flags: ['coverage_partial'] },
  });
  const scored = scoreBounty(credits, NOW);
  assert.equal(scored.valueUsd, null);
  assert.equal(scored.valueBasis, 'unpriced_asset');
  assert.equal(scored.valueScore, 0);
  assert.equal(scored.coverageScore, 0.4);
  assert.ok(scored.flags.includes('unpriced_asset'));
  assert.ok(scored.flags.includes('escrow_partially_funded'));
});

test('rank: sorted by score descending with a deterministic id tie-break and a working top-N', () => {
  const rows = [
    makeBounty({ id: 'zzz', verification: { onchainAmount: 10 }, advertisedPool: 10 }),
    makeBounty({ id: 'aaa', verification: { onchainAmount: 10 }, advertisedPool: 10 }),
    makeBounty({ id: 'best', verification: { onchainAmount: 1000 }, advertisedPool: 1000 }),
  ];
  const ranked = rankBounties(rows, { now: NOW, top: 2 });
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].bounty.id, 'best');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[1].bounty.id, 'aaa', 'equal scores fall back to ascending id');

  const all = rankBounties(rows, { now: NOW });
  assert.equal(all.length, 3);
  assert.deepEqual(
    all.map((entry) => entry.rank),
    [1, 2, 3],
  );
});

test('rank: closed bounties are filtered out when onlyOpen is requested', () => {
  const rows = [makeBounty({ id: 'open' }), makeBounty({ id: 'closed', isOpen: false })];
  const openOnly = rankBounties(rows, { now: NOW, onlyOpen: true });
  assert.deepEqual(
    openOnly.map((entry) => entry.bounty.id),
    ['open'],
  );
  assert.equal(rankBounties(rows, { now: NOW, onlyOpen: false }).length, 2);
});
