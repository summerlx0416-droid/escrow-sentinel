import type { EscrowLedger } from '../types.js';
import { HttpError, errorMessage, fetchWithRetry, toBool, toNumber, toStr } from './util.js';

export interface VaultLookup {
  ledger: EscrowLedger | null;
  error: string | null;
  httpStatus: number | null;
}

function toIsoFromUnix(value: unknown): string | null {
  const seconds = toNumber(value);
  if (seconds === null || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Map the platform vault payload onto the internal ledger model. */
export function normalizeVault(raw: unknown): EscrowLedger | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = (raw as Record<string, unknown>).data ?? raw;
  const vault = body as Record<string, unknown>;
  const address = toStr(vault.escrowAddress);
  if (!address) return null;

  const activity = Array.isArray(vault.activity) ? (vault.activity as Record<string, unknown>[]) : [];
  const last = activity.length > 0 ? activity[activity.length - 1] : null;

  return {
    address,
    balance: toNumber(vault.balance),
    totalDeposited: toNumber(vault.totalDeposited),
    totalWithdrawn: toNumber(vault.totalWithdrawn),
    depositCount: toNumber(vault.totalDeposits),
    withdrawalCount: toNumber(vault.totalWithdrawals),
    symbol: toStr(vault.symbol),
    mintAddress: toStr(vault.mintAddress),
    isAccountClosed: toBool(vault.isAccountClosed),
    lastActivityAt: last ? toIsoFromUnix((last as Record<string, unknown>).timestamp) : null,
    lastActivityType: last ? toStr((last as Record<string, unknown>).type) : null,
    source: 'api.gib.work/vaults',
  };
}

/**
 * Resolve the escrow token account for a bounty.
 *
 * This is the same public query the bounty detail page performs in the browser:
 * a JSON body with `{ id, type: "bounty" }`, no authentication, no wallet and no
 * signing. The endpoint answers with the vault ledger (escrow address, balances,
 * deposit/withdraw activity). Nothing here writes to the chain.
 */
export async function fetchVault(
  bountyId: string,
  options: { url: string; timeoutMs: number; fetchImpl?: typeof fetch },
): Promise<VaultLookup> {
  try {
    const response = await fetchWithRetry(options.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: bountyId, type: 'bounty' }),
      timeoutMs: options.timeoutMs,
      retries: 1,
      fetchImpl: options.fetchImpl,
    });
    if (!response.ok) {
      return { ledger: null, error: `HTTP ${response.status}`, httpStatus: response.status };
    }
    const payload = (await response.json()) as unknown;
    const ledger = normalizeVault(payload);
    return { ledger, error: ledger ? null : 'vault payload had no escrowAddress', httpStatus: response.status };
  } catch (error) {
    const status = error instanceof HttpError ? error.status : null;
    return { ledger: null, error: errorMessage(error), httpStatus: status };
  }
}
