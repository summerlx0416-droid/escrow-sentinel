import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { projectRoot, tempRoot } from './helpers.mjs';

function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [path.join(projectRoot, 'dist', 'cli.js'), ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, ESCROW_SENTINEL_ROOT: options.root ?? projectRoot, ESCROW_SENTINEL_OFFLINE: options.offline ? '1' : '' },
    timeout: 60_000,
  });
  return result;
}

test('cli: discover --source fixture --offline --json returns the committed snapshot as JSON', () => {
  const root = tempRoot('discover');
  const result = runCli(['discover', '--source', 'fixture', '--offline', '--json'], { root });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.origin, 'fixture');
  assert.equal(payload.bounties.length, 10);
  assert.ok(fs.existsSync(payload.saved), 'snapshot file should be written under the temp root');
  assert.ok(payload.saved.startsWith(root), 'writes must stay inside the configured root');
});

test('cli: rank --json honours --top on the newest snapshot', () => {
  const root = tempRoot('rank');
  const discover = runCli(['discover', '--source', 'fixture', '--offline', '--json'], { root });
  assert.equal(discover.status, 0, discover.stderr);
  const result = runCli(['rank', '--json', '--top', '3'], { root });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ranking.length, 3);
  assert.equal(payload.ranking[0].id, '1052f22d-3f87-4b1d-b0d7-71a60679e7fa');
  assert.equal(payload.ranking[0].escrowStatus, 'verified');
  assert.ok(payload.ranking[0].score.score > payload.ranking[1].score.score);
});

test('cli: verify --offline replays recorded evidence and never claims a live check', () => {
  const root = tempRoot('verify');
  runCli(['discover', '--source', 'fixture', '--offline', '--json'], { root });
  const result = runCli(['verify', '--offline', '--json'], { root });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.summary.checked, 10);
  assert.equal(payload.summary.verified, 10);
  assert.equal(payload.summary.unknown, 0);
  for (const row of payload.bounties) {
    assert.equal(row.verification.evidence, 'recorded');
  }
});

test('cli: discover falls back to the fixture when the live API is unreachable', () => {
  const root = tempRoot('fallback');
  const result = runCli(['discover', '--json', '--explore-url', 'http://127.0.0.1:9/explore'], { root });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.origin, 'fixture');
  assert.equal(payload.usedFallback, true);
  assert.match(payload.warnings.join(' '), /fell back to/);
});

test('cli: the MCP stdio server answers initialize and tools/list over pipes', async () => {
  const child = spawn(process.execPath, [path.join(projectRoot, 'dist', 'cli.js'), 'mcp'], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ESCROW_SENTINEL_ROOT: tempRoot('mcp') },
  });

  let buffer = '';
  const messages = [];
  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for MCP responses')), 30_000);
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim() !== '') messages.push(JSON.parse(line));
      }
      if (messages.length >= 2) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('error', reject);
  });

  try {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    await received;
    assert.equal(messages[0].id, 1);
    assert.equal(messages[0].result.protocolVersion, '2024-11-05');
    const toolNames = messages[1].result.tools.map((tool) => tool.name);
    assert.ok(toolNames.includes('gib_list_bounties'));
    assert.ok(toolNames.includes('gib_verify_escrow'));
    assert.ok(toolNames.includes('gib_snapshot_diff'));
  } finally {
    child.kill();
  }
});

test('cli: an unknown command exits with code 2 and prints usage', () => {
  const result = runCli(['frobnicate']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown command/);
});
