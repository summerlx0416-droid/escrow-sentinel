import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { distImport, USDC_MINT } from './helpers.mjs';

const { createRpcClient, rpcCall, RpcError } = await distImport('lib/solana.js');

const ACCOUNT = '9Nw5KFDj2vZsBJnQiYpKxpr9K2P1UkJGooLX9MtPWaEd';

async function withFakeRpc(handler, run) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const request = JSON.parse(body);
      const response = handler(request, req);
      res.writeHead(response.status ?? 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(response.body));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('rpc: getAccountInfo jsonParsed is mapped onto a token account', async () => {
  await withFakeRpc(
    (request) => ({
      body: {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          context: { slot: 446217696 },
          value: {
            owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            data: {
              parsed: {
                info: {
                  mint: USDC_MINT,
                  owner: 'ZdqFKmWdCf1baix1fmPkX9mpgZzKUFtbsvuqc9JisS3',
                  tokenAmount: { amount: '1000000000', decimals: 6, uiAmount: 1000, uiAmountString: '1000' },
                },
              },
            },
          },
        },
      },
    }),
    async (url) => {
      const client = createRpcClient({ url, timeoutMs: 5000, retries: 0 });
      assert.equal(client.endpoint, 'http://127.0.0.1:' + new URL(url).port);
      const account = await client.getTokenAccount(ACCOUNT);
      assert.equal(account.mint, USDC_MINT);
      assert.equal(account.uiAmount, 1000);
      assert.equal(account.decimals, 6);
      assert.equal(account.slot, 446217696);
      assert.equal(account.tokenProgram, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    },
  );
});

test('rpc: a missing account returns null instead of throwing', async () => {
  await withFakeRpc(
    (request) => ({ body: { jsonrpc: '2.0', id: request.id, result: { context: { slot: 1 }, value: null } } }),
    async (url) => {
      const client = createRpcClient({ url, timeoutMs: 5000, retries: 0 });
      assert.equal(await client.getTokenAccount(ACCOUNT), null);
    },
  );
});

test('rpc: getTokenAccountBalance parses the balance envelope', async () => {
  await withFakeRpc(
    (request) => ({
      body: {
        jsonrpc: '2.0',
        id: request.id,
        result: { context: { slot: 99 }, value: { amount: '120000000000', decimals: 9, uiAmount: 120, uiAmountString: '120' } },
      },
    }),
    async (url) => {
      const client = createRpcClient({ url, timeoutMs: 5000, retries: 0 });
      const balance = await client.getTokenAccountBalance(ACCOUNT);
      assert.equal(balance.amount, '120000000000');
      assert.equal(balance.uiAmount, 120);
      assert.equal(balance.slot, 99);
    },
  );
});

test('rpc: JSON-RPC errors and HTTP 429 both surface as RpcError', async () => {
  await withFakeRpc(
    (request) => ({ body: { jsonrpc: '2.0', id: request.id, error: { code: -32005, message: 'rate limited' } } }),
    async (url) => {
      await assert.rejects(
        () => rpcCall('getAccountInfo', [ACCOUNT], { url, timeoutMs: 5000, retries: 0 }),
        (error) => error instanceof RpcError && error.code === -32005 && /rate limited/.test(error.message),
      );
    },
  );

  await withFakeRpc(
    () => ({ status: 429, body: { message: 'too many requests' } }),
    async (url) => {
      await assert.rejects(
        () => rpcCall('getAccountInfo', [ACCOUNT], { url, timeoutMs: 5000, retries: 0 }),
        (error) => error instanceof RpcError && error.code === 429,
      );
    },
  );
});
