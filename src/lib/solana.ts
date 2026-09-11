import { redactUrl, toNumber, toStr } from './util.js';

export interface SolanaRpcOptions {
  url: string;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

export class RpcError extends Error {
  readonly method: string;
  readonly code: number | null;

  constructor(method: string, message: string, code: number | null = null) {
    super(`rpc ${method}: ${message}`);
    this.name = 'RpcError';
    this.method = method;
    this.code = code;
  }
}

let requestId = 1;

/** Single JSON-RPC 2.0 call against a Solana RPC endpoint. Read-only by construction. */
export async function rpcCall<T>(method: string, params: unknown[], options: SolanaRpcOptions): Promise<T> {
  const { url, timeoutMs = 15_000, retries = 1, fetchImpl = fetch } = options;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: requestId++, method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 429 || response.status >= 500) {
        throw new RpcError(method, `HTTP ${response.status}`, response.status);
      }
      const payload = (await response.json()) as {
        result?: T;
        error?: { code?: number; message?: string };
      };
      if (payload.error) {
        throw new RpcError(method, payload.error.message ?? 'unknown RPC error', payload.error.code ?? null);
      }
      if (payload.result === undefined) {
        throw new RpcError(method, 'RPC response had neither result nor error');
      }
      return payload.result;
    } catch (error) {
      lastError = error;
      if (attempt < retries) continue;
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface TokenAccount {
  address: string;
  mint: string | null;
  owner: string | null;
  tokenProgram: string | null;
  amount: string | null;
  decimals: number | null;
  uiAmount: number | null;
  slot: number | null;
}

export interface TokenBalance {
  address: string;
  amount: string;
  decimals: number;
  uiAmount: number;
  slot: number | null;
}

export interface RpcClient {
  readonly endpoint: string;
  getTokenAccount(address: string): Promise<TokenAccount | null>;
  getTokenAccountBalance(address: string): Promise<TokenBalance | null>;
}

interface AccountInfoResponse {
  context?: { slot?: number };
  value?: {
    owner?: string;
    data?: {
      parsed?: {
        info?: {
          mint?: string;
          owner?: string;
          tokenAmount?: { amount?: string; decimals?: number; uiAmount?: number | null; uiAmountString?: string };
        };
      };
    };
  } | null;
}

interface BalanceResponse {
  context?: { slot?: number };
  value?: { amount?: string; decimals?: number; uiAmount?: number | null; uiAmountString?: string };
}

function amountFromRaw(raw: string | null, decimals: number | null): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (decimals === null) return value;
  return value / 10 ** decimals;
}

/**
 * Read-only Solana client backed by `getAccountInfo` (jsonParsed) and
 * `getTokenAccountBalance`. It never sends a transaction and never touches a keypair.
 */
export function createRpcClient(options: SolanaRpcOptions): RpcClient {
  const endpoint = redactUrl(options.url) ?? 'unknown';
  return {
    endpoint,
    async getTokenAccount(address: string): Promise<TokenAccount | null> {
      const result = await rpcCall<AccountInfoResponse>('getAccountInfo', [address, { encoding: 'jsonParsed' }], options);
      const value = result.value;
      if (!value) return null;
      const info = value.data?.parsed?.info ?? {};
      const tokenAmount = info.tokenAmount ?? {};
      const decimals = toNumber(tokenAmount.decimals);
      const amount = toStr(tokenAmount.amount);
      const uiAmount = tokenAmount.uiAmount ?? amountFromRaw(amount, decimals);
      return {
        address,
        mint: toStr(info.mint),
        owner: toStr(info.owner),
        tokenProgram: toStr(value.owner),
        amount,
        decimals,
        uiAmount,
        slot: toNumber(result.context?.slot),
      };
    },
    async getTokenAccountBalance(address: string): Promise<TokenBalance | null> {
      const result = await rpcCall<BalanceResponse>('getTokenAccountBalance', [address], options);
      const value = result.value;
      if (!value) return null;
      const amount = toStr(value.amount) ?? '0';
      const decimals = toNumber(value.decimals) ?? 0;
      const uiAmount = value.uiAmount ?? amountFromRaw(amount, decimals) ?? 0;
      return { address, amount, decimals, uiAmount, slot: toNumber(result.context?.slot) };
    },
  };
}
