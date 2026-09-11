import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { distImport, makeBounty, makeSnapshot, readFixture, projectRoot } from './helpers.mjs';

const { renderReportCsv, renderReportMarkdown, buildReportJson, writeReports, csvEscape } = await distImport('lib/report.js');
const { rankBounties } = await distImport('lib/score.js');
const { diffSnapshots } = await distImport('lib/diff.js');

const NOW = new Date('2026-09-11T18:00:00Z');

test('report: CSV has a stable header, one row per ranked bounty and escaped commas', () => {
  const ranked = rankBounties(
    [makeBounty({ id: 'a', title: 'Has, a comma "and" quotes' }), makeBounty({ id: 'b', title: 'Plain' })],
    { now: NOW },
  );
  const csv = renderReportCsv(ranked);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^rank,id,title,url,status,is_open,asset_symbol/);
  assert.match(lines[1], /"Has, a comma ""and"" quotes"/);
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape(null), '');
});

test('report: markdown carries the ranking, escrow evidence and the method section', () => {
  const snapshot = makeSnapshot([makeBounty({ id: 'x', title: 'Example bounty' })], { snapshotId: 'snap-md' });
  const ranked = rankBounties(snapshot.bounties, { now: NOW, top: 1 });
  const markdown = renderReportMarkdown({
    command: 'report',
    generatedAt: '2026-09-11T18:00:00Z',
    snapshot,
    ranked,
    verification: { checked: 1, verified: 1, mismatch: 0, unknown: 0 },
    warnings: [],
    rpcEndpoint: 'https://api.mainnet-beta.solana.com',
    diff: null,
    topN: 1,
  });
  assert.match(markdown, /# Escrow Sentinel — Gibwork bounty report/);
  assert.match(markdown, /Example bounty/);
  assert.match(markdown, /Escrow verification detail/);
  assert.match(markdown, /## Method/);
  assert.match(markdown, /1 verified \/ 0 mismatch \/ 0 unknown/);
});

test('report: JSON payload exposes ranking, escrow status and provenance', () => {
  const snapshot = makeSnapshot([makeBounty({ id: 'y' })], { snapshotId: 'snap-json' });
  const ranked = rankBounties(snapshot.bounties, { now: NOW });
  const payload = buildReportJson({
    command: 'report',
    snapshot,
    ranked,
    verification: { checked: 1, verified: 1, mismatch: 0, unknown: 0 },
    warnings: [],
    rpcEndpoint: 'https://rpc.test',
    diff: null,
    topN: 1,
  });
  assert.equal(payload.tool.name, 'escrow-sentinel');
  assert.equal(payload.snapshot.snapshotId, 'snap-json');
  assert.equal(payload.ranking.length, 1);
  assert.equal(payload.ranking[0].escrow.status, 'verified');
  assert.equal(payload.ranking[0].escrow.onchainAmount, 1000);
  assert.equal(typeof payload.ranking[0].score.score, 'number');
  assert.equal(payload.bounties.length, 1);
});

test('report: writeReports creates report.md / report.csv / report.json / snapshot.json + diff.md', () => {
  const fixture = readFixture();
  const snapshot = makeSnapshot(fixture.bounties.slice(0, 3), { snapshotId: 'snap-write' });
  const ranked = rankBounties(snapshot.bounties, { now: NOW, top: 3 });
  const diff = diffSnapshots(makeSnapshot([], { snapshotId: 'empty' }), snapshot, { generatedAt: '2026-09-11T18:00:00Z' });
  const outDir = path.join(projectRoot, 'tmp', 'test-reports');
  fs.rmSync(outDir, { recursive: true, force: true });

  const written = writeReports(
    {
      command: 'report',
      generatedAt: '2026-09-11T18:00:00Z',
      snapshot,
      ranked,
      verification: { checked: 3, verified: 3, mismatch: 0, unknown: 0 },
      warnings: [],
      rpcEndpoint: 'https://rpc.test',
      diff,
      topN: 3,
    },
    outDir,
  );

  for (const file of [written.files.markdown, written.files.csv, written.files.json, written.files.snapshot, written.files.diff]) {
    assert.ok(file && fs.existsSync(file), `${file} should exist`);
  }
  const csv = fs.readFileSync(written.files.csv, 'utf8');
  assert.equal(csv.trim().split('\n').length, 4);
  const json = JSON.parse(fs.readFileSync(written.files.json, 'utf8'));
  assert.equal(json.ranking.length, 3);
  fs.rmSync(path.dirname(written.files.markdown), { recursive: true, force: true });
});
