import type { Bounty, EscrowVerification, Snapshot } from '../types.js';
import { emptyLedger } from './normalize.js';
import type { RpcClient } from './solana.js';
import { errorMessage, nowIso } from './util.js';
import { fetchVault } from './vaults.js';

export interface VerifyOptions {
  rpcClient: RpcClient | null;
  vaultUrl: string | null;
  vaultLookup: boolean;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  now: Date;
  /** Offline replay: keep an existing verification instead of contacting the network. */
  reuseRecorded: boolean;
}

const BALANCE_TOLERANCE = 1e-6;

function sameSymbol(a: string | null, b: string | null): boolean | null {
  if (!a || !b) return null;
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

function balancesMatch(a: number, b: number): boolean {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= Math.max(BALANCE_TOLERANCE, scale * 1e-9);
}

const STABLE_HINTS = ['USDC', 'USDT', 'PYUSD', 'USDG', 'USDS'];

function emptyVerification(partial: Partial<EscrowVerification> & { status: EscrowVerification['status'] }): EscrowVerification {
  return {
    evidence: 'none',
    checkedAt: null,
    escrowAddress: null,
    rpcEndpoint: null,
    slot: null,
    platformLedgerBalance: null,
    platformLedgerMint: null,
    platformLedgerSymbol: null,
    onchainAmount: null,
    onchainRawAmount: null,
    onchainDecimals: null,
    onchainMint: null,
    onchainOwner: null,
    mintMatchesLedger: null,
    assetMatchesAdvertised: null,
    coverage: null,
    flags: [],
    reason: null,
    ...partial,
  };
}

/**
 * Compare what the platform says is escrowed with what the Solana token account
 * actually holds. Verification is conservative: a failed RPC call degrades to
 * `unknown`, never to a guessed number.
 */
export async function verifyBounty(bounty: Bounty, options: VerifyOptions): Promise<Bounty> {
  /**
   * Offline replay: keep the verification the snapshot already carries (recorded
   * evidence from a fixture, or a live check performed when that snapshot was
   * captured). Nothing is guessed and no request is made.
   */
  if (options.reuseRecorded && bounty.verification) {
    return bounty;
  }

  const flags: string[] = [];
  let ledger = bounty.ledger ?? emptyLedger();

  // 1) Resolve the escrow token account.
  if (!ledger.address && options.vaultLookup && options.vaultUrl) {
    const lookup = await fetchVault(bounty.id, {
      url: options.vaultUrl,
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
    });
    if (lookup.ledger) {
      ledger = lookup.ledger;
    } else {
      flags.push('vault_lookup_failed');
      return {
        ...bounty,
        ledger,
        verification: emptyVerification({
          status: 'unknown',
          checkedAt: nowIso(options.now),
          reason: `vault lookup failed: ${lookup.error ?? 'unknown error'}`,
          flags,
        }),
      };
    }
  }

  if (!ledger.address) {
    return {
      ...bounty,
      ledger,
      verification: emptyVerification({
        status: 'unknown',
        checkedAt: nowIso(options.now),
        reason: 'escrow address could not be resolved for this bounty',
        flags: ['escrow_address_unknown'],
      }),
    };
  }

  // 2) Read the account on-chain.
  const base = {
    checkedAt: nowIso(options.now),
    escrowAddress: ledger.address,
    platformLedgerBalance: ledger.balance,
    platformLedgerMint: ledger.mintAddress,
    platformLedgerSymbol: ledger.symbol,
  };

  if (!options.rpcClient) {
    return {
      ...bounty,
      ledger,
      verification: emptyVerification({
        status: 'unknown',
        ...base,
        reason: 'Solana RPC disabled (offline run); escrow not re-checked',
        flags: ['rpc_disabled'],
      }),
    };
  }

  const rpcClient = options.rpcClient;
  let onchain: Awaited<ReturnType<RpcClient['getTokenAccount']>> = null;
  let rpcError: string | null = null;
  try {
    onchain = await rpcClient.getTokenAccount(ledger.address);
  } catch (error) {
    const primaryMessage = errorMessage(error);
    try {
      const balance = await rpcClient.getTokenAccountBalance(ledger.address);
      if (balance) {
        onchain = {
          address: ledger.address,
          mint: null,
          owner: null,
          tokenProgram: null,
          amount: balance.amount,
          decimals: balance.decimals,
          uiAmount: balance.uiAmount,
          slot: balance.slot,
        };
        flags.push('balance_only');
      } else {
        rpcError = primaryMessage;
      }
    } catch (fallbackError) {
      rpcError = `${primaryMessage} / getTokenAccountBalance: ${errorMessage(fallbackError)}`;
    }
  }

  if (rpcError) {
    return {
      ...bounty,
      ledger,
      verification: emptyVerification({
        status: 'unknown',
        ...base,
        rpcEndpoint: rpcClient.endpoint,
        reason: `rpc_error: ${rpcError}`,
        flags: [...flags, 'rpc_error'],
      }),
    };
  }

  if (!onchain) {
    // The escrow token account does not exist on-chain (or was closed).
    return {
      ...bounty,
      ledger,
      verification: emptyVerification({
        status: 'unknown',
        ...base,
        rpcEndpoint: rpcClient.endpoint,
        reason: 'escrow token account not found on-chain (closed, or address not yet resolvable)',
        flags: [...flags, 'escrow_account_not_found'],
      }),
    };
  }

  const verification: EscrowVerification = emptyVerification({
    status: 'unknown',
    ...base,
    evidence: 'live',
    rpcEndpoint: rpcClient.endpoint,
    slot: onchain.slot,
    onchainAmount: onchain.uiAmount,
    onchainRawAmount: onchain.amount,
    onchainDecimals: onchain.decimals,
    onchainMint: onchain.mint,
    onchainOwner: onchain.owner,
    flags,
  });

  // 3) Ledger vs chain.
  const mintMatch = ledger.mintAddress && onchain.mint ? ledger.mintAddress === onchain.mint : null;
  verification.mintMatchesLedger = mintMatch;
  if (mintMatch === false) flags.push('mint_mismatch');

  let status: EscrowVerification['status'];
  if (ledger.balance === null) {
    flags.push('ledger_unavailable');
    status = onchain.uiAmount === null ? 'unknown' : 'verified';
    verification.reason = 'platform ledger balance unavailable; verified against the on-chain token account only';
  } else if (onchain.uiAmount === null) {
    status = 'unknown';
    verification.reason = 'on-chain balance could not be parsed';
  } else if (balancesMatch(ledger.balance, onchain.uiAmount)) {
    status = 'verified';
  } else {
    status = 'mismatch';
    flags.push('ledger_mismatch');
    verification.reason = `platform ledger reports ${ledger.balance} but the escrow token account holds ${onchain.uiAmount}`;
  }
  if (mintMatch === false && status === 'verified') {
    status = 'mismatch';
    verification.reason = 'escrow token account mint does not match the advertised mint';
  }
  verification.status = status;

  // 4) Advertised pool vs escrow contents.
  const advertisedSymbol = bounty.asset.symbol;
  const escrowSymbol = ledger.symbol;
  const symbolMatch = sameSymbol(advertisedSymbol, escrowSymbol);
  verification.assetMatchesAdvertised = symbolMatch;
  if (symbolMatch === false) flags.push('asset_label_mismatch');

  if (bounty.advertisedPool !== null && bounty.advertisedPool > 0 && onchain.uiAmount !== null && symbolMatch !== false) {
    const coverage = onchain.uiAmount / bounty.advertisedPool;
    verification.coverage = coverage;
    if (coverage < 0.999) flags.push('coverage_partial');
    if (coverage > 1.001) flags.push('coverage_over');
  }

  if (STABLE_HINTS.some((hint) => hint !== advertisedSymbol.toUpperCase() && bounty.title.toUpperCase().includes(hint))) {
    flags.push('title_asset_hint_mismatch');
  }

  verification.flags = Array.from(new Set(flags));
  return { ...bounty, ledger, verification };
}

export interface VerifySummary {
  checked: number;
  verified: number;
  mismatch: number;
  unknown: number;
}

/** Verify every bounty in a snapshot (sequentially, so a public RPC is not hammered). */
export async function verifySnapshot(
  snapshot: Snapshot,
  options: VerifyOptions,
): Promise<{ snapshot: Snapshot; summary: VerifySummary }> {
  const bounties: Bounty[] = [];
  for (const bounty of snapshot.bounties) {
    bounties.push(await verifyBounty(bounty, options));
  }
  const summary: VerifySummary = {
    checked: bounties.length,
    verified: bounties.filter((b) => b.verification?.status === 'verified').length,
    mismatch: bounties.filter((b) => b.verification?.status === 'mismatch').length,
    unknown: bounties.filter((b) => !b.verification || b.verification.status === 'unknown').length,
  };
  return {
    snapshot: {
      ...snapshot,
      source: { ...snapshot.source, rpcEndpoint: options.rpcClient?.endpoint ?? snapshot.source.rpcEndpoint },
      bounties,
    },
    summary,
  };
}
