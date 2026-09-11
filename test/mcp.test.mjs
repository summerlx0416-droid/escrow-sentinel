import assert from 'node:assert/strict';
import test from 'node:test';
import { distImport, fixturePath, makeRpcClient } from './helpers.mjs';

const { handleMessage, listTools, callTool, PROTOCOL_VERSION } = await distImport('mcp/server.js');
const { loadConfig } = await distImport('config.js');

const config = loadConfig(['--source', 'fixture', '--offline']).config;
const ctx = { config };

test('mcp: exposes the three required read-only tools plus a full report tool', () => {
  const names = listTools().map((tool) => tool.name);
  for (const required of ['gib_list_bounties', 'gib_verify_escrow', 'gib_snapshot_diff']) {
    assert.ok(names.includes(required), `${required} must be registered`);
  }
  assert.ok(names.includes('gib_report'));
  for (const tool of listTools()) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(tool.description.length > 40);
  }
});

test('mcp: initialize handshake negotiates the protocol version and lists capabilities', async () => {
  const response = await handleMessage(
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'test' } } },
    ctx,
  );
  assert.equal(response.id, 1);
  assert.equal(response.result.protocolVersion, PROTOCOL_VERSION);
  assert.deepEqual(response.result.capabilities.tools, { listChanged: false });
  assert.equal(response.result.serverInfo.name, 'escrow-sentinel');
});

test('mcp: tools/list is served and notifications get no reply', async () => {
  const response = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx);
  assert.equal(response.result.tools.length, listTools().length);
  const notification = await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx);
  assert.equal(notification, null);
  const unknown = await handleMessage({ jsonrpc: '2.0', id: 3, method: 'nope' }, ctx);
  assert.equal(unknown.error.code, -32601);
});

test('mcp: gib_verify_escrow verifies a raw escrow address with the injected RPC client', async () => {
  const result = await callTool(
    'gib_verify_escrow',
    { escrow_address: '9Nw5KFDj2vZsBJnQiYpKxpr9K2P1UkJGooLX9MtPWaEd', expected_amount: 1000 },
    { config, rpcClient: makeRpcClient({ mode: 'ok' }) },
  );
  assert.ok(!result.isError);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.escrow.status, 'verified');
  assert.equal(payload.escrow.onchainAmount, 1000);
  assert.equal(payload.escrow.platformLedgerBalance, 1000);
});

test('mcp: gib_verify_escrow reports unknown when the RPC call fails', async () => {
  const result = await callTool(
    'gib_verify_escrow',
    { escrow_address: '9Nw5KFDj2vZsBJnQiYpKxpr9K2P1UkJGooLX9MtPWaEd' },
    { config, rpcClient: makeRpcClient({ mode: 'throw', error: new Error('HTTP 429 rate limited') }) },
  );
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.escrow.status, 'unknown');
  assert.ok(payload.escrow.flags.includes('rpc_error'));
});

test('mcp: gib_snapshot_diff compares the committed fixture with itself and gib_list_bounties works offline', async () => {
  const file = fixturePath();
  const diff = await callTool('gib_snapshot_diff', { old: file, new: file }, { config });
  assert.match(diff.content[0].text, /snapshot diff/);
  assert.match(diff.content[0].text, /0 new, 0 gone, 0 changed, 10 unchanged/);

  const jsonDiff = await callTool('gib_snapshot_diff', { old: file, new: file, format: 'json' }, { config });
  const parsed = JSON.parse(jsonDiff.content[0].text);
  assert.equal(parsed.unchangedCount, 10);

  const list = await callTool('gib_list_bounties', { top: 3 }, { config });
  const payload = JSON.parse(list.content[0].text);
  assert.equal(payload.ranking.length, 3);
  assert.equal(payload.snapshot.source.kind, 'fixture');
  assert.equal(payload.ranking[0].id, '1052f22d-3f87-4b1d-b0d7-71a60679e7fa');
  assert.equal(payload.ranking[0].escrow.status, 'verified');
});

test('mcp: unknown tool names come back as an error result, not a crash', async () => {
  const result = await callTool('gib_does_not_exist', {}, ctx);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Unknown tool/);
});
