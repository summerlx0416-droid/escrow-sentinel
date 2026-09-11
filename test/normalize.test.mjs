import assert from 'node:assert/strict';
import test from 'node:test';
import { distImport } from './helpers.mjs';

const { normalizeExplorePayload, extractDetailFromHtml, mergeDetail } = await distImport('lib/normalize.js');

const EXPLORE_PAYLOAD = {
  lastPage: 1,
  page: 1,
  limit: 15,
  total: 2,
  results: [
    {
      id: '1052f22d-3f87-4b1d-b0d7-71a60679e7fa',
      title: 'Gibwork Developer Hackathon Bounty',
      content: 'Join this Gibwork Developer Hackathon bounty ...',
      deadline: '2026-10-30T04:00:00.000Z',
      tags: ['Development'],
      status: 'CREATED',
      isOpen: true,
      allowOnlyVerifiedSubmissions: false,
      remainingAmount: 1000,
      xpBonus: 936,
      asset: {
        symbol: 'USDC',
        mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000000',
        price: 1000,
        decimals: 6,
      },
      user: { username: 'gibwork' },
    },
    { id: 'broken', title: null },
  ],
};

test('normalize: explore payload maps onto the bounty model and skips malformed rows', () => {
  const { bounties, meta } = normalizeExplorePayload(EXPLORE_PAYLOAD, {
    capturedAt: '2026-09-11T17:11:25Z',
    note: 'https://api.gib.work/explore?page=1',
    source: 'live',
    detailUrlTemplate: 'https://gib.work/bounty/{id}',
  });
  assert.equal(bounties.length, 1, 'the malformed row is dropped, not guessed');
  assert.equal(meta.total, 2);
  const bounty = bounties[0];
  assert.equal(bounty.id, '1052f22d-3f87-4b1d-b0d7-71a60679e7fa');
  assert.equal(bounty.url, 'https://gib.work/bounty/1052f22d-3f87-4b1d-b0d7-71a60679e7fa');
  assert.equal(bounty.asset.advertisedValue, 1000);
  assert.equal(bounty.asset.mintAddress, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  assert.equal(bounty.advertisedPool, 1000);
  assert.equal(bounty.creator, 'gibwork');
  assert.equal(bounty.health.submissionCount, null, 'listing alone cannot know the submission count');
  assert.equal(bounty.ledger.address, null);
  assert.equal(bounty.verification, null);
});

test('normalize: detail extraction reads health metrics and gating from the escaped flight payload', () => {
  const html = `<script>self.__next_f.push([1,"{\\"health\\":{\\"status\\":\\"healthy\\",\\"label\\":\\"Healthy\\",\\"metrics\\":{\\"bountyUsd\\":1000,\\"submissionCount\\":0,\\"approvedCount\\":0,\\"rejectedCount\\":0,\\"pendingCount\\":0,\\"rewardDensity\\":1000}},\\"minSubmissionAmount\\":50,\\"requiredDiscordGuildId\\":\\"1004566368475164683\\",\\"requiredDiscordRoleIds\\":[\\"1546941199859060768\\"],\\"allowOnlyDiscordGuildSubmissions\\":false,\\"maxSubmissions\\":null,\\"taskSubmissionsApprovedCount\\":0,\\"taskSubmissionsPendingCount\\":0,\\"taskSubmissionsRejectedCount\\":0,\\"status\\":\\"CREATED\\",\\"createdAt\\":\\"2026-09-08T18:26:43.726Z\\",\\"deadline\\":\\"2026-10-30T04:00:00.000Z\\"}"])</script>`;
  const detail = extractDetailFromHtml(html);
  assert.equal(detail.health.status, 'healthy');
  assert.equal(detail.health.submissionCount, 0);
  assert.equal(detail.taskStatus, 'CREATED');
  assert.equal(detail.minSubmissionAmount, 50);
  assert.equal(detail.requiredDiscordGuildId, '1004566368475164683');
  assert.deepEqual(detail.requiredDiscordRoleIds, ['1546941199859060768']);
  assert.equal(detail.maxSubmissions, null);
  assert.equal(detail.deadline, '2026-10-30T04:00:00.000Z');
});

test('normalize: expired bounty pages lose `health` but keep counters, and CLOSED flips isOpen', () => {
  const html = `<script>self.__next_f.push([1,"{\\"maxSubmissions\\":10,\\"deadline\\":\\"2026-09-11T17:49:19.883Z\\",\\"taskSubmissionsApprovedCount\\":0,\\"taskSubmissionsPendingCount\\":5,\\"taskSubmissionsRejectedCount\\":0,\\"minSubmissionAmount\\":1,\\"health\\":null,\\"status\\":\\"CLOSED\\"}"])</script>`;
  const detail = extractDetailFromHtml(html);
  assert.equal(detail.taskStatus, 'CLOSED');
  assert.equal(detail.health.submissionCount, 5);
  assert.equal(detail.health.pendingCount, 5);
  assert.equal(detail.health.status, 'CLOSED');

  const bounty = {
    id: 'x',
    title: 'expired',
    status: 'CREATED',
    isOpen: true,
    createdAt: null,
    deadline: null,
    health: { status: null, submissionCount: null, approvedCount: null, rejectedCount: null, pendingCount: null, rewardDensity: null, bountyUsd: null },
    gating: {
      minSubmissionAmount: null,
      allowOnlyVerifiedSubmissions: null,
      minTwitterFollowers: null,
      maxSubmissions: null,
      requiredDiscordGuildId: null,
      requiredDiscordRoleIds: [],
      allowOnlyDiscordGuildSubmissions: null,
    },
  };
  const merged = mergeDetail(bounty, detail);
  assert.equal(merged.status, 'CLOSED');
  assert.equal(merged.isOpen, false, 'the detail page wins over a stale listing flag');
  assert.equal(merged.health.submissionCount, 5);
});
